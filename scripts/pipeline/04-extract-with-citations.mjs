/**
 * Stage 4: Citation-grounded extraction with Claude Haiku 4.5 or Gemini 2.5 Flash.
 *
 * THIS IS THE ANTI-HALLUCINATION CORE.
 *
 * For each gym in 03-scrape-index.json:
 *   1. Concatenate scraped pages (with source URL headers)
 *   2. Call the LLM with strict citation rules from pipeline.config.mjs
 *   3. Parse JSON response
 *   4. VERIFY: every entry's source_quote must appear verbatim in scraped text.
 *      Entries failing verification are REJECTED.
 *   5. Rejected entries are re-prompted with Anthropic (hybrid mode) or same provider.
 *   6. Save verified entries + rejection log
 *
 * Output:
 *   data/04-extracted-verified.json    — gyms with at least 1 verified entry
 *   data/04-extracted-raw.json         — full raw model output (for debugging)
 *   data/04-extraction-failures.json   — gyms where extraction failed entirely
 *   data/04-rejected-entries.json      — entries the verifier threw out
 *
 * Run:
 *   source scripts/run-geocoding.sh
 *   node scripts/pipeline/04-extract-with-citations.mjs --provider=gemini   # free, default
 *   node scripts/pipeline/04-extract-with-citations.mjs --provider=anthropic # Haiku 4.5
 *   node scripts/pipeline/04-extract-with-citations.mjs --test
 *   node scripts/pipeline/04-extract-with-citations.mjs --limit=50
 *
 * Providers:
 *   gemini    — Gemini 2.5 Flash (free tier, up to 4500 req/day with 3 keys)
 *   anthropic — Claude Haiku 4.5 (~$0.004/gym, faster, best quality)
 *
 * Key rotation: set GEMINI_API_KEY_1, _2, _3 in run-geocoding.sh for 3× daily limit.
 * Re-extract pass always uses Anthropic when available (best at citation correction).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { config } from './pipeline.config.mjs';
import Anthropic from '@anthropic-ai/sdk';

// ── Provider setup ────────────────────────────────────────────────────────────
const PROVIDER = (process.argv.find(a => a.startsWith('--provider='))?.split('=')[1] || 'gemini').toLowerCase();

// Anthropic (used for re-extract pass in all modes, and primary in anthropic mode)
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

// Gemini key rotation — load up to 3 keys, round-robin
const geminiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean);
// Fall back to single GEMINI_API_KEY if numbered ones not set
if (!geminiKeys.length && process.env.GEMINI_API_KEY) geminiKeys.push(process.env.GEMINI_API_KEY);

let geminiKeyIndex = 0;
const geminiExhaustedKeys = new Set(); // indices of keys that hit their daily limit
let geminiAllExhausted = false;

function nextGeminiKey() {
  for (let i = 0; i < geminiKeys.length; i++) {
    const idx = (geminiKeyIndex + i) % geminiKeys.length;
    if (!geminiExhaustedKeys.has(idx)) {
      geminiKeyIndex = (idx + 1) % geminiKeys.length;
      return { key: geminiKeys[idx], idx };
    }
  }
  return null; // all keys daily-exhausted
}

function parseGemini429(errBody) {
  try {
    const violations = errBody?.error?.details
      ?.find(d => d['@type']?.includes('QuotaFailure'))?.violations || [];
    const isDaily = violations.some(v => v.quotaId?.includes('PerDay'));
    const match = errBody?.error?.message?.match(/retry in ([\d.]+)s/);
    const retryMs = match ? parseFloat(match[1]) * 1000 : 60000;
    return { isDaily, retryMs };
  } catch { return { isDaily: false, retryMs: 60000 }; }
}

if (PROVIDER === 'gemini' && !geminiKeys.length) {
  console.error('Error: no Gemini API keys found. Set GEMINI_API_KEY_1 (or GEMINI_API_KEY) in run-geocoding.sh');
  process.exit(1);
}
if (PROVIDER === 'anthropic' && !anthropic) {
  console.error('Error: ANTHROPIC_API_KEY not set. Run: source scripts/run-geocoding.sh');
  process.exit(1);
}

const GEMINI_MODEL = 'gemini-2.5-flash';

// ── Args ─────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const LIMIT = args.limit ? parseInt(args.limit) : Infinity;
const OFFSET = args.offset ? parseInt(args.offset) : 0;
const TEST = !!args.test;
const BJJ_ONLY = !!args['bjj-only'];
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency) : 16;
const MAX_INPUT_CHARS = args.maxchars ? parseInt(args.maxchars) : 40000; // ~10k tokens

// ── Load Stage 3 output ──────────────────────────────────────────────────────
const indexPath = 'scripts/pipeline/data/03-scrape-index.json';
if (!existsSync(indexPath)) {
  console.error(`Error: ${indexPath} not found. Run Stage 3 first.`);
  process.exit(1);
}
const scrapeIndex = JSON.parse(readFileSync(indexPath, 'utf8'));

let gymIds = Object.keys(scrapeIndex);

// ── Optional BJJ-only filter (v1 scope: ship BJJ first) ──────────────────────
if (BJJ_ONLY) {
  const raw = readFileSync('lib/data.ts', 'utf8');
  const pattern = /export const \w+: Gym\[\] = \[/g;
  const allGyms = [];
  let m;
  while ((m = pattern.exec(raw)) !== null) {
    const s = m.index + m[0].length - 1;
    const e = raw.indexOf('\n];', s);
    if (e === -1) continue;
    try { allGyms.push(...JSON.parse(raw.slice(s, e + 2))); } catch {}
  }
  const bjjIds = new Set(
    allGyms
      .filter(g => (g.open_mats || []).some(o => /bjj/.test(o.discipline || '')))
      .map(g => String(g.id))
  );
  const before = gymIds.length;
  gymIds = gymIds.filter(id => bjjIds.has(id));
  console.log(`[bjj-only] filtered ${before} → ${gymIds.length} BJJ gyms`);
}

if (args.ids) {
  const wanted = new Set(String(args.ids).split(',').map(s => s.trim()));
  gymIds = gymIds.filter(id => wanted.has(id));
  console.log(`[--ids filter] kept ${gymIds.length}/${wanted.size} requested gyms`);
}

const subset = TEST ? gymIds.slice(0, 5) : gymIds.slice(OFFSET, OFFSET + LIMIT);

const providerLabel = PROVIDER === 'gemini'
  ? `Gemini 2.5 Flash (${geminiKeys.length} key${geminiKeys.length > 1 ? 's' : ''}, ~${geminiKeys.length * 1500}/day free${anthropic ? ', Anthropic fallback' : ''})`
  : 'Claude Haiku 4.5 (Anthropic)';
console.log(`─── Stage 4: Citation-grounded extraction (${providerLabel}) ───`);
console.log(`Model:                    ${config.extractionModel}`);
console.log(`Gyms with scraped pages:  ${gymIds.length}`);
console.log(`Will process:             ${subset.length}`);
console.log(`Concurrency:              ${CONCURRENCY}`);
console.log(`Max input chars/gym:      ${MAX_INPUT_CHARS}`);
if (TEST) console.log('[TEST mode — 5 gyms only, verbose]');
console.log('');

// ── Pre-filter: keep only schedule-relevant snippets ─────────────────────────
// Massive cost win — drops avg input from ~10k tokens to ~2k tokens.
// We keep any line containing a day-of-week OR a time pattern, plus 1 line of
// context above and below. Pages with zero matches return '' (caller skips API).
const DAY_RE = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|s)?\b/i;
const TIME_RE = /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i;

function filterToScheduleSnippets(text) {
  const lines = text.split('\n');
  const keep = new Set();
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (DAY_RE.test(ln) || TIME_RE.test(ln)) {
      // include 1 line of context on each side
      keep.add(Math.max(0, i - 1));
      keep.add(i);
      keep.add(Math.min(lines.length - 1, i + 1));
    }
  }
  if (keep.size === 0) return '';
  const sorted = [...keep].sort((a, b) => a - b);
  const out = [];
  let prev = -2;
  for (const i of sorted) {
    if (i > prev + 1) out.push('...'); // gap marker
    out.push(lines[i]);
    prev = i;
  }
  return out.join('\n').trim();
}

// ── Build the corpus for one gym ─────────────────────────────────────────────
// Returns { promptCorpus, verifyCorpus, pageBodies }
//   promptCorpus  — filtered snippets sent to the model (cheap)
//   verifyCorpus  — FULL untruncated concatenation of all pages, used by the
//                   verifier so quotes that span filter gaps still match
//   pageBodies    — per-page raw text, used to attribute quote → source URL
function buildCorpus(gymId) {
  const entry = scrapeIndex[gymId];
  if (!entry?.pages?.length) return null;

  const sections = [];
  const verifySections = [];
  const pageBodies = [];
  let totalChars = 0;

  for (const p of entry.pages) {
    if (!existsSync(p.file)) continue;
    let body = readFileSync(p.file, 'utf8');
    body = body.replace(/^---\n[\s\S]*?\n---\n\n?/, '');

    pageBodies.push({ url: p.url, body });
    verifySections.push(`\n=== PAGE: ${p.url} ===\n${body}\n`);

    // Pre-filter to schedule-relevant snippets BEFORE sending to the model.
    const filtered = filterToScheduleSnippets(body);
    if (!filtered) continue;

    const block = `\n=== PAGE: ${p.url} ===\n${filtered}\n`;
    if (totalChars + block.length > MAX_INPUT_CHARS) {
      sections.push(block.slice(0, MAX_INPUT_CHARS - totalChars));
      totalChars = MAX_INPUT_CHARS;
      break;
    }
    sections.push(block);
    totalChars += block.length;
  }

  return {
    promptCorpus: sections.join('\n'),
    verifyCorpus: verifySections.join('\n'),
    pageBodies,
  };
}

// ── Verifier ─────────────────────────────────────────────────────────────────
function normalizeForMatch(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Strip non-alphanumeric runs to a single space — recovers from punctuation
// drift like the model writing "Mon - 6:00pm" when source says "Mon — 6:00pm".
function normalizeAggressive(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Token-overlap fallback: split needle into tokens; require ≥85% to appear
// in haystack-as-token-set. Catches faithful paraphrase, blocks hallucinations
// (which usually invent days/times absent from the source).
function tokenOverlapMatch(needle, haystack) {
  const toks = (s) => new Set(
    normalizeAggressive(s).split(' ').filter(t => t.length >= 2)
  );
  const n = toks(needle);
  if (n.size < 4) return false; // require enough signal to be meaningful
  const h = toks(haystack);
  let hits = 0;
  for (const t of n) if (h.has(t)) hits++;
  return hits / n.size >= 0.85;
}

function verifyEntry(entry, verifyCorpus) {
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'not_object' };
  if (!entry.source_quote || typeof entry.source_quote !== 'string') {
    return { ok: false, reason: 'missing_source_quote' };
  }
  if (!entry.day || !entry.start_time) {
    return { ok: false, reason: 'missing_required_fields' };
  }
  const quote = entry.source_quote;
  if (quote.length < 10) return { ok: false, reason: 'quote_too_short' };
  if (quote.length > 300) return { ok: false, reason: 'quote_too_long' };

  // Tier 1: exact (whitespace-normalized) substring against FULL corpus.
  const hay1 = normalizeForMatch(verifyCorpus);
  const needle1 = normalizeForMatch(quote);
  if (hay1.includes(needle1)) return { ok: true, match: 'exact' };

  // Tier 2: punctuation-stripped substring.
  const hay2 = normalizeAggressive(verifyCorpus);
  const needle2 = normalizeAggressive(quote);
  if (needle2.length >= 8 && hay2.includes(needle2)) return { ok: true, match: 'punct' };

  // Tier 3: token-overlap (≥85%).
  if (tokenOverlapMatch(quote, verifyCorpus)) return { ok: true, match: 'fuzzy' };

  return { ok: false, reason: 'quote_not_in_source' };
}

// ── JSON parse helper (shared) ────────────────────────────────────────────────
function parseJsonResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  if (start !== -1) {
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {} }
  }
  return null;
}

// ── Gemini extraction ─────────────────────────────────────────────────────────
async function extractFromCorpusGemini(corpus) {
  if (geminiAllExhausted) return { error: 'gemini_all_keys_exhausted' };

  const keyInfo = nextGeminiKey();
  if (!keyInfo) {
    geminiAllExhausted = true;
    return { error: 'gemini_all_keys_exhausted' };
  }

  const { key, idx } = keyInfo;
  const systemText = `${config.extractionInstructions}\n\n${config.extractionSchemaDescription}\n\nReturn ONLY valid JSON. No prose, no code fences.`;
  const userText = `Gym website content (multiple pages, separated by === PAGE: <url> === markers; "..." indicates omitted irrelevant lines):\n\n${corpus}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16000, temperature: 0.1 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const errBody = await res.json().catch(() => null);
    const { isDaily, retryMs } = parseGemini429(errBody);
    if (isDaily) {
      // Daily quota hit — mark this key exhausted, try next key
      geminiExhaustedKeys.add(idx);
      if (geminiExhaustedKeys.size >= geminiKeys.length) {
        geminiAllExhausted = true;
        return { error: 'gemini_all_keys_exhausted' };
      }
      return extractFromCorpusGemini(corpus); // retry with next available key
    } else {
      // RPM throttle — wait the suggested time, then retry same key
      await new Promise(r => setTimeout(r, Math.min(retryMs, 60000)));
      return extractFromCorpusGemini(corpus);
    }
  }

  if (!res.ok) {
    const err = await res.text();
    return { error: `gemini_api_error: ${res.status} ${err.slice(0, 200)}` };
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) return { error: 'gemini_empty_response' };

  const parsed = parseJsonResponse(text);
  if (!parsed) return { error: 'json_parse_failed', raw: text, parse_error: 'no_balanced_json' };

  const usage = {
    input_tokens: data.usageMetadata?.promptTokenCount || 0,
    output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
  };
  return { raw: parsed, usage, provider: 'gemini' };
}

// ── Anthropic extraction ──────────────────────────────────────────────────────
// Cost optimization: prompt caching on the system prompt + schema. The
// instructions+schema are identical every call (~600 tokens) — caching drops
// repeated cost to 10% of base.
async function extractFromCorpusAnthropic(corpus) {
  const cachedSystemBlock = {
    type: 'text',
    text: `${config.extractionInstructions}\n\n${config.extractionSchemaDescription}\n\nReturn ONLY valid JSON. No prose, no code fences.`,
    cache_control: { type: 'ephemeral' },
  };
  const userPrompt =
    `Gym website content (multiple pages, separated by === PAGE: <url> === markers; "..." indicates omitted irrelevant lines):\n\n` +
    corpus;

  const res = await anthropic.messages.create({
    model: config.extractionModel,
    max_tokens: 16000,
    system: [cachedSystemBlock],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = res.content.filter(c => c.type === 'text').map(c => c.text).join('');
  const parsed = parseJsonResponse(text);
  if (!parsed) return { error: 'json_parse_failed', raw: text, parse_error: 'no_balanced_json' };
  return { raw: parsed, usage: res.usage, provider: 'anthropic' };
}

async function extractFromCorpus(corpus) {
  if (PROVIDER === 'anthropic') return extractFromCorpusAnthropic(corpus);

  // Gemini default: try Gemini keys, auto-fall back to Anthropic when all exhausted
  const result = await extractFromCorpusGemini(corpus);
  if (result.error === 'gemini_all_keys_exhausted') {
    if (anthropic) {
      process.stdout.write('\n  [!] All Gemini keys exhausted — switching to Anthropic for remaining gyms\n');
      return extractFromCorpusAnthropic(corpus);
    }
    return { error: 'all_providers_exhausted' };
  }
  return result;
}

// ── Re-prompt: ask the model to fix unverifiable quotes ─────────────────────
// One follow-up call per gym that has rejected entries. We hand the model
// back its rejected entries with the day/time intact and the corpus, and ask
// it to either replace the quote with one that literally appears in the text
// or omit the entry. Costs ~20% extra tokens, recovers about half of the
// "quote_not_in_source" rejections in practice.
async function reExtractFailed(rejectedEntries, promptCorpus) {
  if (!rejectedEntries.length) return [];

  const minimal = rejectedEntries.map(e => ({
    day: e.day, start_time: e.start_time, end_time: e.end_time ?? null,
    class_name: e.class_name ?? null, discipline: e.discipline ?? null,
    is_open_mat: !!e.is_open_mat, is_kids: !!e.is_kids,
  }));

  const system = {
    type: 'text',
    text:
      'You are correcting source quotes for schedule entries that failed verification. ' +
      'For EACH entry, find a verbatim 10-200 character snippet from the page content that proves the day + time. ' +
      'The snippet MUST appear word-for-word (or trivially close — same words, same order) in the page content. ' +
      'If you cannot find such a snippet, OMIT that entry entirely. Do not invent. ' +
      'Return JSON: { "schedule": [...] } where each entry preserves the original day/time/discipline/etc. and adds a real source_quote.',
    cache_control: { type: 'ephemeral' },
  };

  const user =
    `PAGE CONTENT:\n${promptCorpus}\n\n` +
    `ENTRIES NEEDING REAL QUOTES:\n${JSON.stringify(minimal, null, 2)}\n\n` +
    `Return ONLY valid JSON, no prose.`;

  let res;
  try {
    res = await anthropic.messages.create({
      model: config.extractionModel,
      max_tokens: 8000,
      system: [system],
      messages: [{ role: 'user', content: user }],
    });
  } catch { return []; }

  const text = res.content.filter(c => c.type === 'text').map(c => c.text).join('');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }
  }
  return Array.isArray(parsed?.schedule) ? { entries: parsed.schedule, usage: res.usage } : [];
}

// ── Per-gym pipeline ─────────────────────────────────────────────────────────
async function processGym(gymId) {
  const corpora = buildCorpus(gymId);
  if (!corpora || corpora.promptCorpus.length < 100) return { error: 'no_corpus' };
  const { promptCorpus, verifyCorpus, pageBodies } = corpora;

  let result;
  try { result = await extractFromCorpus(promptCorpus); }
  catch (e) { return { error: `api_error: ${e.message}` }; }

  if (result.error) return result;

  const rawEntries = Array.isArray(result.raw?.schedule) ? result.raw.schedule : [];
  const verified = [];
  const rejected = [];
  let totalUsage = result.usage || {};

  const attribute = (entry) => {
    const needles = [
      normalizeForMatch(entry.source_quote),
      normalizeAggressive(entry.source_quote),
    ];
    for (const p of pageBodies) {
      const hay1 = normalizeForMatch(p.body);
      const hay2 = normalizeAggressive(p.body);
      if (hay1.includes(needles[0]) || (needles[1].length >= 8 && hay2.includes(needles[1]))) {
        return p.url;
      }
    }
    return pageBodies[0]?.url || null;
  };

  const acceptOrReject = (entry, target) => {
    const v = verifyEntry(entry, verifyCorpus);
    if (v.ok) {
      verified.push({
        ...entry,
        verified: true,
        verify_match: v.match,
        source_url: attribute(entry),
        verified_at: new Date().toISOString(),
      });
    } else {
      target.push({ entry, reason: v.reason });
    }
  };

  for (const entry of rawEntries) acceptOrReject(entry, rejected);

  // Self-verification re-prompt: only if there were rejections AND the gym
  // had no verified entries (or fewer than the rejection count). Skip when
  // we already have plenty of good data.
  if (rejected.length >= 2 && verified.length < rejected.length) {
    const re = await reExtractFailed(rejected.map(r => r.entry), promptCorpus);
    const reEntries = Array.isArray(re) ? [] : re.entries;
    if (re.usage) {
      totalUsage = {
        input_tokens: (totalUsage.input_tokens || 0) + (re.usage.input_tokens || 0),
        output_tokens: (totalUsage.output_tokens || 0) + (re.usage.output_tokens || 0),
      };
    }
    const recovered = [];
    for (const entry of reEntries) acceptOrReject(entry, recovered);
    // recovered entries that STILL fail verification stay rejected
    for (const r of recovered) rejected.push({ ...r, reason: `re_${r.reason}` });
  }

  return { raw: rawEntries, verified, rejected, usage: totalUsage };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const verifiedAll = {};
  const rawAll = {};
  const failures = {};
  const rejectedAll = {};

  let processed = 0, withVerified = 0, failed = 0;
  let inputTokens = 0, outputTokens = 0;

  for (let i = 0; i < subset.length; i += CONCURRENCY) {
    const batch = subset.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (gymId) => {
      try {
        const r = await processGym(gymId);
        if (r.error) {
          failures[gymId] = { error: r.error, raw: r.raw, parse_error: r.parse_error };
          failed++;
          if (TEST) {
            console.log(`  [${gymId}] FAILED: ${r.error}`);
            if (r.raw) console.log(`     raw: ${String(r.raw).slice(0, 400)}`);
          }
        } else {
          rawAll[gymId] = r.raw;
          if (r.usage) {
            inputTokens += r.usage.input_tokens || 0;
            outputTokens += r.usage.output_tokens || 0;
          }
          if (r.rejected.length > 0) rejectedAll[gymId] = r.rejected;
          if (r.verified.length > 0) {
            verifiedAll[gymId] = { schedule: r.verified };
            withVerified++;
            if (TEST) {
              console.log(`  [${gymId}] ✓ ${r.verified.length} verified, ${r.rejected.length} rejected`);
              for (const v of r.verified) {
                console.log(`     ✓ ${v.day} ${v.start_time}-${v.end_time} (${v.discipline}) — "${v.source_quote.slice(0, 60)}..."`);
              }
              for (const rj of r.rejected) {
                console.log(`     ✗ rejected (${rj.reason}): ${JSON.stringify(rj.entry).slice(0, 80)}...`);
              }
            }
          } else {
            failures[gymId] = { error: 'no_verified_entries', raw_count: r.raw.length, rejected_count: r.rejected.length };
            failed++;
            if (TEST) console.log(`  [${gymId}] no verified entries (${r.raw.length} raw, ${r.rejected.length} rejected)`);
          }
        }
      } catch (e) {
        failures[gymId] = { error: e.message };
        failed++;
      }
      processed++;
    }));

    if (!TEST) {
      // Gemini is free; only count Anthropic re-extract tokens toward cost
      const cost = PROVIDER === 'gemini'
        ? (inputTokens / 1e6) * 1.0 + (outputTokens / 1e6) * 5.0  // re-extract only
        : (inputTokens / 1e6) * 1.0 + (outputTokens / 1e6) * 5.0;
      const costStr = PROVIDER === 'gemini' ? `~$${cost.toFixed(2)} (re-extract only)` : `~$${cost.toFixed(2)}`;
      process.stdout.write(`\r  ${processed}/${subset.length} — verified ${withVerified}, failed ${failed}, ${costStr}  `);
    }
  }
  if (!TEST) process.stdout.write('\n');

  // ── Save (merged with prior runs) ───────────────────────────────────────────
  const merge = (path, fresh, removeKeys = []) => {
    let merged = {};
    if (existsSync(path)) {
      try { merged = JSON.parse(readFileSync(path, 'utf8')); }
      catch { /* ignore */ }
    }
    for (const k of removeKeys) delete merged[k];
    Object.assign(merged, fresh);
    writeFileSync(path, JSON.stringify(merged, null, 2));
    return Object.keys(merged).length;
  };

  // Gyms that succeeded this run should be removed from the failures file.
  const successIds = Object.keys(verifiedAll);
  const tV = merge(config.paths.extractedVerified, verifiedAll);
  const tR = merge(config.paths.extractedRaw, rawAll);
  const tF = merge(config.paths.extractionFailures, failures, successIds);
  const tRej = merge('scripts/pipeline/data/04-rejected-entries.json', rejectedAll);

  console.log(`\nWrote ${tV} entries to ${config.paths.extractedVerified}`);
  console.log(`Wrote ${tR} entries to ${config.paths.extractedRaw}`);
  console.log(`Wrote ${tF} entries to ${config.paths.extractionFailures}`);
  console.log(`Wrote ${tRej} entries to scripts/pipeline/data/04-rejected-entries.json`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const cost = (inputTokens / 1e6) * 1.0 + (outputTokens / 1e6) * 5.0;
  console.log('\nSummary:');
  console.log(`  Processed:        ${processed}`);
  console.log(`  With verified:    ${withVerified}`);
  console.log(`  Failed:           ${failed}`);
  console.log(`  Input tokens:     ${inputTokens.toLocaleString()}`);
  console.log(`  Output tokens:    ${outputTokens.toLocaleString()}`);
  console.log(`  Estimated cost:   $${cost.toFixed(4)}`);
  if (processed > 0) console.log(`  Per-gym avg:      $${(cost / processed).toFixed(4)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
