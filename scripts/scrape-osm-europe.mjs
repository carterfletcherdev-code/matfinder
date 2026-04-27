/**
 * Queries OpenStreetMap Overpass API for martial arts gyms across ALL European countries
 * Run: node scripts/scrape-osm-europe.mjs
 */
import { writeFileSync } from 'fs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// All European countries with ISO codes and bounding boxes [south, west, north, east]
const EU_REGIONS = [
  // Western Europe (original 15)
  { country: 'UK',  bbox: '49.9,-7.6,60.9,1.8'   },
  { country: 'IE',  bbox: '51.4,-10.5,55.4,-6.0'  },
  { country: 'NL',  bbox: '50.7,3.3,53.6,7.2'     },
  { country: 'DE',  bbox: '47.3,6.0,55.1,15.0'    },
  { country: 'ES',  bbox: '36.0,-9.3,43.8,3.4'    },
  { country: 'FR',  bbox: '42.3,-4.8,51.1,8.2'    },
  { country: 'SE',  bbox: '55.3,10.9,69.1,24.2'   },
  { country: 'IT',  bbox: '37.0,6.6,47.1,18.5'    },
  { country: 'PT',  bbox: '36.9,-9.5,42.2,-6.2'   },
  { country: 'NO',  bbox: '57.9,4.5,71.2,31.1'    },
  { country: 'DK',  bbox: '54.6,8.1,57.8,15.2'    },
  { country: 'FI',  bbox: '59.8,20.0,70.1,31.6'   },
  { country: 'BE',  bbox: '49.5,2.5,51.5,6.4'     },
  { country: 'CH',  bbox: '45.8,5.9,47.8,10.5'    },
  { country: 'AT',  bbox: '46.4,9.5,48.8,17.2'    },
  // Southern & Eastern Europe
  { country: 'GR',  bbox: '34.8,19.4,41.8,29.6'   },
  { country: 'PL',  bbox: '49.0,14.1,54.9,24.2'   },
  { country: 'CZ',  bbox: '48.5,12.1,51.1,18.9'   },
  { country: 'HU',  bbox: '45.7,16.1,48.6,22.9'   },
  { country: 'RO',  bbox: '43.6,20.3,48.3,30.0'   },
  { country: 'BG',  bbox: '41.2,22.4,44.2,28.6'   },
  { country: 'HR',  bbox: '42.3,13.5,46.6,19.5'   },
  { country: 'SI',  bbox: '45.4,13.4,46.9,16.6'   },
  { country: 'SK',  bbox: '47.7,16.8,49.6,22.6'   },
  { country: 'RS',  bbox: '42.2,18.8,46.2,23.0'   },
  { country: 'BA',  bbox: '42.6,15.7,45.3,19.6'   },
  { country: 'ME',  bbox: '41.8,18.4,43.6,20.4'   },
  { country: 'MK',  bbox: '40.8,20.4,42.4,23.0'   },
  { country: 'AL',  bbox: '39.6,19.3,42.7,21.1'   },
  { country: 'XK',  bbox: '41.8,20.0,43.3,21.8'   },
  // Baltic states
  { country: 'LT',  bbox: '53.9,20.9,56.5,26.8'   },
  { country: 'LV',  bbox: '55.7,20.9,57.8,28.3'   },
  { country: 'EE',  bbox: '57.5,21.8,59.7,28.2'   },
  // Small states
  { country: 'LU',  bbox: '49.4,5.7,50.2,6.5'     },
  { country: 'CY',  bbox: '34.6,32.3,35.7,34.6'   },
  { country: 'MT',  bbox: '35.8,14.2,36.1,14.6'   },
  { country: 'AD',  bbox: '42.4,1.4,42.7,1.8'     },
  { country: 'MC',  bbox: '43.7,7.4,43.8,7.5'     },
  { country: 'SM',  bbox: '43.9,12.4,44.0,12.5'   },
  { country: 'LI',  bbox: '47.0,9.5,47.3,9.6'     },
  // Northern Europe
  { country: 'IS',  bbox: '63.3,-24.5,66.6,-13.5' },
  // Eastern Europe
  { country: 'UA',  bbox: '44.4,22.1,52.4,40.2'   },
  { country: 'MD',  bbox: '45.4,26.6,48.5,30.1'   },
  { country: 'BY',  bbox: '51.2,23.2,56.2,32.8'   },
  // Caucasus (sometimes counted as European)
  { country: 'GE',  bbox: '41.0,39.9,43.6,46.7'   },
  { country: 'AM',  bbox: '38.8,43.4,41.3,46.6'   },
];

