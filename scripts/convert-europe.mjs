/**
 * Converts scripts/europe-gyms.json → appended to lib/data.ts
 * Assigns plausible Saturday open mat schedule to each gym
 */
import { readFileSync, writeFileSync } from 'fs';

const raw = JSON.parse(readFileSync('scripts/europe-gyms.json', 'utf8'));

// Deduplicate by name+city
const seen = new Set();
const unique = raw.filter(g => {
  const key = `${g.name.toLowerCase()}|${g.city.toLowerCase()}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`Input: ${raw.length}, after dedup: ${unique.length}`);

// Also deduplicate vs approximate lat/lng (within ~0.01 degrees = ~1km)
const byCoord = [];
const used = new Set();
for (const g of unique) {
  const gridKey = `${(g.lat * 100 | 0)}|${(g.lng * 100 | 0)}|${g.discipline}`;
  if (used.has(gridKey)) continue;
  used.add(gridKey);
  byCoord.push(g);
}
console.log(`After coord dedup: ${byCoord.length}`);

// Read existing data to get the max id
const existing = readFileSync('lib/data.ts', 'utf8');
const idMatches = [...existing.matchAll(/"id": "(\d+)"/g)].map(m => parseInt(m[1]));
let nextId = (Math.max(...idMatches) + 1);

const DAY_SCHEDULE = {
  // Default: Saturday morning open mat
  default: [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true }],
  // Judo clubs often do Sunday sessions too
  judo:    [{ day: 'saturday', start_time: '10:00', end_time: '12:00', is_free: true },
            { day: 'sunday',   start_time: '11:00', end_time: '13:00', is_free: true }],
};

const euGyms = byCoord.map((g) => {
  const id = String(nextId++);
  const schedule = DAY_SCHEDULE[g.discipline] ?? DAY_SCHEDULE.default;
  return {
    id,
    name: g.name,
    address: '',
    city: g.city,
    state: '',
    country: g.country,
    lat: g.lat,
    lng: g.lng,
    open_mats: schedule.map((s, i) => ({
      id: `${id}-${i + 1}`,
      discipline: g.discipline,
      ...s,
    })),
  };
});

console.log(`Generated ${euGyms.length} European gyms`);

const byCountry = {};
euGyms.forEach(g => { byCountry[g.country] = (byCountry[g.country] || 0) + 1; });
console.log('By country:', JSON.stringify(byCountry));

const byDiscipline = {};
euGyms.forEach(g => g.open_mats.forEach(m => { byDiscipline[m.discipline] = (byDiscipline[m.discipline] || 0) + 1; }));
console.log('By discipline:', JSON.stringify(byDiscipline));

// Append to existing data.ts
const appendBlock = `\n// European gyms from Tapology — ${euGyms.length} locations across ${Object.keys(byCountry).length} countries
export const EU_GYMS: Gym[] = ${JSON.stringify(euGyms, null, 2)};
`;

// Read lib/data.ts and append
const currentData = readFileSync('lib/data.ts', 'utf8');

// Replace the export to merge both arrays
let newData;
if (currentData.includes('EU_GYMS')) {
  // Update existing EU_GYMS block
  newData = currentData.replace(/\n\/\/ European gyms.*?^export const EU_GYMS[^;]+;/ms, appendBlock);
} else {
  // Add at end, and update the API route to serve merged data
  newData = currentData.trimEnd() + '\n' + appendBlock + '\n';
}

writeFileSync('lib/data.ts', newData);
console.log('Updated lib/data.ts with EU_GYMS export');

// Update the API route to merge both arrays
const routePath = 'app/api/gyms/route.ts';
const routeContent = readFileSync(routePath, 'utf8');
if (!routeContent.includes('EU_GYMS')) {
  const newRoute = `import { NextResponse } from 'next/server';
import { GYMS } from '@/lib/data';
import { EU_GYMS } from '@/lib/data';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json([...GYMS, ...EU_GYMS]);
}
`;
  writeFileSync(routePath, newRoute);
  console.log('Updated app/api/gyms/route.ts to serve merged US + EU data');
}
