/**
 * fix-all-coordinates.mjs
 *
 * 1. Validates every gym's lat/lng against its country's bounding box.
 * 2. Re-geocodes all out-of-bounds gyms using Google Geocoding API
 *    with components=country:XX — a hard country filter the Places API lacks.
 * 3. Validates the geocoded result is also within bounds before applying.
 * 4. Patches lib/data.ts in-place.
 *
 * Usage:
 *   export GOOGLE_GEOCODING_API_KEY="AIza..."
 *   node scripts/fix-all-coordinates.mjs [--dry-run] [--verbose] [--report-only]
 *
 * --report-only   Print mismatches but do not call the geocoding API
 * --dry-run       Call the API but do not write data.ts
 * --verbose       Show every geocode result
 */

import { readFileSync, writeFileSync } from 'fs';

const API_KEY = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const DRY_RUN = !!args['dry-run'];
const VERBOSE = !!args.verbose;
const REPORT_ONLY = !!args['report-only'];
const DELAY_MS = 120; // ~8 req/s, well under 50 req/s free tier

if (!API_KEY && !REPORT_ONLY) {
  console.error('Error: GOOGLE_GEOCODING_API_KEY not set. Use --report-only to just list mismatches.');
  process.exit(1);
}

// ── Country bounding boxes [lat_min, lat_max, lng_min, lng_max] ──────────────
// These are intentionally generous to avoid false positives (exclaves, islands).
const COUNTRY_BOUNDS = {
  US: [17.6, 71.4, -179.9, -64.0],  // includes Alaska, Hawaii, Puerto Rico, USVI
  FR: [41.3, 51.2, -5.2, 9.7],       // metropolitan + Corsica
  DE: [47.2, 55.2, 5.8, 15.1],
  UK: [49.8, 60.9, -8.7, 1.9],
  ES: [27.6, 43.9, -18.2, 4.4],      // includes Canary Islands
  IT: [35.4, 47.1, 6.6, 18.6],       // includes Sardinia, Sicily
  NL: [50.7, 53.6, 3.3, 7.3],
  AT: [46.3, 49.1, 9.5, 17.2],
  PL: [49.0, 54.9, 14.1, 24.2],
  CH: [45.8, 47.9, 5.9, 10.6],
  NO: [57.8, 71.3, 4.4, 31.2],
  BE: [49.4, 51.6, 2.5, 6.5],
  IE: [51.3, 55.5, -10.6, -5.9],
  UA: [44.3, 52.5, 22.0, 40.3],
  HU: [45.6, 48.7, 16.0, 23.0],
  GR: [34.7, 42.0, 19.3, 29.7],      // includes islands
  SE: [55.2, 69.2, 10.8, 24.3],
  CZ: [48.5, 51.2, 12.0, 19.0],
  FI: [59.7, 70.2, 19.4, 31.7],
  PT: [30.0, 42.3, -31.3, -6.1],     // includes Azores, Madeira
  HR: [42.3, 46.6, 13.4, 19.5],
  RO: [43.5, 48.4, 20.2, 29.8],
  DK: [54.5, 57.9, 8.0, 15.3],
  SI: [45.4, 47.0, 13.3, 16.7],
  BY: [51.1, 56.3, 23.0, 32.9],
  SK: [47.6, 49.7, 16.7, 22.7],
  RS: [42.1, 46.3, 18.8, 23.1],
  BG: [41.1, 44.3, 22.3, 28.7],
  GE: [40.9, 43.7, 39.9, 46.8],
  BA: [42.5, 45.4, 15.6, 19.7],
  EE: [57.4, 59.8, 21.6, 28.3],
  CY: [34.4, 35.8, 32.1, 34.7],
  MD: [45.4, 48.6, 26.5, 30.2],
  LV: [55.6, 58.2, 20.8, 28.4],
  MK: [40.7, 42.5, 20.3, 23.1],
  LU: [49.3, 50.3, 5.6, 6.6],
  LT: [53.8, 56.6, 20.8, 26.9],
  AM: [38.7, 41.4, 43.3, 46.7],
  AL: [39.5, 42.8, 19.2, 21.2],
  XK: [41.8, 43.4, 19.9, 21.9],
  ME: [41.7, 43.7, 18.3, 20.5],
  IS: [63.2, 66.7, -24.6, -13.3],
  MT: [35.7, 36.2, 14.1, 14.7],
};