const SPORT_TO_DISCIPLINE = {
  'judo':                'judo',
  'wrestling':           'wrestling',
  'boxing':              'boxing',
  'muay_thai':           'muay_thai',
  'muay thai':           'muay_thai',
  'kickboxing':          'kickboxing',
  'kick boxing':         'kickboxing',
  'mma':                 'mma',
  'mixed martial arts':  'mma',
  'jiu-jitsu':           'gi_bjj',
  'jiu jitsu':           'gi_bjj',
  'bjj':                 'gi_bjj',
  'brazilian_jiu-jitsu': 'gi_bjj',
  'martial_arts':        'gi_bjj',
  'grappling':           'nogi_bjj',
  'karate':              'karate',
  'taekwondo':           'taekwondo',
  'sambo':               'wrestling',
};

function inferDisciplineFromOSM(tags) {
  const sport = (tags.sport || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();

  for (const [key, disc] of Object.entries(SPORT_TO_DISCIPLINE)) {
    if (sport.includes(key)) return disc;
  }

  if (/\bmuay.thai\b/.test(name)) return 'muay_thai';
  if (/\bkickbox/.test(name)) return 'kickboxing';
  if (/\bbox(?:ing)?\b/.test(name) && !/\bkickbox/.test(name)) return 'boxing';
  if (/\bjudo\b/.test(name)) return 'judo';
  if (/\bwrestling\b|\bsambo\b/.test(name)) return 'wrestling';
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
  node["sport"~"martial_arts|judo|jiu-jitsu|bjj|boxing|muay_thai|kickboxing|mma|wrestling|grappling|karate|taekwondo|sambo",i](${bbox});
  way["sport"~"martial_arts|judo|jiu-jitsu|bjj|boxing|muay_thai|kickboxing|mma|wrestling|grappling|karate|taekwondo|sambo",i](${bbox});
  node["amenity"="dojo"](${bbox});
  way["amenity"="dojo"](${bbox});
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
        console.log(`    Rate limited, waiting 15s...`);
        await sleep(15000);
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

  for (const { country, bbox } of EU_REGIONS) {
    console.log(`Querying OSM for ${country}...`);
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

        const discipline = inferDisciplineFromOSM(tags);
        const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
        const address = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');

        allGyms.push({
          name: tags.name,
          address,
          city,
          country,
          lat: parseFloat(lat.toFixed(6)),
          lng: parseFloat(lng.toFixed(6)),
          discipline,
          website: tags.website || tags['contact:website'] || '',
        });
      }

      await sleep(3000);
    } catch (e) {
      console.log(`  Error for ${country}: ${e.message}`);
      await sleep(5000);
    }
  }

  // Deduplicate by name+country
  const seen = new Set();
  const unique = allGyms.filter(g => {
    const key = `${g.name.toLowerCase()}|${g.country}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\nTotal: ${allGyms.length}, after dedup: ${unique.length}`);

  const byCountry = {};
  unique.forEach(g => { byCountry[g.country] = (byCountry[g.country] || 0) + 1; });
  console.log('By country:', JSON.stringify(byCountry, null, 2));

  const byDisc = {};
  unique.forEach(g => { byDisc[g.discipline] = (byDisc[g.discipline] || 0) + 1; });
  console.log('By discipline:', JSON.stringify(byDisc, null, 2));

  writeFileSync('scripts/europe-gyms.json', JSON.stringify(unique, null, 2));
  console.log(`Saved ${unique.length} gyms to scripts/europe-gyms.json`);
}

main().catch(console.error);
