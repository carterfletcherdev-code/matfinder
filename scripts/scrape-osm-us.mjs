/**
 * Queries OpenStreetMap Overpass API for martial arts gyms across all 50 US states
 * Finds boxing gyms, MMA gyms, judo clubs, wrestling rooms, etc. that aren't on findanopenmat.com
 * Run: node scripts/scrape-osm-us.mjs
 */
import { writeFileSync } from 'fs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// All 50 US states + DC with bounding boxes [south, west, north, east]
const US_STATES = [
  { state: 'AL', bbox: '30.2,-88.5,35.0,-84.9' },
  { state: 'AK', bbox: '54.0,-168.0,71.5,-130.0' },
  { state: 'AZ', bbox: '31.3,-114.8,37.0,-109.0' },
  { state: 'AR', bbox: '33.0,-94.6,36.5,-89.6' },
  { state: 'CA', bbox: '32.5,-124.5,42.0,-114.1' },
  { state: 'CO', bbox: '37.0,-109.1,41.0,-102.0' },
  { state: 'CT', bbox: '41.0,-73.7,42.1,-71.8' },
  { state: 'DE', bbox: '38.4,-75.8,39.8,-75.0' },
  { state: 'DC', bbox: '38.8,-77.1,38.99,-76.9' },
  { state: 'FL', bbox: '24.5,-87.6,31.0,-80.0' },
  { state: 'GA', bbox: '30.4,-85.6,35.0,-80.8' },
  { state: 'HI', bbox: '18.9,-160.3,22.2,-154.8' },
  { state: 'ID', bbox: '42.0,-117.2,49.0,-111.0' },
  { state: 'IL', bbox: '36.9,-91.5,42.5,-87.0' },
  { state: 'IN', bbox: '37.8,-88.1,41.8,-84.8' },
  { state: 'IA', bbox: '40.4,-96.6,43.5,-90.1' },
  { state: 'KS', bbox: '37.0,-102.1,40.0,-94.6' },
  { state: 'KY', bbox: '36.5,-89.6,39.1,-81.9' },
  { state: 'LA', bbox: '28.9,-94.0,33.0,-89.0' },
  { state: 'ME', bbox: '43.1,-71.1,47.5,-66.9' },
  { state: 'MD', bbox: '37.9,-79.5,39.7,-75.0' },
  { state: 'MA', bbox: '41.2,-73.5,42.9,-69.9' },
  { state: 'MI', bbox: '41.7,-90.4,48.3,-82.4' },
  { state: 'MN', bbox: '43.5,-97.2,49.4,-89.5' },
  { state: 'MS', bbox: '30.2,-91.7,35.0,-88.1' },
  { state: 'MO', bbox: '36.0,-95.8,40.6,-89.1' },
  { state: 'MT', bbox: '44.4,-116.1,49.0,-104.0' },
  { state: 'NE', bbox: '40.0,-104.1,43.0,-95.3' },
  { state: 'NV', bbox: '35.0,-120.0,42.0,-114.0' },
  { state: 'NH', bbox: '42.7,-72.6,45.3,-70.6' },
  { state: 'NJ', bbox: '38.9,-75.6,41.4,-73.9' },
  { state: 'NM', bbox: '31.3,-109.1,37.0,-103.0' },
  { state: 'NY', bbox: '40.5,-79.8,45.0,-71.9' },
  { state: 'NC', bbox: '33.8,-84.3,36.6,-75.5' },
  { state: 'ND', bbox: '45.9,-104.1,49.0,-96.6' },
  { state: 'OH', bbox: '38.4,-84.8,42.0,-80.5' },
  { state: 'OK', bbox: '33.6,-103.0,37.0,-94.4' },
  { state: 'OR', bbox: '42.0,-124.7,46.2,-116.5' },
  { state: 'PA', bbox: '39.7,-80.5,42.3,-74.7' },
  { state: 'RI', bbox: '41.1,-71.9,42.0,-71.1' },
  { state: 'SC', bbox: '32.0,-83.4,35.2,-78.5' },
  { state: 'SD', bbox: '42.5,-104.1,45.9,-96.5' },
  { state: 'TN', bbox: '35.0,-90.3,36.7,-81.6' },
  { state: 'TX', bbox: '25.8,-106.7,36.5,-93.5' },
  { state: 'UT', bbox: '37.0,-114.1,42.0,-109.0' },
  { state: 'VT', bbox: '42.7,-73.4,45.0,-71.5' },
  { state: 'VA', bbox: '36.5,-83.7,39.5,-75.2' },
  { state: 'WA', bbox: '45.5,-124.8,49.0,-116.9' },
  { state: 'WV', bbox: '37.2,-82.7,40.6,-77.7' },
  { state: 'WI', bbox: '42.5,-92.9,47.1,-86.2' },
  { state: 'WY', bbox: '41.0,-111.1,45.0,-104.0' },
];