// ── Parse gyms from data.ts ───────────────────────────────────────────────────
function extractGyms(src) {
  const results = [];
  const pattern = /export const \w+: Gym\[\] = \[/g;
  let match;
  while ((match = pattern.exec(src)) !== null) {
    const arrStart = match.index + match[0].length - 1;
    const arrEnd = src.indexOf('\n];', arrStart);
    if (arrEnd === -1) continue;
    try {
      const arr = JSON.parse(src.slice(arrStart, arrEnd + 2));
      results.push(...arr);
    } catch (e) {
      console.error(`Warning: parse error near offset ${arrStart}: ${e.message}`);
    }
  }
  return results;
}

function isInBounds(lat, lng, bounds) {
  const [latMin, latMax, lngMin, lngMax] = bounds;
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
}

// ── Google Geocoding API with country restriction ─────────────────────────────
async function geocodeWithCountry(gym) {
  // Map our country codes to ISO 3166-1 alpha-2 (mostly the same, a few differ)
  const countryCode = gym.country === 'UK' ? 'GB' : gym.country;

  // Build query: prefer address+city, fall back to name+city
  const queries = [];
  if (gym.address && gym.city) {
    queries.push(`${gym.address}, ${gym.city}`);
  } else if (gym.address) {
    queries.push(gym.address);
  }
  if (gym.city) {
    queries.push(`${gym.name}, ${gym.city}`);
  }
  queries.push(gym.name);

  for (const q of queries) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', q);
      url.searchParams.set('components', `country:${countryCode}`);
      url.searchParams.set('key', API_KEY);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED') {
        console.error(`\nAPI error: ${data.status} — ${data.error_message ?? ''}`);
        process.exit(1);
      }
      if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
        const { lat, lng } = data.results[0].geometry.location;
        const formattedAddress = data.results[0].formatted_address;
        return { lat, lng, formattedAddress };
      }
    } catch (e) {
      if (VERBOSE) console.log(`  [${gym.id}] fetch error: ${e.message}`);
    }
  }
  return null;
}

