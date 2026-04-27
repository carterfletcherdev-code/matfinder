/**
 * fix-geocoding.mjs
 *
 * Re-geocodes gyms in lib/data.ts that have a street address, comparing the
 * result against the stored lat/lng. Updates the file when the difference
 * exceeds a configurable threshold.
 *
 * Uses Google Geocoding API (same key as Places API).
 *
 * Prerequisites:
 *   export GOOGLE_GEOCODING_API_KEY="your-key-here"
 *   (or GOOGLE_PLACES_API_KEY — will try both)
 *
 * Run:
 *   node scripts/fix-geocoding.mjs [--dry-run] [--limit=500] [--offset=0] [--threshold=0.3] [--verbose]
 *
 * --threshold   Distance in km that triggers an update (default 0.3 = 300 m)
 * --offset      Skip first N gyms-with-addresses across runs
 * --limit       Max gyms to process per run
 * --dry-run     Show what would change without writing
 * --verbose     Log every geocode result
 *
 * Use --offset to chunk large runs:
 *   node scripts/fix-geocoding.mjs --limit=1000
 *   node scripts/fix-geocoding.mjs --offset=1000 --limit=1000
 *   …etc
 */

import { readFileSync, writeFileSync } from 'fs';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;
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
const THRESHOLD_KM = args.threshold ? parseFloat(args.threshold) : 0.3;
const DRY_RUN = !!args['dry-run'];
const VERBOSE = !!args.verbose;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency) : 5;

const DATA_PATH = 'lib/data.ts';
let raw = readFileSync(DATA_PATH, 'utf8');

// ── Haversine distance ────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Parse gyms from data.ts ───────────────────────────────────────────────────
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
  console.error('No gyms found in data.ts — check parsing');
  process.exit(1);
}

// Only gyms that have a non-empty address string
const withAddress = allGyms.filter(g => g.address && g.address.trim().length > 0);
const toProcess = withAddress.slice(OFFSET, OFFSET + LIMIT);

console.log(`Total gyms: ${allGyms.length}`);
console.log(`Gyms with address: ${withAddress.length}`);
console.log(`Processing: offset=${OFFSET}, limit=${LIMIT} → ${toProcess.length} gyms`);
console.log(`Update threshold: ${THRESHOLD_KM} km`);
if (DRY_RUN) console.log('[dry-run mode — no writes]');
console.log('');

// Country bounding boxes for result validation [lat_min, lat_max, lng_min, lng_max]
const COUNTRY_BOUNDS = {
  US:[17.6,71.4,-179.9,-64.0],FR:[41.3,51.2,-5.2,9.7],DE:[47.2,55.2,5.8,15.1],
  UK:[49.8,60.9,-8.7,1.9],ES:[27.6,43.9,-18.2,4.4],IT:[35.4,47.1,6.6,18.6],
  NL:[50.7,53.6,3.3,7.3],AT:[46.3,49.1,9.5,17.2],PL:[49.0,54.9,14.1,24.2],
  CH:[45.8,47.9,5.9,10.6],NO:[57.8,71.3,4.4,31.2],BE:[49.4,51.6,2.5,6.5],
  IE:[51.3,55.5,-10.6,-5.9],UA:[44.3,52.5,22.0,40.3],HU:[45.6,48.7,16.0,23.0],
  GR:[34.7,42.0,19.3,29.7],SE:[55.2,69.2,10.8,24.3],CZ:[48.5,51.2,12.0,19.0],
  FI:[59.7,70.2,19.4,31.7],PT:[30.0,42.3,-31.3,-6.1],HR:[42.3,46.6,13.4,19.5],
  RO:[43.5,48.4,20.2,29.8],DK:[54.5,57.9,8.0,15.3],SI:[45.4,47.0,13.3,16.7],
  BY:[51.1,56.3,23.0,32.9],SK:[47.6,49.7,16.7,22.7],RS:[42.1,46.3,18.8,23.1],
  BG:[41.1,44.3,22.3,28.7],GE:[40.9,43.7,39.9,46.8],BA:[42.5,45.4,15.6,19.7],
  EE:[57.4,59.8,21.6,28.3],CY:[34.4,35.8,32.1,34.7],MD:[45.4,48.6,26.5,30.2],
  LV:[55.6,58.2,20.8,28.4],MK:[40.7,42.5,20.3,23.1],LU:[49.3,50.3,5.6,6.6],
  LT:[53.8,56.6,20.8,26.9],AM:[38.7,41.4,43.3,46.7],AL:[39.5,42.8,19.2,21.2],
  XK:[41.8,43.4,19.9,21.9],ME:[41.7,43.7,18.3,20.5],IS:[63.2,66.7,-24.6,-13.3],
  MT:[35.7,36.2,14.1,14.7],
};

function inBounds(lat, lng, b) {
  return b && lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3];
}

