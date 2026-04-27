/**
 * Stage 1: Website discovery via Google Places API (New).
 *
 * Reads gyms from lib/data.ts, queries Places for each, writes results to
 * scripts/pipeline/data/01-websites.json.
 *
 * By default, only processes gyms WITHOUT a website (fill-missing mode).
 * Use --overwrite-existing to re-check all gyms.
 *
 * Run:
 *   source scripts/run-geocoding.sh   # exports GOOGLE_PLACES_API_KEY
 *   node scripts/pipeline/01-find-websites.mjs --test           # 10 gyms, demo output
 *   node scripts/pipeline/01-find-websites.mjs --limit=100      # batch
 *   node scripts/pipeline/01-find-websites.mjs                  # full run
 *   node scripts/pipeline/01-find-websites.mjs --dry-run        # show queries, no API calls
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { config } from './pipeline.config.mjs';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('Error: GOOGLE_PLACES_API_KEY not set.');
  console.error('Run: source scripts/run-geocoding.sh');
  process.exit(1);
}

// ── Args ─────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const LIMIT = args.limit ? parseInt(args.limit) : Infinity;
const OFFSET = args.offset ? parseInt(args.offset) : 0;
const DRY_RUN = !!args['dry-run'];
const TEST = !!args.test;
const OVERWRITE = !!args['overwrite-existing'];
const SKIP_EXISTING = !!args['skip-existing'];

// ── Parse gyms from data.ts ──────────────────────────────────────────────────
function extractGyms(src) {
  const results = [];
  const pattern = /export const \w+: Gym\[\] = \[/g;
  let match;
  while ((match = pattern.exec(src)) !== null) {
    const arrStart = match.index + match[0].length - 1;
    const arrEnd = src.indexOf('\n];', arrStart);
    if (arrEnd === -1) continue;
    const jsonStr = src.slice(arrStart, arrEnd + 2);
    try { results.push(...JSON.parse(jsonStr)); }
    catch (e) { console.error(`Warning: could not parse: ${e.message}`); }
  }
  return results;
}

const raw = readFileSync('lib/data.ts', 'utf8');
const allGyms = extractGyms(raw);
const missingWebsite = allGyms.filter(g => !g.website || g.website.trim() === '');

// Load existing 01-websites.json IDs for --skip-existing
let existingResultIds = new Set();
if (SKIP_EXISTING && existsSync(config.paths.websites)) {
  try {
    const existing = JSON.parse(readFileSync(config.paths.websites, 'utf8'));
    existingResultIds = new Set(Object.keys(existing));
  } catch { /* ignore */ }
}

let targetGyms = OVERWRITE ? allGyms : missingWebsite;
if (SKIP_EXISTING) targetGyms = targetGyms.filter(g => !existingResultIds.has(String(g.id)));

const subset = TEST ? targetGyms.slice(0, 10) : targetGyms.slice(OFFSET, OFFSET + LIMIT);

console.log('─── Stage 1: Find websites via Google Places API ───');
console.log(`Total gyms in data.ts:     ${allGyms.length}`);
console.log(`Gyms missing website:      ${missingWebsite.length}`);
console.log(`Mode:                      ${OVERWRITE ? 'OVERWRITE all' : SKIP_EXISTING ? 'FILL MISSING + skip already processed' : 'FILL MISSING only'}`);
if (SKIP_EXISTING) console.log(`Already in 01-websites.json: ${existingResultIds.size} (skipped)`);
console.log(`Will process:              ${subset.length}`);
if (TEST) console.log('[TEST mode — 10 gyms only, verbose output]');
if (DRY_RUN) console.log('[DRY RUN — no API calls]');
console.log('');

