/**
 * Merges global OSM gyms (scripts/global-gyms.json) into lib/data.ts as GLOBAL_GYMS.
 * Also updates app/api/gyms/route.ts to include GLOBAL_GYMS in the response.
 *
 * Deduplicates against all existing gyms by proximity (within ~330m).
 *
 * Run: node scripts/merge-global-gyms.mjs --dry-run
 *      node scripts/merge-global-gyms.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const DRY_RUN = !!args['dry-run'];

const globalRaw = JSON.parse(readFileSync('scripts/global-gyms.json', 'utf8'));
console.log(`Loaded ${globalRaw.length} gyms from global-gyms.json`);

// ── Load existing state ───────────────────────────────────────────────────────
const content = readFileSync('lib/data.ts', 'utf8');
const existingIds = [...content.matchAll(/"id": "(\d+)"/g)].map(m => parseInt(m[1]));
const maxId = Math.max(...existingIds, 12569);
const existingLatLngs = [...content.matchAll(/"lat": ([\d.-]+),\s*\n\s*"lng": ([\d.-]+)/g)]
  .map(m => ({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }));

console.log(`Existing gyms: ${existingLatLngs.length}, max ID: ${maxId}`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function tooClose(lat, lng, points, threshold = 0.003) {
  for (const p of points) {
    if (Math.abs(p.lat - lat) < threshold && Math.abs(p.lng - lng) < threshold) return true;
  }
  return false;
}

function reclassifyDiscipline(g) {
  const n = (g.name || '').toLowerCase();
  if (/\bmuay.thai\b/.test(n))                             return { disc: 'muay_thai',  confirmed: true };
  if (/\bkickbox/.test(n))                                 return { disc: 'kickboxing', confirmed: true };
  if (/\bbox(?:ing)?\b/.test(n) && !/\bkickbox/.test(n))  return { disc: 'boxing',     confirmed: true };
  if (/\bjudo\b/.test(n))                                  return { disc: 'judo',       confirmed: true };
  if (/\bwrestling\b|\bsambo\b/.test(n))                   return { disc: 'wrestling',  confirmed: true };
  if (/\bmma\b/.test(n))                                   return { disc: 'mma',        confirmed: true };
  if (/\bkarate\b/.test(n))                                return { disc: 'karate',     confirmed: true };
  if (/\btaekwondo\b|\btae.kwon.do\b/.test(n))             return { disc: 'taekwondo',  confirmed: true };
  if (/\bno.?gi\b|\bgrappling\b|\bsubmission\b/.test(n))  return { disc: 'nogi_bjj',   confirmed: true };
  if (/(^|[^a-z])gi\b/.test(n) && !/no.?gi/.test(n))      return { disc: 'gi_bjj',     confirmed: true };
  if (g.discipline && ['judo','boxing','muay_thai','kickboxing','mma','wrestling','karate','taekwondo'].includes(g.discipline))
    return { disc: g.discipline, confirmed: true };
  if (g.discipline === 'nogi_bjj') return { disc: 'nogi_bjj', confirmed: true };
  return { disc: 'bjj', confirmed: false };
}

const DEFAULT_SCHEDULE = {
  default:   [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }],
  judo:      [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }, { day: 'sunday', start_time: '11:00', end_time: '13:00', is_free: true }],
  wrestling: [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }],
  boxing:    [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }],
};

function gymToFull(g, idStr) {
  const { disc, confirmed } = reclassifyDiscipline(g);
  const schedule = DEFAULT_SCHEDULE[disc] ?? DEFAULT_SCHEDULE.default;
  return {
    id: idStr,
    name: g.name,
    address: g.address || '',
    city: g.city || '',
    state: '',
    country: g.country,
    lat: g.lat,
    lng: g.lng,
    ...(g.website ? { website: g.website } : {}),
    open_mats: schedule.map((s, i) => ({
      id: `${idStr}-${i + 1}`,
      discipline: disc,
      confirmed,
      ...s,
    })),
  };
}

// ── Dedup + convert ───────────────────────────────────────────────────────────
let nextId = maxId + 1;
const allLatLngs = [...existingLatLngs];
const seenNames = new Set();
const deduped = [];

for (const g of globalRaw) {
  if (!g.lat || !g.lng || !g.name) continue;
  if (tooClose(g.lat, g.lng, allLatLngs)) continue;
  const nameKey = `${g.name.toLowerCase()}|${g.country}`;
  if (seenNames.has(nameKey)) continue;
  seenNames.add(nameKey);
  const entry = gymToFull(g, String(nextId++));
  deduped.push(entry);
  allLatLngs.push({ lat: g.lat, lng: g.lng });
}

console.log(`After proximity+name dedup: ${deduped.length} new gyms`);

const byCountry = {};
deduped.forEach(g => { byCountry[g.country] = (byCountry[g.country] || 0) + 1; });
const top15 = Object.entries(byCountry).sort((a,b) => b[1]-a[1]).slice(0,15);
console.log('Top countries:', top15.map(([c,n]) => `${c}:${n}`).join(', '));

const withWebsite = deduped.filter(g => g.website).length;
console.log(`With website: ${withWebsite}, without: ${deduped.length - withWebsite}`);

if (DRY_RUN) {
  console.log('\n[DRY RUN — not writing files]');
  process.exit(0);
}

// ── Write data.ts ─────────────────────────────────────────────────────────────
const globalBlock = `\n// Global martial arts gyms from OpenStreetMap — ${deduped.length} gyms across ${Object.keys(byCountry).length} countries\nexport const GLOBAL_GYMS: Gym[] = ${JSON.stringify(deduped, null, 2)};\n`;

let updated = content;
// Remove old GLOBAL_GYMS block if re-running
updated = updated.replace(/\n\/\/ Global martial arts gyms.*?^export const GLOBAL_GYMS[^;]+;\n/ms, '');
updated = updated.trimEnd() + '\n' + globalBlock;
writeFileSync('lib/data.ts', updated);
console.log(`\nWrote GLOBAL_GYMS to lib/data.ts (${deduped.length} gyms)`);

// ── Update API route ──────────────────────────────────────────────────────────
const routePath = 'app/api/gyms/route.ts';
const routeContent = readFileSync(routePath, 'utf8');

// Add GLOBAL_GYMS to imports + spread if not already present
const existingImports = (routeContent.match(/import \{ ([^}]+) \} from '@\/lib\/data'/) || [])[1] || '';
const importNames = existingImports.split(',').map(s => s.trim()).filter(Boolean);
if (!importNames.includes('GLOBAL_GYMS')) importNames.push('GLOBAL_GYMS');

const spreads = importNames.map(n => `    ...${n},`).join('\n');
const newRoute = `import { NextResponse } from 'next/server';
import { ${importNames.join(', ')} } from '@/lib/data';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json([
${spreads}
  ]);
}
`;
writeFileSync(routePath, newRoute);
console.log(`Updated ${routePath}`);
console.log(`\nTotal gyms in app now: ~${existingLatLngs.length + deduped.length}`);