const SPORT_TO_DISCIPLINE = {
  'judo':                  'judo',
  'wrestling':             'wrestling',
  'boxing':                'boxing',
  'muay_thai':             'muay_thai',
  'muay thai':             'muay_thai',
  'kickboxing':            'kickboxing',
  'kick boxing':           'kickboxing',
  'mma':                   'mma',
  'mixed martial arts':    'mma',
  'jiu-jitsu':             'gi_bjj',
  'jiu jitsu':             'gi_bjj',
  'bjj':                   'gi_bjj',
  'brazilian_jiu-jitsu':   'gi_bjj',
  'martial_arts':          'gi_bjj',
  'grappling':             'nogi_bjj',
  'karate':                'karate',
  'taekwondo':             'taekwondo',
};

function inferDiscipline(tags) {
  const sport = (tags.sport || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();

  for (const [key, disc] of Object.entries(SPORT_TO_DISCIPLINE)) {
    if (sport.includes(key)) return disc;
  }

  if (/\bmuay.thai\b/.test(name)) return 'muay_thai';
  if (/\bkickbox/.test(name)) return 'kickboxing';
  if (/\bbox(?:ing)?\b/.test(name) && !/\bkickbox/.test(name)) return 'boxing';
  if (/\bjudo\b/.test(name)) return 'judo';
  if (/\bwrestling\b/.test(name)) return 'wrestling';
  if (/\bmma\b/.test(name)) return 'mma';
  if (/\bno.?gi\b|\bgrappling\b|\bsubmission\b/.test(name)) return 'nogi_bjj';
  if (/\bbjj\b|\bjiu.jitsu\b/.test(name)) return 'gi_bjj';
  if (/\bkarate\b/.test(name)) return 'karate';
  if (/\btaekwondo\b|\btae.kwon.do\b/.test(name)) return 'taekwondo';

  return 'gi_bjj';
}

async function queryOverpass(bbox, retries = 3) {
  const query = `
[out:json][timeout:45];
(
  node["sport"~"martial_arts|judo|jiu-jitsu|bjj|boxing|muay_thai|kickboxing|mma|wrestling|grappling|karate|taekwondo",i](${bbox});
  way["sport"~"martial_arts|judo|jiu-jitsu|bjj|boxing|muay_thai|kickboxing|mma|wrestling|grappling|karate|taekwondo",i](${bbox});
  node["amenity"="dojo"](${bbox});
  way["amenity"="dojo"](${bbox});
  node["leisure"="fitness_centre"]["sport"~"martial_arts|boxing|mma|judo|jiu-jitsu|wrestling",i](${bbox});
)->._;
out center;
`.trim();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'MatFinder/1.0 (open mat finder app)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (res.status === 429 || res.status === 503) {
        console.log(`    Rate limited, waiting 10s...`);
        await sleep(10000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt < retries) {
        console.log(`    Retry ${attempt}/${retries}: ${e.message}`);
        await sleep(5000 * attempt);
      } else {
        throw e;
      }
    }
  }
}

async function main() {
  const allGyms = [];

  for (const { state, bbox } of US_STATES) {
    console.log(`Querying OSM for ${state}...`);
    try {
      const data = await queryOverpass(bbox);
      const elements = data.elements || [];
      console.log(`  Got ${elements.length} elements`);

      for (const el of elements) {
        const tags = el.tags || {};
        if (!tags.name) continue;

        const lat = el.type === 'way' ? el.center?.lat : el.lat;
        const lng = el.type === 'way' ? el.center?.lon : el.lon;
        if (!lat || !lng) continue;

        const discipline = inferDiscipline(tags);
        const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
        const address = [
          tags['addr:housenumber'],
          tags['addr:street'],
        ].filter(Boolean).join(' ');

        allGyms.push({
          name: tags.name,
          address,
          city,
          state,
          country: 'US',
          lat: parseFloat(lat.toFixed(6)),
          lng: parseFloat(lng.toFixed(6)),
          discipline,
          website: tags.website || tags['contact:website'] || '',
          phone: tags.phone || tags['contact:phone'] || '',
        });
      }

      await sleep(3000);
    } catch (e) {
      console.log(`  Error for ${state}: ${e.message}`);
      await sleep(5000);
    }
  }

  // Deduplicate by name+state
  const seen = new Set();
  const unique = allGyms.filter(g => {
    const key = `${g.name.toLowerCase()}|${g.state}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\nTotal: ${allGyms.length}, after name dedup: ${unique.length}`);

  const byState = {};
  unique.forEach(g => { byState[g.state] = (byState[g.state] || 0) + 1; });
  const topStates = Object.entries(byState).sort((a,b) => b[1]-a[1]).slice(0, 15);
  console.log('Top states:', topStates.map(([s,n]) => `${s}:${n}`).join(', '));

  const byDisc = {};
  unique.forEach(g => { byDisc[g.discipline] = (byDisc[g.discipline] || 0) + 1; });
  console.log('By discipline:', JSON.stringify(byDisc));

  writeFileSync('scripts/us-osm-gyms.json', JSON.stringify(unique, null, 2));
  console.log(`Saved ${unique.length} gyms to scripts/us-osm-gyms.json`);
}

main().catch(console.error);
