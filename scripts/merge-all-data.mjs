/**
 * Merges all data sources into lib/data.ts:
 *   1. US gyms from findanopenmat.com (1,941 gyms) — already in GYMS export
 *   2. US gyms from openmattfinder.com (33 gyms) — scripts/openmattfinder-converted.json
 *   3. EU gyms from OSM — scripts/europe-gyms.json
 *   4. US gyms from OSM — scripts/us-osm-gyms.json (deduplicated against existing)
 *
 * Run: node scripts/merge-all-data.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

function loadJSON(path) {
  if (!existsSync(path)) { console.log(`Skipping ${path} (not found)`); return []; }
  const data = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`Loaded ${data.length} from ${path}`);
  return data;
}

// Load extra US gyms
const extraUS = loadJSON('scripts/openmattfinder-converted.json');

// Load EU gyms
const euRaw = loadJSON('scripts/europe-gyms.json');

// Load US OSM gyms
const usOsmRaw = loadJSON('scripts/us-osm-gyms.json');

// Get current max ID from data.ts
function loadExistingGyms() {
  const content = readFileSync('lib/data.ts', 'utf8');
  const ids = [...content.matchAll(/"id": "(\d+)"/g)].map(m => parseInt(m[1]));
  // Extract all lat/lng pairs from existing GYMS to deduplicate US OSM results
  const latLngs = [...content.matchAll(/"lat": ([\d.-]+),\s*\n\s*"lng": ([\d.-]+)/g)]
    .map(m => ({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }));
  return { maxId: Math.max(...ids, 0), latLngs };
}

const { maxId: existingMaxId, latLngs: existingLatLngs } = loadExistingGyms();

// Also collect lat/lngs from extraUS
const extraUSLatLngs = extraUS.map(g => ({ lat: g.lat, lng: g.lng }));
const allExistingLatLngs = [...existingLatLngs, ...extraUSLatLngs];

let nextId = Math.max(existingMaxId, extraUS.length > 0 ? Math.max(...extraUS.map(g => parseInt(g.id))) : 0) + 1;

// Proximity check: returns true if a gym at (lat, lng) is too close to any existing gym
function tooClose(lat, lng, existingPoints, thresholdDeg = 0.003) {
  for (const p of existingPoints) {
    const dlat = Math.abs(p.lat - lat);
    const dlng = Math.abs(p.lng - lng);
    if (dlat < thresholdDeg && dlng < thresholdDeg) return true;
  }
  return false;
}

const DEFAULT_SCHEDULE = {
  default:    [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }],
  judo:       [
    { day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true },
    { day: 'sunday',   start_time: '11:00', end_time: '13:00', is_free: true },
  ],
  wrestling:  [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }],
  boxing:     [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }],
};

// Reclassify discipline based on the gym name. The OSM scrapers stored the original
// inferred discipline, but we now want to default unknowns to "bjj" (gi/no-gi unconfirmed).
function reclassifyDiscipline(g) {
  const n = (g.name || '').toLowerCase();

  if (/\bmuay.thai\b/.test(n))                            return { disc: 'muay_thai',  confirmed: true };
  if (/\bkickbox/.test(n))                                return { disc: 'kickboxing', confirmed: true };
  if (/\bbox(?:ing)?\b/.test(n) && !/\bkickbox/.test(n))  return { disc: 'boxing',     confirmed: true };
  if (/\bjudo\b/.test(n))                                 return { disc: 'judo',       confirmed: true };
  if (/\bwrestling\b|\bsambo\b/.test(n))                  return { disc: 'wrestling',  confirmed: true };
  if (/\bmma\b/.test(n))                                  return { disc: 'mma',        confirmed: true };
  if (/\bkarate\b/.test(n))                               return { disc: 'karate',     confirmed: true };
  if (/\btaekwondo\b|\btae.kwon.do\b/.test(n))            return { disc: 'taekwondo',  confirmed: true };
  if (/\bno.?gi\b|\bgrappling\b|\bsubmission\b/.test(n))  return { disc: 'nogi_bjj',   confirmed: true };
  // Standalone "gi" word (not "no-gi")
  if (/(^|[^a-z])gi\b/.test(n) && !/no.?gi/.test(n))      return { disc: 'gi_bjj',     confirmed: true };

  // Honor the OSM-tagged discipline when it's a non-BJJ specific one (still confirmed via tag)
  if (g.discipline && ['judo', 'boxing', 'muay_thai', 'kickboxing', 'mma', 'wrestling', 'karate', 'taekwondo'].includes(g.discipline)) {
    return { disc: g.discipline, confirmed: true };
  }
  // Honor OSM nogi tag
  if (g.discipline === 'nogi_bjj') return { disc: 'nogi_bjj', confirmed: true };

  // Otherwise: generic BJJ, gi/no-gi unknown
  return { disc: 'bjj', confirmed: false };
}

function gymToFull(g, idStr) {
  const { disc, confirmed } = reclassifyDiscipline(g);
  const schedule = DEFAULT_SCHEDULE[disc] ?? DEFAULT_SCHEDULE.default;
  return {
    id: idStr,
    name: g.name,
    address: g.address || '',
    city: g.city || '',
    state: g.state || '',
    country: g.country,
    lat: g.lat,
    lng: g.lng,
    website: g.website || undefined,
    open_mats: schedule.map((s, i) => ({
      id: `${idStr}-${i + 1}`,
      discipline: disc,
      confirmed,
      ...s,
    })),
  };
}

// Convert EU gyms
const euGyms = euRaw
  .filter(g => g.lat && g.lng && g.name)
  .map(g => gymToFull(g, String(nextId++)));

// Deduplicate EU by name+country
const euSeen = new Set();
const euUnique = euGyms.filter(g => {
  const key = `${g.name.toLowerCase()}|${g.country}`;
  if (euSeen.has(key)) return false;
  euSeen.add(key);
  return true;
});

console.log(`EU gyms after dedup: ${euUnique.length}`);

// Convert US OSM gyms — deduplicate against all existing US gyms by proximity
const allLatLngsForUSDedup = [...allExistingLatLngs, ...euUnique.map(g => ({ lat: g.lat, lng: g.lng }))];
const usOsmDeduped = [];
const usOsmSeenNames = new Set();

for (const g of usOsmRaw) {
  if (!g.lat || !g.lng || !g.name) continue;
  // Skip if too close to existing gym (within ~330m)
  if (tooClose(g.lat, g.lng, allExistingLatLngs, 0.003)) continue;
  // Skip duplicate names in same state
  const nameKey = `${g.name.toLowerCase()}|${g.state}`;
  if (usOsmSeenNames.has(nameKey)) continue;
  usOsmSeenNames.add(nameKey);

  const idStr = String(nextId++);
  usOsmDeduped.push(gymToFull(g, idStr));
  // Track its lat/lng so subsequent entries don't duplicate it either
  allExistingLatLngs.push({ lat: g.lat, lng: g.lng });
}

console.log(`US OSM gyms after proximity+name dedup: ${usOsmDeduped.length}`);

// Stats
const euByCountry = {};
euUnique.forEach(g => { euByCountry[g.country] = (euByCountry[g.country] || 0) + 1; });
console.log('EU by country:', JSON.stringify(euByCountry));

const usOsmByState = {};
usOsmDeduped.forEach(g => { usOsmByState[g.state] = (usOsmByState[g.state] || 0) + 1; });
const top10States = Object.entries(usOsmByState).sort((a,b) => b[1]-a[1]).slice(0, 10);
console.log('US OSM top states:', top10States.map(([s,n]) => `${s}:${n}`).join(', '));

// Read existing data.ts
let content = readFileSync('lib/data.ts', 'utf8');

// Build blocks
const extraUSBlock = extraUS.length > 0
  ? `\n// Additional US open mat gyms from openmattfinder.com — ${extraUS.length} gyms\nexport const EXTRA_US_GYMS: Gym[] = ${JSON.stringify(extraUS, null, 2)};\n`
  : '';

const euBlock = euUnique.length > 0
  ? `\n// European martial arts gyms — ${euUnique.length} gyms across ${Object.keys(euByCountry).length} countries\nexport const EU_GYMS: Gym[] = ${JSON.stringify(euUnique, null, 2)};\n`
  : '';

const usOsmBlock = usOsmDeduped.length > 0
  ? `\n// US martial arts gyms from OpenStreetMap — ${usOsmDeduped.length} gyms (deduplicated against findanopenmat data)\nexport const US_OSM_GYMS: Gym[] = ${JSON.stringify(usOsmDeduped, null, 2)};\n`
  : '';

// Remove existing blocks
content = content.replace(/\n\/\/ Additional US open mat.*?^export const EXTRA_US_GYMS[^;]+;\n/ms, '');
content = content.replace(/\n\/\/ European martial arts.*?^export const EU_GYMS[^;]+;\n/ms, '');
content = content.replace(/\n\/\/ US martial arts gyms from OpenStreetMap.*?^export const US_OSM_GYMS[^;]+;\n/ms, '');

content = content.trimEnd() + '\n' + extraUSBlock + euBlock + usOsmBlock;
writeFileSync('lib/data.ts', content);
console.log('Updated lib/data.ts');

// Update API route
const imports = ['GYMS', extraUS.length > 0 && 'EXTRA_US_GYMS', euUnique.length > 0 && 'EU_GYMS', usOsmDeduped.length > 0 && 'US_OSM_GYMS'].filter(Boolean);
const spreads = imports.map(n => `    ...${n},`).join('\n');

const routeContent = `import { NextResponse } from 'next/server';
import { ${imports.join(', ')} } from '@/lib/data';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json([
${spreads}
  ]);
}
`;
writeFileSync('app/api/gyms/route.ts', routeContent);
console.log('Updated app/api/gyms/route.ts');

const total = 1941 + extraUS.length + euUnique.length + usOsmDeduped.length;
console.log(`\nFinal totals: ${total} gyms`);
console.log(`  1941 US findanopenmat`);
console.log(`  ${extraUS.length} US openmattfinder`);
console.log(`  ${euUnique.length} EU OSM`);
console.log(`  ${usOsmDeduped.length} US OSM (new, deduplicated)`);
