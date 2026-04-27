/**
 * find-missing-websites.mjs
 *
 * Finds websites for gyms in lib/data.ts that are missing them, using Google Places API.
 *
 * Prerequisites:
 *   export GOOGLE_PLACES_API_KEY="your-key-here"
 *
 * Run:
 *   node scripts/find-missing-websites.mjs [--dry-run] [--limit=100] [--concurrency=3] [--verbose] [--offset=0]
 *
 * Use --offset to continue from where you left off across runs.
 * Example: first run --limit=500, next run --offset=500 --limit=500, etc.
 */

import { readFileSync, writeFileSync } from 'fs';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('Error: GOOGLE_PLACES_API_KEY not set.');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const LIMIT = args.limit ? parseInt(args.limit) : 500;
const OFFSET = args.offset ? parseInt(args.offset) : 0;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency) : 3;
const DRY_RUN = !!args['dry-run'];
const VERBOSE = !!args.verbose;

const DATA_PATH = 'lib/data.ts';
const raw = readFileSync(DATA_PATH, 'utf8');

// Extract all Gym[] arrays from the TS file (handles multiple exports)
function extractGymArrays(src) {
  const results = [];
  const pattern = /export const \w+: Gym\[\] = \[/g;
  let match;
  while ((match = pattern.exec(src)) !== null) {
    const arrStart = match.index + match[0].length - 1; // points to [
    const arrEnd = src.indexOf('\n];', arrStart);
    if (arrEnd === -1) continue;
    const jsonStr = src.slice(arrStart, arrEnd + 2); // include \n]
    try {
      const arr = JSON.parse(jsonStr);
      results.push(...arr);
    } catch (e) {
      console.error(`Warning: could not parse array at offset ${arrStart}: ${e.message}`);
    }
  }
  return results;
}

const gyms = extractGymArrays(raw);
if (gyms.length === 0) {
  console.error('No gyms found in data.ts');
  process.exit(1);
}

const noWebsite = gyms.filter(g => !g.website);
const toProcess = noWebsite.slice(OFFSET, OFFSET + LIMIT);

console.log(`Total gyms: ${gyms.length}`);
console.log(`Gyms without website: ${noWebsite.length}`);
console.log(`Processing: offset=${OFFSET}, limit=${LIMIT} → ${toProcess.length} gyms`);
if (DRY_RUN) console.log('[dry-run mode — no writes]');
console.log('');

async function findWebsite(gym) {
  // Places API (New) — text search with websiteUri in the field mask
  const queries = [
    [gym.name, gym.city, gym.state, gym.country === 'US' ? '' : gym.country].filter(Boolean).join(' '),
    [gym.name, gym.city].filter(Boolean).join(' '),
  ];

  for (const query of queries) {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.websiteUri',
        },
        body: JSON.stringify({ textQuery: query }),
      });
      const data = await res.json();

      if (VERBOSE) {
        console.log(`\n  [query] "${query}"`);
        if (data.error) {
          console.log(`  [error] ${data.error.status} — ${data.error.message}`);
        } else if (data.places?.length) {
          const p = data.places[0];
          console.log(`  [top result] ${p.displayName?.text}`);
          console.log(`  [website] ${p.websiteUri ?? '(none)'}`);
        } else {
          console.log(`  [no results]`);
        }
      }

      if (data.error) {
        console.error(`\n  API error: ${data.error.status} — ${data.error.message}`);
        return null;
      }

      const website = data.places?.[0]?.websiteUri;
      if (website) return website;
    } catch (e) {
      console.error(`  fetch error: ${e.message}`);
    }
  }
  return null;
}

async function main() {
  const updates = new Map(); // id → website
  let found = 0, notFound = 0;

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (gym) => {
      const website = await findWebsite(gym);
      if (website) {
        updates.set(gym.id, website);
        found++;
        console.log(`  ✓ [${gym.id}] ${gym.name} (${gym.city}) → ${website}`);
      } else {
        notFound++;
        if (VERBOSE) console.log(`  ✗ [${gym.id}] ${gym.name} (${gym.city}) — not found`);
      }
    }));

    const done = Math.min(i + CONCURRENCY, toProcess.length);
    if (!VERBOSE) process.stdout.write(`\r  ${done}/${toProcess.length} — ${found} found, ${notFound} not found`);
  }

  console.log(`\n\nDone: ${found} websites found, ${notFound} not found`);
  console.log(`Next run offset: --offset=${OFFSET + toProcess.length}`);

  if (DRY_RUN || found === 0) {
    if (DRY_RUN) console.log('[dry-run] Skipping write');
    return;
  }

  // Patch data.ts: inject "website" field before "open_mats" in each gym block
  let newContent = raw;
  let patched = 0;

  for (const [id, website] of updates) {
    const idPattern = `"id": "${id}",`;
    const pos = newContent.indexOf(idPattern);
    if (pos === -1) continue;

    const openMatsPos = newContent.indexOf('\n    "open_mats":', pos);
    if (openMatsPos === -1) continue;

    // Make sure website isn't already there
    if (newContent.slice(pos, openMatsPos).includes('"website"')) continue;

    // Escape any quotes in the URL (shouldn't happen but just in case)
    const safeUrl = website.replace(/"/g, '\\"');
    newContent = newContent.slice(0, openMatsPos) + `\n    "website": "${safeUrl}",` + newContent.slice(openMatsPos);
    patched++;
  }

  writeFileSync(DATA_PATH, newContent);
  console.log(`\nWrote lib/data.ts — ${patched} gyms updated`);
}

main().catch(console.error);