// ── Geocode via Google Geocoding API with country restriction ─────────────────
async function geocode(gym) {
  const countryCode = gym.country === 'UK' ? 'GB' : gym.country;
  const queries = [];
  if (gym.address && gym.city) queries.push(`${gym.address}, ${gym.city}`);
  else if (gym.address) queries.push(gym.address);
  if (gym.city) queries.push(`${gym.name}, ${gym.city}`);
  queries.push(gym.name);

  for (const query of queries) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', query);
      url.searchParams.set('components', `country:${countryCode}`);
      url.searchParams.set('key', API_KEY);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED') {
        console.error(`\nAPI error: ${data.status} — ${data.error_message ?? ''}`);
        process.exit(1);
      }
      if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) continue;

      const { lat, lng } = data.results[0].geometry.location;
      const formattedAddress = data.results[0].formatted_address;

      // Reject result if it's outside the expected country bounds
      const bounds = COUNTRY_BOUNDS[gym.country];
      if (bounds && !inBounds(lat, lng, bounds)) {
        if (VERBOSE) console.log(`  [${gym.id}] geocoder returned out-of-bounds result (${lat}, ${lng}), skipping`);
        continue;
      }

      return { lat, lng, formattedAddress };
    } catch (e) {
      console.error(`  [${gym.id}] fetch error: ${e.message}`);
      return null;
    }
  }
  return null;
}

// ── Patch a single gym's lat/lng in the raw source ───────────────────────────
function patchLatLng(src, gymId, newLat, newLng) {
  // Find the gym block by id
  const idMarker = `"id": "${gymId}",`;
  const pos = src.indexOf(idMarker);
  if (pos === -1) return { src, patched: false };

  // Find the lat and lng fields within the next ~500 chars (they come right after id/name/address/...)
  const blockEnd = src.indexOf('\n  }', pos);
  const blockSlice = src.slice(pos, blockEnd);

  // Replace lat value (handles integer or float)
  const latRx = /"lat": [-\d.]+/;
  const lngRx = /"lng": [-\d.]+/;

  if (!latRx.test(blockSlice) || !lngRx.test(blockSlice)) return { src, patched: false };

  const newBlock = blockSlice
    .replace(latRx, `"lat": ${newLat}`)
    .replace(lngRx, `"lng": ${newLng}`);

  return { src: src.slice(0, pos) + newBlock + src.slice(pos + blockSlice.length), patched: true };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const updates = []; // { gym, oldLat, oldLng, newLat, newLng, distKm }
  let geocoded = 0, unchanged = 0, notFound = 0, errors = 0;

  // Delay helper to respect rate limit (100 req/s; be conservative at 10/s)
  const DELAY_MS = 110; // ~9 req/s

  for (let i = 0; i < toProcess.length; i++) {
    const gym = toProcess[i];

    if (i > 0 && i % CONCURRENCY === 0) {
      // Small status update
      if (!VERBOSE) {
        process.stdout.write(
          `\r  ${i}/${toProcess.length} — ${updates.length} to update, ${notFound} not found`
        );
      }
    }

    const result = await geocode(gym);
    await new Promise(r => setTimeout(r, DELAY_MS));

    if (!result) {
      notFound++;
      continue;
    }

    geocoded++;
    const distKm = haversineKm(gym.lat, gym.lng, result.lat, result.lng);

    if (VERBOSE) {
      console.log(`\n  [${gym.id}] ${gym.name} (${gym.city})`);
      console.log(`    stored: (${gym.lat}, ${gym.lng})`);
      console.log(`    geocoded: (${result.lat}, ${result.lng}) — ${result.formattedAddress}`);
      console.log(`    distance: ${(distKm * 1000).toFixed(0)} m ${distKm > THRESHOLD_KM ? '← UPDATE' : ''}`);
    }

    if (distKm > THRESHOLD_KM) {
      updates.push({ gym, oldLat: gym.lat, oldLng: gym.lng, newLat: result.lat, newLng: result.lng, distKm, formattedAddress: result.formattedAddress });
    } else {
      unchanged++;
    }
  }

  if (!VERBOSE) process.stdout.write('\n');

  console.log(`\nGeocoding done:`);
  console.log(`  Geocoded: ${geocoded}`);
  console.log(`  Not found / no match: ${notFound}`);
  console.log(`  Within threshold (no change): ${unchanged}`);
  console.log(`  Need update (>${THRESHOLD_KM} km off): ${updates.length}`);
  console.log(`\nNext run offset: --offset=${OFFSET + toProcess.length}`);

  if (updates.length === 0) {
    console.log('\nNothing to update.');
    return;
  }

  console.log('\nGyms to be updated:');
  for (const u of updates) {
    console.log(`  [${u.gym.id}] ${u.gym.name} (${u.gym.city}, ${u.gym.state})`);
    console.log(`    ${u.oldLat.toFixed(5)}, ${u.oldLng.toFixed(5)} → ${u.newLat.toFixed(5)}, ${u.newLng.toFixed(5)}  (${(u.distKm * 1000).toFixed(0)} m off)`);
    console.log(`    Address resolved to: ${u.formattedAddress}`);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] Skipping write.');
    return;
  }

  let newContent = raw;
  let patched = 0;
  for (const u of updates) {
    const { src, patched: ok } = patchLatLng(newContent, u.gym.id, u.newLat, u.newLng);
    if (ok) { newContent = src; patched++; }
    else console.warn(`  Warning: could not patch gym id=${u.gym.id}`);
  }

  writeFileSync(DATA_PATH, newContent);
  console.log(`\nWrote lib/data.ts — ${patched} gyms updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
