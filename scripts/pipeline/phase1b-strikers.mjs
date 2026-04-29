/**
 * Phase 1 enrichment runner — top US BJJ cities + 3 international tourist hubs.
 *
 * 4 stages, each checkpointed so a crash mid-run can resume:
 *   1. Discover  — Google Places searchText per city, dedupe by place_id
 *   2. Scrape    — Firecrawl map + scrape per gym (with fallback URLs)
 *   3. Extract   — Claude Haiku 4.5 with prompt caching, citation-grounded
 *   4. Apply     — Upsert verified output into Supabase gym_overrides
 *
 * Usage:
 *   node scripts/pipeline/phase1-run.mjs                  — full Phase 1 run
 *   node scripts/pipeline/phase1-run.mjs --stage=discover — Stage 1 only
 *   node scripts/pipeline/phase1-run.mjs --limit=10       — first 10 gyms only (smoke test)
 *   node scripts/pipeline/phase1-run.mjs --resume         — pick up where last run left off
 *
 * Outputs (data/phase1/):
 *   01-discovered.json   — { city: [...gyms] } per-city candidate lists
 *   02-scraped.json      — { gym_id: { markdown, url } }
 *   03-extracted.json    — { gym_id: { schedule, rejected } }
 *   04-applied.json      — { gym_id: 'ok' | error string }
 *   run.log              — append-only progress log
 *   run.cost.json        — running cost tracker (resets per run)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import FirecrawlApp from '@mendable/firecrawl-js';
import { createClient } from '@supabase/supabase-js';

// ── Load .env.local (last value wins for duplicates) ─────────────────
function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  const text = readFileSync('.env.local', 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) process.env[key] = val;
  }
}
loadEnvLocal();

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const STAGE_ARG = args.find(a => a.startsWith('--stage='))?.slice(8);
const LIMIT_ARG = parseInt(args.find(a => a.startsWith('--limit='))?.slice(8) ?? '0', 10);
const RESUME = args.includes('--resume');

// ── Cities config ───────────────────────────────────────────────────
const CITIES = [
  // Phase 1 cities — re-searching for striking/MMA gyms only
  { id: 'la',     name: 'Los Angeles',     state: 'CA', country: 'US', lat: 34.0522,  lng: -118.2437, radiusMeters: 50000 },
  { id: 'nyc',    name: 'New York',        state: 'NY', country: 'US', lat: 40.7128,  lng: -74.0060,  radiusMeters: 40000 },
  { id: 'miami',  name: 'Miami',           state: 'FL', country: 'US', lat: 25.7617,  lng: -80.1918,  radiusMeters: 50000 },
  { id: 'sd',     name: 'San Diego',       state: 'CA', country: 'US', lat: 32.7157,  lng: -117.1611, radiusMeters: 35000 },
  { id: 'tampa',  name: 'Tampa',           state: 'FL', country: 'US', lat: 27.9506,  lng: -82.4572,  radiusMeters: 50000 },
  { id: 'orl',    name: 'Orlando',         state: 'FL', country: 'US', lat: 28.5383,  lng: -81.3792,  radiusMeters: 35000 },
  { id: 'hou',    name: 'Houston',         state: 'TX', country: 'US', lat: 29.7604,  lng: -95.3698,  radiusMeters: 35000 },
  { id: 'chi',    name: 'Chicago',         state: 'IL', country: 'US', lat: 41.8781,  lng: -87.6298,  radiusMeters: 40000 },
  { id: 'aus',    name: 'Austin',          state: 'TX', country: 'US', lat: 30.2672,  lng: -97.7431,  radiusMeters: 30000 },
  { id: 'atl',    name: 'Atlanta',         state: 'GA', country: 'US', lat: 33.7490,  lng: -84.3880,  radiusMeters: 35000 },
  { id: 'lv',     name: 'Las Vegas',       state: 'NV', country: 'US', lat: 36.1699,  lng: -115.1398, radiusMeters: 30000 },
  { id: 'paris',  name: 'Paris',           state: '',   country: 'FR', lat: 48.8566,  lng: 2.3522,    radiusMeters: 30000 },
  { id: 'london', name: 'London',          state: '',   country: 'GB', lat: 51.5074,  lng: -0.1278,   radiusMeters: 30000 },
  { id: 'dubai',  name: 'Dubai',           state: '',   country: 'AE', lat: 25.2769,  lng: 55.2962,   radiusMeters: 35000 },
];

// Phase 1B — striking & MMA only (BJJ already covered in Phase 1).
// gym_overrides upserts will dedupe gyms that already had a Phase 1 row.
const QUERIES = [
  'muay thai gym',
  'kickboxing gym',
  'boxing gym',
  'MMA gym',
];

// ── Output paths ─────────────────────────────────────────────────────
const OUT_DIR = 'scripts/pipeline/data/phase1b';
mkdirSync(OUT_DIR, { recursive: true });
const PATHS = {
  discovered: `${OUT_DIR}/01-discovered.json`,
  scraped:    `${OUT_DIR}/02-scraped.json`,
  extracted:  `${OUT_DIR}/03-extracted.json`,
  applied:    `${OUT_DIR}/04-applied.json`,
  log:        `${OUT_DIR}/run.log`,
  cost:       `${OUT_DIR}/run.cost.json`,
};

const log = (...args) => {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  appendFileSync(PATHS.log, line + '\n');
};

// ── Cost tracker ─────────────────────────────────────────────────────
const cost = existsSync(PATHS.cost) && RESUME
  ? JSON.parse(readFileSync(PATHS.cost, 'utf8'))
  : { firecrawl_credits: 0, places_calls: 0, anthropic_input: 0, anthropic_output: 0, anthropic_cache_read: 0, anthropic_cache_write: 0 };
const saveCost = () => writeFileSync(PATHS.cost, JSON.stringify(cost, null, 2));

// Pricing (per MTok / per call / per credit)
const PRICE = {
  HAIKU_INPUT_PER_MTOK:       1.0,
  HAIKU_OUTPUT_PER_MTOK:      5.0,
  HAIKU_CACHE_WRITE_PER_MTOK: 1.25,
  HAIKU_CACHE_READ_PER_MTOK:  0.10,
  PLACES_PER_CALL:            0.017,
  FIRECRAWL_HOBBY_PER_CREDIT: 19 / 3000, // $19 for 3000 credits
};

function totalCostUsd() {
  const a = (cost.anthropic_input        / 1_000_000) * PRICE.HAIKU_INPUT_PER_MTOK;
  const b = (cost.anthropic_output       / 1_000_000) * PRICE.HAIKU_OUTPUT_PER_MTOK;
  const c = (cost.anthropic_cache_write  / 1_000_000) * PRICE.HAIKU_CACHE_WRITE_PER_MTOK;
  const d = (cost.anthropic_cache_read   / 1_000_000) * PRICE.HAIKU_CACHE_READ_PER_MTOK;
  const e = cost.places_calls           * PRICE.PLACES_PER_CALL;
  const f = cost.firecrawl_credits      * PRICE.FIRECRAWL_HOBBY_PER_CREDIT;
  return { anthropic: a + b + c + d, places: e, firecrawl: f, total: a + b + c + d + e + f };
}

// ── Concurrency helper ──────────────────────────────────────────────
async function runConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= items.length) return;
      try { results[i] = await fn(items[i], i); }
      catch (e) { results[i] = { __error: e.message }; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ─────────────────────────────────────────────────────────────────────
// STAGE 1 · Discover gyms via Google Places searchText
// ─────────────────────────────────────────────────────────────────────
async function placesSearchText({ query, lat, lng, radiusMeters, pageToken }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY missing');
  const body = {
    textQuery: query,
    locationBias: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
    },
    pageSize: 20,
  };
  if (pageToken) body.pageToken = pageToken;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.types,nextPageToken',
    },
    body: JSON.stringify(body),
  });
  cost.places_calls++;
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Places ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function discoverCity(city) {
  const seen = new Map(); // place_id -> gym
  for (const q of QUERIES) {
    let pageToken;
    let pageNum = 0;
    while (pageNum < 3) { // up to 3 pages per query (60 results)
      try {
        const data = await placesSearchText({
          query: q,
          lat: city.lat,
          lng: city.lng,
          radiusMeters: city.radiusMeters,
          pageToken,
        });
        for (const p of data.places ?? []) {
          if (!p.id || seen.has(p.id)) continue;
          seen.set(p.id, {
            place_id: p.id,
            name: p.displayName?.text ?? '',
            address: p.formattedAddress ?? '',
            lat: p.location?.latitude,
            lng: p.location?.longitude,
            website: p.websiteUri ?? null,
            phone: p.nationalPhoneNumber ?? null,
            types: p.types ?? [],
            city_id: city.id,
            city_name: city.name,
            country: city.country,
          });
        }
        pageToken = data.nextPageToken;
        pageNum++;
        if (!pageToken) break;
        await new Promise(r => setTimeout(r, 1500)); // pageToken needs a brief delay to be valid
      } catch (e) {
        log(`    discover ${city.id}/${q}: ${e.message}`);
        break;
      }
    }
  }
  return [...seen.values()];
}

async function stageDiscover() {
  log('═══ STAGE 1 · Discover ═══');
  const out = existsSync(PATHS.discovered) && RESUME
    ? JSON.parse(readFileSync(PATHS.discovered, 'utf8'))
    : {};

  for (const city of CITIES) {
    if (out[city.id] && out[city.id].length > 0) {
      log(`  ${city.id} (${city.name}): cached ${out[city.id].length} gyms`);
      continue;
    }
    log(`  ${city.id} (${city.name}): searching…`);
    const gyms = await discoverCity(city);
    out[city.id] = gyms;
    log(`    → ${gyms.length} unique gyms found`);
    writeFileSync(PATHS.discovered, JSON.stringify(out, null, 2));
    saveCost();
  }

  const total = Object.values(out).flat().length;
  log(`  TOTAL discovered: ${total} unique gyms across ${CITIES.length} cities`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// STAGE 2 · Firecrawl map + scrape
// ─────────────────────────────────────────────────────────────────────
function isLikelySchedulePath(url) {
  const p = url.toLowerCase();
  if (p.includes('schedule')) return 5;
  if (p.includes('open-mat') || p.includes('open_mat')) return 4;
  if (p.includes('class')) return 3;
  if (p.includes('training')) return 2;
  if (p.includes('about')) return 1;
  return 0;
}

async function scrapeGym(fc, gym) {
  if (!gym.website) return { skipped: 'no website' };
  let mapUrls = [gym.website];
  try {
    const mapRes = await fc.map(gym.website, { search: 'schedule', limit: 20 });
    cost.firecrawl_credits++;
    const links = mapRes?.links ?? mapRes?.data?.links ?? [];
    if (Array.isArray(links) && links.length > 0) {
      mapUrls = links.map(l => typeof l === 'string' ? l : (l.url ?? l));
    }
  } catch { /* fall through to root */ }

  const sorted = mapUrls
    .map(u => ({ url: u, score: isLikelySchedulePath(u) + (u === gym.website ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);

  // Try the top candidate; if markdown is sparse, try the runner-up
  for (const candidate of sorted.slice(0, 2)) {
    try {
      const scrape = await fc.scrape(candidate.url, {
        formats: ['markdown'],
        onlyMainContent: true,
      });
      cost.firecrawl_credits++;
      const md = scrape?.markdown ?? scrape?.data?.markdown ?? '';
      if (md.length >= 500) {
        return {
          url: candidate.url,
          markdown: md,
          title: scrape?.metadata?.title ?? scrape?.data?.metadata?.title ?? '',
        };
      }
    } catch (e) {
      // try next candidate
    }
  }
  return { skipped: 'sparse or scrape failed' };
}

async function stageScrape(discovered, limit = 0) {
  log('═══ STAGE 2 · Scrape (Firecrawl) ═══');
  const fc = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  const out = existsSync(PATHS.scraped) && RESUME
    ? JSON.parse(readFileSync(PATHS.scraped, 'utf8'))
    : {};

  let allGyms = Object.values(discovered).flat();
  if (limit > 0) allGyms = allGyms.slice(0, limit);

  let processed = 0;
  await runConcurrent(allGyms, 5, async (gym, i) => {
    if (out[gym.place_id]) return;
    const result = await scrapeGym(fc, gym);
    out[gym.place_id] = result;
    processed++;
    if (processed % 25 === 0) {
      log(`  scraped ${processed}/${allGyms.length}  · firecrawl credits: ${cost.firecrawl_credits}  · cost: $${totalCostUsd().total.toFixed(2)}`);
      writeFileSync(PATHS.scraped, JSON.stringify(out, null, 2));
      saveCost();
    }
  });

  writeFileSync(PATHS.scraped, JSON.stringify(out, null, 2));
  saveCost();
  const okCount = Object.values(out).filter(v => v.markdown).length;
  log(`  TOTAL scraped: ${okCount} gyms with markdown / ${allGyms.length} attempted`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// STAGE 3 · Claude Haiku extraction with prompt caching
// ─────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You extract martial arts class schedules from gym websites with strict citation rules.

For each class, output:
  - day_of_week: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  - start_time: "HH:MM" (24-hour)
  - end_time: "HH:MM" (24-hour, or null if not stated)
  - class_name: short name as given on the page
  - discipline: "bjj" | "nogi_bjj" | "gi_bjj" | "wrestling" | "judo" | "muay_thai" | "mma" | "kickboxing" | "boxing" | "karate" | "taekwondo"
  - is_open_mat: true if the class is described as "open mat" / "open mats" / "open training", false otherwise
  - is_kids: true if the class is for kids/youth, false otherwise
  - source_quote: the EXACT verbatim substring from the page that proves this class exists. Must be a continuous run of characters from the page (no paraphrasing, no edits).

Also extract these gym-level fields when explicitly visible on the page:
  - instagram_handle: the gym's Instagram URL or @handle if shown anywhere on the page
  - phone: the gym's phone number if shown on the page

CITATION RULE: source_quote MUST appear word-for-word in the page text. If you can't find an exact quote, OMIT the class. Don't guess. Don't paraphrase.

Output strictly valid JSON: { "schedule": [...], "instagram_handle": null | "...", "phone": null | "..." }
No markdown fences, no commentary. Just the JSON object.`;

function robustParseJson(text) {
  const stripped = text.replace(/^\s*```(?:json|JSON)?\s*|\s*```\s*$/g, '').trim();
  try { return JSON.parse(stripped); } catch { /* fall through */ }
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') inString = !inString;
    else if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
        }
      }
    }
  }
  return null;
}

function verifyCitations(schedule, pageMd) {
  const verified = [], rejected = [];
  for (const e of schedule) {
    const q = (e.source_quote ?? '').trim();
    if (!q) { rejected.push({ entry: e, reason: 'no source_quote' }); continue; }
    if (pageMd.includes(q)) verified.push(e);
    else rejected.push({ entry: e, reason: 'quote not in page' });
  }
  return { verified, rejected };
}

async function extractGym(client, gym, scraped) {
  const userPrompt = `Gym: ${gym.name}
Source URL: ${scraped.url}

Extract every regularly-scheduled class from the page below. Skip one-off events, seminars, and tournaments.

PAGE TEXT:
"""
${scraped.markdown.slice(0, 18000)}
"""`;

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    // Cache the system prompt — same across all 1,470 calls.
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  cost.anthropic_input        += resp.usage.input_tokens ?? 0;
  cost.anthropic_output       += resp.usage.output_tokens ?? 0;
  cost.anthropic_cache_read   += resp.usage.cache_read_input_tokens ?? 0;
  cost.anthropic_cache_write  += resp.usage.cache_creation_input_tokens ?? 0;

  const text = resp.content.find(b => b.type === 'text')?.text ?? '';
  const parsed = robustParseJson(text);
  if (!parsed) return { schedule: [], rejected: [], parseError: text.slice(0, 200) };

  const { verified, rejected } = verifyCitations(parsed.schedule ?? [], scraped.markdown);
  return {
    schedule: verified,
    rejected,
    instagram_handle: parsed.instagram_handle ?? null,
    page_phone: parsed.phone ?? null,
  };
}

async function stageExtract(discovered, scraped, limit = 0) {
  log('═══ STAGE 3 · Extract (Claude Haiku) ═══');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const out = existsSync(PATHS.extracted) && RESUME
    ? JSON.parse(readFileSync(PATHS.extracted, 'utf8'))
    : {};

  let allGyms = Object.values(discovered).flat();
  if (limit > 0) allGyms = allGyms.slice(0, limit);
  const work = allGyms.filter(g => scraped[g.place_id]?.markdown && !out[g.place_id]);

  let processed = 0;
  await runConcurrent(work, 5, async (gym) => {
    const sc = scraped[gym.place_id];
    try {
      const result = await extractGym(anthropic, gym, sc);
      out[gym.place_id] = result;
    } catch (e) {
      out[gym.place_id] = { schedule: [], rejected: [], error: e.message };
    }
    processed++;
    if (processed % 25 === 0) {
      log(`  extracted ${processed}/${work.length}  · LLM cost: $${(totalCostUsd().anthropic).toFixed(2)}  · total: $${totalCostUsd().total.toFixed(2)}`);
      writeFileSync(PATHS.extracted, JSON.stringify(out, null, 2));
      saveCost();
    }
  });

  writeFileSync(PATHS.extracted, JSON.stringify(out, null, 2));
  saveCost();
  const verifiedCount = Object.values(out).reduce((s, v) => s + (v.schedule?.length ?? 0), 0);
  const gymsWithSchedules = Object.values(out).filter(v => (v.schedule?.length ?? 0) > 0).length;
  log(`  TOTAL extracted: ${gymsWithSchedules} gyms with verified schedules · ${verifiedCount} total classes`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// STAGE 4 · Apply to Supabase gym_overrides
// ─────────────────────────────────────────────────────────────────────
function normalizeInstagram(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith('http')) return s;
  if (s.startsWith('@')) return `https://instagram.com/${s.slice(1)}`;
  return `https://instagram.com/${s}`;
}

async function stageApply(discovered, extracted) {
  log('═══ STAGE 4 · Apply to gym_overrides ═══');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase env missing');
  const supa = createClient(url, serviceKey, { auth: { persistSession: false } });

  const applied = existsSync(PATHS.applied) && RESUME
    ? JSON.parse(readFileSync(PATHS.applied, 'utf8'))
    : {};

  // Map place_id → gym (need lat/lng/website/phone)
  const gymsByPlaceId = new Map();
  for (const g of Object.values(discovered).flat()) gymsByPlaceId.set(g.place_id, g);

  // Build override rows from extraction results.
  // For Phase 1 we use place_id as the gym_id since these are mostly NEW gyms.
  // (Existing gyms with matching addresses can be reconciled in a follow-up dedup pass.)
  const rows = [];
  for (const [placeId, ext] of Object.entries(extracted)) {
    if (applied[placeId] === 'ok') continue;
    if (!ext.schedule || ext.schedule.length === 0) continue;
    const gym = gymsByPlaceId.get(placeId);
    if (!gym) continue;

    // Convert verified schedule entries into the ScheduleEntry shape used by /api/gyms.
    const schedule = ext.schedule.map(e => ({
      day: e.day_of_week,
      start_time: e.start_time,
      end_time: e.end_time ?? null,
      class_name: e.class_name,
      discipline: e.discipline,
      is_open_mat: !!e.is_open_mat,
      is_kids: !!e.is_kids,
      verified: true,
      source_url: undefined,
      source_quote: e.source_quote,
      verified_at: new Date().toISOString(),
    }));

    rows.push({
      gym_id: `places_${placeId}`,
      schedule,
      website: gym.website ?? null,
      phone: ext.page_phone ?? gym.phone ?? null,
      instagram: normalizeInstagram(ext.instagram_handle),
      updated_at: new Date().toISOString(),
    });
  }

  log(`  ${rows.length} rows to upsert into gym_overrides…`);
  // Bulk upsert in chunks of 100
  let ok = 0, errs = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supa.from('gym_overrides').upsert(chunk);
    if (error) {
      errs += chunk.length;
      log(`    chunk ${i}: error ${error.message}`);
      for (const r of chunk) applied[r.gym_id.replace(/^places_/, '')] = `error: ${error.message}`;
    } else {
      ok += chunk.length;
      for (const r of chunk) applied[r.gym_id.replace(/^places_/, '')] = 'ok';
    }
  }

  writeFileSync(PATHS.applied, JSON.stringify(applied, null, 2));
  log(`  applied: ${ok} ok / ${errs} errors`);
}

// ─────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────
async function main() {
  log(`────── Phase 1 run starting · stage=${STAGE_ARG ?? 'all'} · limit=${LIMIT_ARG || 'none'} · resume=${RESUME} ──────`);

  // Stage 1 — discovery is cheap, always runs unless cached
  const discovered = await stageDiscover();
  if (STAGE_ARG === 'discover') {
    log(`Discovery complete. Cost so far: $${totalCostUsd().total.toFixed(2)}`);
    return;
  }

  const total = Object.values(discovered).flat().length;
  log(`\n  📍 ${total} gyms ready for processing.`);
  log(`  Estimated cost remaining: ~$${(total * 0.025).toFixed(2)}`);
  log(`  Estimated Firecrawl credits remaining: ~${total * 2}`);

  // Stage 2 — Firecrawl scrape
  const scraped = await stageScrape(discovered, LIMIT_ARG);
  if (STAGE_ARG === 'scrape') return;

  // Stage 3 — Claude extract
  const extracted = await stageExtract(discovered, scraped, LIMIT_ARG);
  if (STAGE_ARG === 'extract') return;

  // Stage 4 — Apply to DB
  await stageApply(discovered, extracted);

  // ── Final summary ──
  const c = totalCostUsd();
  log(`\n────── Phase 1 complete ──────`);
  log(`  Gyms discovered: ${total}`);
  log(`  Gyms with verified schedules: ${Object.values(extracted).filter(v => (v.schedule?.length ?? 0) > 0).length}`);
  log(`  Total classes extracted: ${Object.values(extracted).reduce((s, v) => s + (v.schedule?.length ?? 0), 0)}`);
  log(`  Cost breakdown:`);
  log(`    Anthropic:  $${c.anthropic.toFixed(4)}  (in: ${cost.anthropic_input}, out: ${cost.anthropic_output}, cache_r: ${cost.anthropic_cache_read}, cache_w: ${cost.anthropic_cache_write})`);
  log(`    Places:     $${c.places.toFixed(4)}  (${cost.places_calls} calls)`);
  log(`    Firecrawl:  $${c.firecrawl.toFixed(4)}  (${cost.firecrawl_credits} credits)`);
  log(`    TOTAL:      $${c.total.toFixed(4)}`);
}

main().catch(e => { log(`FATAL: ${e.stack ?? e.message}`); process.exit(1); });
