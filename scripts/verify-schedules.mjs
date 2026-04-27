/**
 * verify-schedules.mjs
 *
 * Visits each gym's website, finds their schedule/open-mat page, and extracts
 * open mat information using Claude AI. Compares results against lib/data.ts
 * and writes a JSON report of discrepancies for human review.
 *
 * Prerequisites:
 *   export ANTHROPIC_API_KEY="your-key-here"
 *
 * Run:
 *   node scripts/verify-schedules.mjs [--limit=50] [--offset=0] [--verbose] [--dry-run] [--output=report.json]
 *
 * --limit     Max gyms to check per run (default 50 — website scraping is slow)
 * --offset    Skip first N gyms-with-websites
 * --verbose   Log full AI responses
 * --dry-run   Fetch + analyze but do NOT write report
 * --output    Where to write the JSON report (default: scripts/schedule-report.json)
 *
 * The output JSON has this shape:
 * {
 *   "checked": 50,
 *   "discrepancies": [
 *     {
 *       "gym_id": "12567",
 *       "gym_name": "Corsair BJJ",
 *       "gym_city": "Elgin",
 *       "gym_state": "TX",
 *       "website": "https://corsairbjj.com",
 *       "stored": [ { day, start_time, end_time, discipline, is_free, cost } ],
 *       "found_on_site": "Friday 6:30 PM – 8:00 PM, free",
 *       "ai_analysis": "...",
 *       "confidence": "high|medium|low",
 *       "suggested_action": "update|verify|closed|no_open_mat"
 *     }
 *   ],
 *   "confirmed": [...],
 *   "no_schedule_found": [...],
 *   "errors": [...]
 * }
 *
 * After reviewing the report, apply changes manually or with apply-schedule-fixes.mjs.
 */

import { readFileSync, writeFileSync } from 'fs';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set.');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const LIMIT = args.limit ? parseInt(args.limit) : 50;
const OFFSET = args.offset ? parseInt(args.offset) : 0;
const DRY_RUN = !!args['dry-run'];
const VERBOSE = !!args.verbose;
const OUTPUT_PATH = args.output || 'scripts/schedule-report.json';

const DATA_PATH = 'lib/data.ts';
const raw = readFileSync(DATA_PATH, 'utf8');

// ── Parse gyms ────────────────────────────────────────────────────────────────
function extractGyms(src) {
  const results = [];
  const pattern = /export const \w+: Gym\[\] = \[/g;
  let match;
  while ((match = pattern.exec(src)) !== null) {
    const arrStart = match.index + match[0].length - 1;
    const arrEnd = src.indexOf('\n];', arrStart);
    if (arrEnd === -1) continue;
    const jsonStr = src.slice(arrStart, arrEnd + 2);
    try {
      const arr = JSON.parse(jsonStr);
      results.push(...arr);
    } catch (e) {
      console.error(`Warning: could not parse array near offset ${arrStart}: ${e.message}`);
    }
  }
  return results;
}

const allGyms = extractGyms(raw);
if (allGyms.length === 0) {
  console.error('No gyms found in data.ts');
  process.exit(1);
}

const withWebsite = allGyms.filter(g => g.website && g.website.trim().length > 0);
const toProcess = withWebsite.slice(OFFSET, OFFSET + LIMIT);

console.log(`Total gyms: ${allGyms.length}`);
console.log(`Gyms with website: ${withWebsite.length}`);
console.log(`Processing: offset=${OFFSET}, limit=${LIMIT} → ${toProcess.length} gyms`);
if (DRY_RUN) console.log('[dry-run — report will not be saved]');
console.log('');

// ── Fetch a URL with timeout ──────────────────────────────────────────────────
async function fetchPage(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MatFinderBot/1.0; +https://matfinder-two.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
}

// ── Strip HTML to plain text (basic) ─────────────────────────────────────────
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n\n')
    .slice(0, 8000); // trim to keep token count reasonable
}

// ── Find schedule page URL ─────────────────────────────────────────────────────
function findScheduleUrl(baseUrl, html) {
  // Look for links containing schedule-like keywords
  const keywords = ['schedule', 'open-mat', 'openmat', 'class', 'timetable', 'training', 'calendar'];
  const linkRx = /href="([^"#][^"]*)"/gi;
  let match;
  const links = [];
  while ((match = linkRx.exec(html)) !== null) {
    links.push(match[1]);
  }
  for (const kw of keywords) {
    const found = links.find(l => l.toLowerCase().includes(kw));
    if (found) {
      try {
        return new URL(found, baseUrl).href;
      } catch {}
    }
  }
  return null;
}

