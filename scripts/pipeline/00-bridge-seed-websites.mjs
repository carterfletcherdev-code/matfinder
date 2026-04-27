/**
 * Bridge: gyms in lib/data.ts that have a `website` field from seed data
 * but were never run through Stage 1 are excluded from Stage 2's input.
 *
 * This script augments scripts/pipeline/data/01-websites.json with those gyms,
 * marking them with match_confidence: 'high' (curated seed data) and seed: true.
 *
 * Output:
 *   - Updates 01-websites.json in-place (writes a .bak first)
 *   - Prints the list of new gym IDs (for use with Stage 2 --ids=...)
 *   - Writes scripts/pipeline/data/00-seed-bridge-ids.txt — comma-separated IDs
 *
 * Run:
 *   node scripts/pipeline/00-bridge-seed-websites.mjs --dry-run
 *   node scripts/pipeline/00-bridge-seed-websites.mjs
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const DRY_RUN = !!args['dry-run'];

const WEBSITES_FILE = 'scripts/pipeline/data/01-websites.json';
const IDS_OUT = 'scripts/pipeline/data/00-seed-bridge-ids.txt';

// Parse gyms from lib/data.ts (same approach as Stage 1).
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
    catch (e) { console.error(`Warning: parse failed: ${e.message}`); }
  }
  return results;
}

const raw = readFileSync('lib/data.ts', 'utf8');
const allGyms = extractGyms(raw);
console.log(`Total gyms in data.ts: ${allGyms.length}`);

const withSeedWebsite = allGyms.filter(g => g.website && g.website.trim());
console.log(`Gyms with seed website: ${withSeedWebsite.length}`);

if (!existsSync(WEBSITES_FILE)) {
  console.error(`Error: ${WEBSITES_FILE} not found.`);
  process.exit(1);
}
const websites = JSON.parse(readFileSync(WEBSITES_FILE, 'utf8'));
console.log(`Existing 01-websites.json entries: ${Object.keys(websites).length}`);

const newIds = [];
let skipExisting = 0;
let added = 0;
for (const g of withSeedWebsite) {
  const id = String(g.id);
  if (websites[id]) { skipExisting++; continue; }
  websites[id] = {
    website: g.website.replace(/\/$/, ''),
    name_returned: g.name || null,
    place_id: null,
    phone: g.phone || null,
    verified_address: g.address || null,
    lat: typeof g.lat === 'number' ? g.lat : null,
    lng: typeof g.lng === 'number' ? g.lng : null,
    match_confidence: 'high',
    query: null,
    seed: true,
  };
  newIds.push(id);
  added++;
}

console.log(`Skipped (already in 01-websites.json): ${skipExisting}`);
console.log(`Added (new from seed data):           ${added}`);

if (DRY_RUN) {
  console.log('\n[DRY RUN — no files written]');
  console.log(`First 10 new IDs: ${newIds.slice(0, 10).join(',')}`);
  process.exit(0);
}

copyFileSync(WEBSITES_FILE, WEBSITES_FILE + '.bak');
writeFileSync(WEBSITES_FILE, JSON.stringify(websites, null, 2));
writeFileSync(IDS_OUT, newIds.join(','));

console.log(`\nWrote ${added} new entries to ${WEBSITES_FILE}`);
console.log(`Backup saved to ${WEBSITES_FILE}.bak`);
console.log(`Comma-separated IDs saved to ${IDS_OUT}`);
console.log(`\nNext: node scripts/pipeline/02-find-relevant-pages.mjs --ids=$(cat ${IDS_OUT})`);