// ── Patch lat/lng in raw source ───────────────────────────────────────────────
function patchLatLng(src, gymId, newLat, newLng) {
  const idMarker = `"id": "${gymId}",`;
  const pos = src.indexOf(idMarker);
  if (pos === -1) return { src, patched: false };

  const blockEnd = src.indexOf('\n  }', pos);
  const blockSlice = src.slice(pos, blockEnd);

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
  const DATA_PATH = 'lib/data.ts';
  let raw = readFileSync(DATA_PATH, 'utf8');
  const allGyms = extractGyms(raw);

  if (allGyms.length === 0) {
    console.error('No gyms parsed from data.ts');
    process.exit(1);
  }

  console.log(`Total gyms: ${allGyms.length}`);

  // ── Step 1: Find all misplaced gyms ────────────────────────────────────────
  const misplaced = [];
  const unknownCountry = [];

  for (const gym of allGyms) {
    const bounds = COUNTRY_BOUNDS[gym.country];
    if (!bounds) {
      unknownCountry.push(gym);
      continue;
    }
    if (!isInBounds(gym.lat, gym.lng, bounds)) {
      misplaced.push(gym);
    }
  }

  console.log(`\nCountry bounds check:`);
  console.log(`  ✓ In bounds: ${allGyms.length - misplaced.length - unknownCountry.length}`);
  console.log(`  ✗ Out of bounds (misplaced): ${misplaced.length}`);
  console.log(`  ? Unknown country code: ${unknownCountry.length}`);

  if (unknownCountry.length > 0) {
    console.log(`\nUnknown country codes: ${[...new Set(unknownCountry.map(g => g.country))].join(', ')}`);
  }

  // Group misplaced by country for a clear report
  const byCountry = {};
  for (const gym of misplaced) {
    byCountry[gym.country] = byCountry[gym.country] || [];
    byCountry[gym.country].push(gym);
  }

  console.log('\nMisplaced gyms by country:');
  for (const [country, gyms] of Object.entries(byCountry).sort()) {
    console.log(`  ${country}: ${gyms.length} gym(s)`);
    if (VERBOSE || REPORT_ONLY) {
      for (const g of gyms) {
        console.log(`    [${g.id}] ${g.name} | city: "${g.city}" | addr: "${g.address}" | (${g.lat}, ${g.lng})`);
      }
    }
  }

  if (REPORT_ONLY || misplaced.length === 0) {
    if (misplaced.length === 0) console.log('\nAll coordinates look correct!');
    return;
  }

  // ── Step 2: Re-geocode with country restriction ─────────────────────────────
  console.log(`\nRe-geocoding ${misplaced.length} gyms with country restriction...`);
  if (DRY_RUN) console.log('[dry-run — will not write data.ts]');

  const fixes = [];
  const failed = [];
  let done = 0;

  for (const gym of misplaced) {
    done++;
    if (done % 10 === 0) {
      process.stdout.write(`\r  ${done}/${misplaced.length} — ${fixes.length} fixed, ${failed.length} failed`);
    }

    const result = await geocodeWithCountry(gym);
    await new Promise(r => setTimeout(r, DELAY_MS));

    if (!result) {
      failed.push({ gym, reason: 'not found' });
      if (VERBOSE) console.log(`\n  [${gym.id}] ${gym.name}: not found`);
      continue;
    }

    // Validate result is actually in the right country
    const bounds = COUNTRY_BOUNDS[gym.country];
    if (!isInBounds(result.lat, result.lng, bounds)) {
      failed.push({ gym, reason: `geocoder returned out-of-bounds result: (${result.lat}, ${result.lng}) — ${result.formattedAddress}` });
      if (VERBOSE) console.log(`\n  [${gym.id}] ${gym.name}: geocoder still out of bounds (${result.formattedAddress})`);
      continue;
    }

    if (VERBOSE) {
      console.log(`\n  [${gym.id}] ${gym.name}`);
      console.log(`    was: (${gym.lat}, ${gym.lng})`);
      console.log(`    now: (${result.lat}, ${result.lng}) — ${result.formattedAddress}`);
    }

    fixes.push({ gym, newLat: result.lat, newLng: result.lng, formattedAddress: result.formattedAddress });
  }

  process.stdout.write('\n');
  console.log(`\nRe-geocoding complete:`);
  console.log(`  Fixed: ${fixes.length}`);
  console.log(`  Could not fix: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nCould not fix (will need manual review):');
    for (const f of failed) {
      console.log(`  [${f.gym.id}] ${f.gym.name} (${f.gym.country}, "${f.gym.city}") — ${f.reason}`);
    }
  }

  // ── Step 3: Apply patches ───────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n[dry-run] Skipping write.');
    return;
  }

  if (fixes.length === 0) {
    console.log('\nNo fixes to apply.');
    return;
  }

  let newContent = raw;
  let patched = 0;
  for (const f of fixes) {
    const { src, patched: ok } = patchLatLng(newContent, f.gym.id, f.newLat, f.newLng);
    if (ok) { newContent = src; patched++; }
    else console.warn(`  Warning: could not patch gym id=${f.gym.id}`);
  }

  writeFileSync(DATA_PATH, newContent);
  console.log(`\nWrote lib/data.ts — ${patched} gyms corrected.`);

  if (failed.length > 0) {
    console.log(`\n${failed.length} gyms still need manual review. Run with --verbose to see them all.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