// ── Places API helpers ───────────────────────────────────────────────────────
async function searchText(query, country) {
  const body = { textQuery: query, pageSize: 1 };
  if (country) {
    body.regionCode = country === 'UK' ? 'GB' : country;
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,' +
        'places.websiteUri,places.internationalPhoneNumber,places.location',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Places searchText ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// ── Match confidence ─────────────────────────────────────────────────────────
function nameSimilarity(a, b) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const ta = new Set(norm(a).split(' ').filter(Boolean));
  const tb = new Set(norm(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersect = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return intersect / union;
}

function classifyMatch(gym, place) {
  if (!place) return 'no_match';
  const returnedName = place.displayName?.text || '';
  const sim = nameSimilarity(gym.name, returnedName);
  const addr = (place.formattedAddress || '').toLowerCase();
  const cityMatch = gym.city && addr.includes(gym.city.toLowerCase());
  if (sim >= 0.5 && cityMatch) return 'high';
  if (sim >= 0.3 || cityMatch) return 'medium';
  return 'low';
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const results = {};
  let processed = 0, found = 0, noMatch = 0, errors = 0;

  for (const gym of subset) {
    const query = config.placesQueryTemplate
      .replace('{name}', gym.name)
      .replace('{city}', gym.city || '');

    if (DRY_RUN) {
      console.log(`[dry] [${gym.id}] would query: "${query}" (country=${gym.country})`);
      processed++;
      continue;
    }

    try {
      const data = await searchText(query, gym.country);
      const place = data.places?.[0];

      if (!place) {
        noMatch++;
        results[gym.id] = { match_confidence: 'no_match', query };
        if (TEST) console.log(`  [${gym.id}] ${gym.name} (${gym.city}, ${gym.country}) — no match`);
      } else {
        const confidence = classifyMatch(gym, place);
        results[gym.id] = {
          place_id: place.id,
          name_returned: place.displayName?.text,
          website: place.websiteUri || null,
          phone: place.internationalPhoneNumber || null,
          verified_address: place.formattedAddress || null,
          lat: place.location?.latitude,
          lng: place.location?.longitude,
          match_confidence: confidence,
          query,
        };
        found++;
        if (TEST) {
          console.log(`  [${gym.id}] ${gym.name} (${gym.city}, ${gym.country})`);
          console.log(`    → returned: ${place.displayName?.text}`);
          console.log(`    → website: ${place.websiteUri || '(none)'}`);
          console.log(`    → phone:   ${place.internationalPhoneNumber || '(none)'}`);
          console.log(`    → addr:    ${place.formattedAddress || '(none)'}`);
          console.log(`    → confidence: ${confidence}`);
          console.log('');
        }
      }
      processed++;
    } catch (e) {
      errors++;
      console.error(`  [${gym.id}] error: ${e.message}`);
      results[gym.id] = { match_confidence: 'error', error: e.message };
    }

    // Polite pacing — 100ms between calls = ~10 req/s, well under quota
    await new Promise(r => setTimeout(r, 100));

    if (!TEST && processed % 25 === 0) {
      process.stdout.write(`\r  ${processed}/${subset.length} — found ${found}, no_match ${noMatch}, errors ${errors}  `);
    }
  }
  if (!TEST) process.stdout.write('\n');

  // ── Save ────────────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    const outDir = 'scripts/pipeline/data';
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    let merged = {};
    if (existsSync(config.paths.websites)) {
      try { merged = JSON.parse(readFileSync(config.paths.websites, 'utf8')); }
      catch { /* ignore */ }
    }
    Object.assign(merged, results);
    writeFileSync(config.paths.websites, JSON.stringify(merged, null, 2));
    console.log(`\nWrote ${Object.keys(merged).length} total entries to ${config.paths.websites}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\nSummary:');
  console.log(`  Processed:  ${processed}`);
  console.log(`  Found:      ${found}`);
  console.log(`  No match:   ${noMatch}`);
  console.log(`  Errors:     ${errors}`);

  const conf = { high: 0, medium: 0, low: 0, no_match: 0, error: 0 };
  for (const r of Object.values(results)) conf[r.match_confidence] = (conf[r.match_confidence] || 0) + 1;
  const websites = Object.values(results).filter(r => r.website).length;
  console.log('\nMatch confidence breakdown:');
  for (const [k, v] of Object.entries(conf)) console.log(`  ${k.padEnd(10)} ${v}`);
  console.log(`\nWebsites recovered: ${websites} / ${processed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