// ── Claude analysis ────────────────────────────────────────────────────────────
async function analyzeWithClaude(gym, pageText) {
  const storedSchedule = gym.open_mats.map(o =>
    `${o.day} ${o.start_time}–${o.end_time} (${o.discipline}, ${o.is_free ? 'free' : '$' + o.cost})`
  ).join('; ');

  const prompt = `You are verifying open mat schedules for a Brazilian Jiu-Jitsu gym directory.

GYM: ${gym.name}, ${gym.city}, ${gym.state ?? ''} ${gym.country}
WEBSITE: ${gym.website}
CURRENTLY STORED SCHEDULE: ${storedSchedule}

WEBSITE TEXT:
---
${pageText}
---

Task: Find any "open mat" sessions listed on this website. Open mats are typically free-rolling / sparring sessions open to visitors, often listed separately from regular classes.

Respond with JSON only (no markdown, no explanation):
{
  "open_mats_found": true|false,
  "schedule_text_found": true|false,
  "open_mats": [
    {
      "day": "monday|tuesday|wednesday|thursday|friday|saturday|sunday",
      "start_time": "HH:MM",
      "end_time": "HH:MM or null",
      "discipline": "bjj|gi_bjj|nogi_bjj|wrestling|submission_grappling",
      "is_free": true|false,
      "cost": null or number,
      "notes": "any extra info"
    }
  ],
  "matches_stored": true|false|"partial",
  "discrepancies": "describe any differences from stored schedule, or 'none'",
  "confidence": "high|medium|low",
  "suggested_action": "confirmed|update|verify_manually|closed|no_open_mat"
}

Rules:
- "day" must be lowercase full day name
- Times in 24h HH:MM format
- If no schedule info found at all: open_mats_found=false, schedule_text_found=false
- If schedule found but no open mat: open_mats_found=false, schedule_text_found=true
- confidence=high: clear schedule with open mat listed
- confidence=medium: schedule found but open mat status ambiguous
- confidence=low: very little schedule info
- suggested_action=confirmed: stored schedule is correct
- suggested_action=update: schedule differs — open_mats array has correct data
- suggested_action=verify_manually: uncertain, human should check
- suggested_action=closed: gym appears permanently closed
- suggested_action=no_open_mat: gym operates but has no open mat listed`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.content?.[0]?.text ?? '';
    if (VERBOSE) console.log(`    Claude response: ${text.slice(0, 200)}...`);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { error: e.message, suggested_action: 'verify_manually', confidence: 'low' };
  }
}

// ── Process one gym ────────────────────────────────────────────────────────────
async function processGym(gym) {
  const baseUrl = gym.website.startsWith('http') ? gym.website : `https://${gym.website}`;

  // 1. Fetch homepage
  const home = await fetchPage(baseUrl);
  if (!home.ok) return { status: 'fetch_error', error: home.error };

  let pageText = htmlToText(home.text);

  // 2. Try to find schedule sub-page
  const scheduleUrl = findScheduleUrl(baseUrl, home.text);
  if (scheduleUrl && scheduleUrl !== baseUrl) {
    const schedPage = await fetchPage(scheduleUrl);
    if (schedPage.ok) {
      pageText += '\n\n--- SCHEDULE PAGE ---\n\n' + htmlToText(schedPage.text);
    }
  }

  // 3. Analyze with Claude
  const analysis = await analyzeWithClaude(gym, pageText);
  return { status: 'ok', scheduleUrl, analysis };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const report = {
    generated: new Date().toISOString(),
    offset: OFFSET,
    checked: 0,
    discrepancies: [],
    confirmed: [],
    no_schedule_found: [],
    errors: [],
  };

  for (let i = 0; i < toProcess.length; i++) {
    const gym = toProcess[i];
    process.stdout.write(`\r  [${i + 1}/${toProcess.length}] ${gym.name.slice(0, 40).padEnd(40)}`);

    const result = await processGym(gym);
    report.checked++;

    if (result.status === 'fetch_error') {
      report.errors.push({ gym_id: gym.id, gym_name: gym.name, website: gym.website, error: result.error });
      continue;
    }

    if (result.analysis?.error) {
      report.errors.push({ gym_id: gym.id, gym_name: gym.name, website: gym.website, error: result.analysis.error });
      continue;
    }

    const a = result.analysis;
    const entry = {
      gym_id: gym.id,
      gym_name: gym.name,
      gym_city: gym.city,
      gym_state: gym.state,
      website: gym.website,
      schedule_url: result.scheduleUrl ?? null,
      stored: gym.open_mats.map(o => ({
        day: o.day, start_time: o.start_time, end_time: o.end_time,
        discipline: o.discipline, is_free: o.is_free, cost: o.cost ?? null,
      })),
      found_on_site: a.open_mats ?? [],
      discrepancies: a.discrepancies ?? 'none',
      confidence: a.confidence ?? 'low',
      suggested_action: a.suggested_action ?? 'verify_manually',
    };

    if (a.suggested_action === 'confirmed') {
      report.confirmed.push(entry);
    } else if (!a.schedule_text_found || a.suggested_action === 'no_open_mat') {
      report.no_schedule_found.push(entry);
    } else {
      report.discrepancies.push(entry);
    }

    // Polite delay between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n\nDone!`);
  console.log(`  Checked: ${report.checked}`);
  console.log(`  Confirmed correct: ${report.confirmed.length}`);
  console.log(`  Discrepancies (need review): ${report.discrepancies.length}`);
  console.log(`  No schedule found: ${report.no_schedule_found.length}`);
  console.log(`  Errors: ${report.errors.length}`);
  console.log(`\nNext run: --offset=${OFFSET + toProcess.length}`);

  if (!DRY_RUN) {
    writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${OUTPUT_PATH}`);
    console.log(`Review discrepancies and confirmed entries, then run apply-schedule-fixes.mjs`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
