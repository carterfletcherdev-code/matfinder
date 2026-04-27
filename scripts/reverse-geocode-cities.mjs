/**
 * Reverse-geocode missing city names for gyms using Mapbox.
 * Reads lib/data.ts, finds gyms with empty city, batches API calls,
 * writes results to scripts/city-fixes.json.
 * Run: node scripts/reverse-geocode-cities.mjs
 * Then: node scripts/apply-city-fixes.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!TOKEN) {
  // Try loading from .env.local
  const env = readFileSync(join(root, '.env.local'), 'utf8');
  const match = env.match(/NEXT_PUBLIC_MAPBOX_TOKEN=(.+)/);
  if (!match) { console.error('No NEXT_PUBLIC_MAPBOX_TOKEN found'); process.exit(1); }
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = match[1].trim();
}
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Parse gyms from data.ts using JSON-like extraction
const dataTs = readFileSync(join(root, 'lib/data.ts'), 'utf8');

// Extract gym objects as JSON by finding the exported array (skip type annotations)
// Find all arrays and concatenate them
const allArrays = [];
let searchFrom = 0;
while (true) {
  const arrayStart = dataTs.indexOf('= [', searchFrom);
  if (arrayStart === -1) break;
  let depth = 0;
  let end = -1;
  for (let i = arrayStart + 2; i < dataTs.length; i++) {
    if (dataTs[i] === '[') depth++;
    else if (dataTs[i] === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) break;
  allArrays.push(dataTs.slice(arrayStart + 2, end + 1));
  searchFrom = end + 1;
}
const json = '[' + allArrays.map(a => a.slice(1, -1)).join(',') + ']'
  // strip trailing commas before ] or }
  .replace(/,(\s*[}\]])/g, '$1');

let gyms;
try {
  gyms = JSON.parse(json);
} catch (e) {
  console.error('Failed to parse data.ts as JSON:', e.message);
  process.exit(1);
}

const missing = gyms.filter(g => !g.city || !g.city.trim());
console.log(`Gyms missing city: ${missing.length} / ${gyms.length}`);

const CONCURRENCY = 20;
const results = {};
let done = 0;

async function reverseGeocode(gym) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${gym.lng},${gym.lat}.json?access_token=${token}&types=place,locality,neighborhood&limit=1&language=en`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const feat = json.features?.[0];
    if (!feat) return null;
    // feat.text is the city name, feat.place_name splits context
    const city = feat.text ?? null;
    // Try to get state from context
    const context = feat.context ?? [];
    const region = context.find(c => c.id?.startsWith('region.'))?.short_code ?? null;
    const state = region ? region.replace(/^[A-Z]{2}-/, '') : null;
    return { city, state };
  } catch {
    return null;
  }
}

// Process in batches
for (let i = 0; i < missing.length; i += CONCURRENCY) {
  const batch = missing.slice(i, i + CONCURRENCY);
  const resolved = await Promise.all(batch.map(g => reverseGeocode(g)));
  for (let j = 0; j < batch.length; j++) {
    const gym = batch[j];
    const r = resolved[j];
    if (r?.city) {
      results[gym.id] = { city: r.city, state: r.state ?? gym.state ?? '' };
    }
    done++;
  }
  const pct = ((done / missing.length) * 100).toFixed(1);
  process.stdout.write(`\r  ${done}/${missing.length} (${pct}%) — found ${Object.keys(results).length}`);
  // Small delay to be polite to the API
  if (i + CONCURRENCY < missing.length) await new Promise(r => setTimeout(r, 50));
}

console.log(`\nFound cities for ${Object.keys(results).length} / ${missing.length} gyms`);

const outPath = join(__dir, 'city-fixes.json');
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Written to ${outPath}`);
console.log('Now run: node scripts/apply-city-fixes.mjs');
