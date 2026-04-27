/**
 * Queries OpenStreetMap Overpass API for martial arts gyms globally,
 * outside the regions already covered by scrape-osm-us.mjs and scrape-osm-europe.mjs.
 *
 * Covers:
 *   - North America (Canada, Mexico, Central America, Caribbean)
 *   - South America (all major countries — BJJ heartland: Brazil)
 *   - Asia (Japan, Korea, China, India, SE Asia, Middle East)
 *   - Oceania (Australia, NZ)
 *   - Africa (top markets)
 *
 * Large countries are split into 2–4 sub-bboxes so Overpass queries don't time out.
 *
 * Run: node scripts/scrape-osm-global.mjs
 */
import { writeFileSync } from 'fs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Each region: [south, west, north, east]
// For continent-spanning countries (BR, CN, RU-Asia, IN, AU, CA), split into chunks.
const REGIONS = [
  // ── North America (excluding US — already covered) ──────────────
  { country: 'CA', label: 'Canada-W',  bbox: '48.0,-141.0,70.0,-95.0' },
  { country: 'CA', label: 'Canada-E',  bbox: '41.7,-95.0,70.0,-52.0'  },
  { country: 'MX', label: 'Mexico-N',  bbox: '23.0,-118.0,32.7,-97.0' },
  { country: 'MX', label: 'Mexico-S',  bbox: '14.5,-118.0,23.0,-86.7' },
  // Central America
  { country: 'GT', bbox: '13.7,-92.3,17.8,-88.2' },
  { country: 'BZ', bbox: '15.9,-89.2,18.5,-87.8' },
  { country: 'HN', bbox: '12.9,-89.4,16.5,-83.2' },
  { country: 'SV', bbox: '13.1,-90.2,14.5,-87.7' },
  { country: 'NI', bbox: '10.7,-87.7,15.0,-83.1' },
  { country: 'CR', bbox: '8.0,-85.9,11.2,-82.6'  },
  { country: 'PA', bbox: '7.2,-83.0,9.7,-77.2'   },
  // Caribbean
  { country: 'CU', bbox: '19.8,-85.0,23.3,-74.1' },
  { country: 'DO', bbox: '17.5,-72.0,20.0,-68.3' },
  { country: 'PR', bbox: '17.9,-67.3,18.5,-65.6' },
  { country: 'JM', bbox: '17.7,-78.4,18.5,-76.2' },
  { country: 'TT', bbox: '10.0,-61.9,11.4,-60.5' },

  // ── South America ─────────────────────────────────────────────
  // Brazil — BJJ heartland, split into 4 quadrants
  { country: 'BR', label: 'Brazil-N',  bbox: '-5.3,-74.0,5.3,-46.0'    },
  { country: 'BR', label: 'Brazil-NE', bbox: '-18.0,-46.0,-2.0,-34.7'  },
  { country: 'BR', label: 'Brazil-CW', bbox: '-25.0,-66.0,-5.3,-46.0'  },
  { country: 'BR', label: 'Brazil-SE', bbox: '-34.0,-58.0,-18.0,-39.0' },
  { country: 'AR', label: 'Argentina-N', bbox: '-35.0,-73.6,-22.0,-53.6' },
  { country: 'AR', label: 'Argentina-S', bbox: '-55.0,-73.6,-35.0,-53.6' },
  { country: 'CL', bbox: '-56.0,-76.0,-17.5,-66.4' },
  { country: 'CO', bbox: '-4.2,-79.0,12.5,-66.9'   },
  { country: 'PE', bbox: '-18.4,-81.4,-0.0,-68.7'  },
  { country: 'EC', bbox: '-5.0,-81.0,1.5,-75.2'    },
  { country: 'VE', bbox: '0.6,-73.4,12.2,-59.8'    },
  { country: 'UY', bbox: '-35.0,-58.4,-30.0,-53.1' },
  { country: 'PY', bbox: '-27.6,-62.6,-19.3,-54.3' },
  { country: 'BO', bbox: '-22.9,-69.6,-9.7,-57.5'  },
  { country: 'GY', bbox: '1.2,-61.4,8.6,-56.5'     },
  { country: 'SR', bbox: '1.8,-58.1,6.0,-53.9'     },

  // ── Oceania ───────────────────────────────────────────────────
  { country: 'AU', label: 'Australia-E', bbox: '-43.6,138.0,-10.7,153.6' },
  { country: 'AU', label: 'Australia-W', bbox: '-43.6,113.3,-10.7,138.0' },
  { country: 'NZ', bbox: '-47.3,166.4,-34.4,178.6' },
  { country: 'PG', bbox: '-11.7,140.8,-1.0,156.0'  },
  { country: 'FJ', bbox: '-19.2,177.0,-16.0,180.0' },

  // ── East Asia ─────────────────────────────────────────────────
  { country: 'JP', label: 'Japan-N', bbox: '36.0,128.0,46.0,146.0' },
  { country: 'JP', label: 'Japan-S', bbox: '24.0,122.0,36.0,146.0' },
  { country: 'KR', bbox: '33.0,124.5,38.7,131.0' },
  { country: 'CN', label: 'China-NE', bbox: '32.0,103.0,53.6,135.0' },
  { country: 'CN', label: 'China-NW', bbox: '32.0,73.5,49.2,103.0'  },
  { country: 'CN', label: 'China-SE', bbox: '18.0,103.0,32.0,123.0' },
  { country: 'CN', label: 'China-SW', bbox: '21.5,73.5,32.0,103.0'  },
  { country: 'TW', bbox: '21.9,120.0,25.3,122.0' },
  { country: 'HK', bbox: '22.1,113.8,22.6,114.5' },
  { country: 'MN', bbox: '41.6,87.7,52.2,119.9'  },

  // ── Southeast Asia ────────────────────────────────────────────
  { country: 'TH', bbox: '5.6,97.3,20.5,105.6'  }, // muay thai capital
  { country: 'VN', bbox: '8.4,102.1,23.4,109.5' },
  { country: 'PH', bbox: '4.6,116.9,21.1,126.6' },
  { country: 'ID', label: 'Indonesia-W', bbox: '-11.0,95.0,2.0,116.0'  },
  { country: 'ID', label: 'Indonesia-E', bbox: '-11.0,116.0,6.1,141.0' },
  { country: 'MY', bbox: '0.9,99.6,7.4,119.3'   },
  { country: 'SG', bbox: '1.2,103.6,1.5,104.1'  },
  { country: 'KH', bbox: '10.4,102.3,14.7,107.6' },
  { country: 'LA', bbox: '13.9,100.1,22.5,107.7' },
  { country: 'MM', bbox: '9.5,92.2,28.6,101.2'  },

  // ── South Asia ────────────────────────────────────────────────
  { country: 'IN', label: 'India-N', bbox: '23.0,68.0,35.7,89.0' },
  { country: 'IN', label: 'India-S', bbox: '6.5,68.0,23.0,93.0'  },
  { country: 'PK', bbox: '23.6,60.9,37.1,77.0' },
  { country: 'BD', bbox: '20.7,88.0,26.6,92.7' },
  { country: 'LK', bbox: '5.9,79.7,9.9,81.9'   },
  { country: 'NP', bbox: '26.3,80.0,30.5,88.2' },

  // ── Middle East ───────────────────────────────────────────────
  { country: 'IL', bbox: '29.5,34.2,33.4,35.9'  },
  { country: 'AE', bbox: '22.6,51.5,26.1,56.4'  },
  { country: 'SA', label: 'Saudi-N', bbox: '24.0,34.5,32.2,55.7' },
  { country: 'SA', label: 'Saudi-S', bbox: '16.4,34.5,24.0,55.7' },
  { country: 'TR', label: 'Turkey-W', bbox: '36.0,26.0,42.1,33.5' },
  { country: 'TR', label: 'Turkey-E', bbox: '36.0,33.5,42.1,44.8' },
  { country: 'IR', label: 'Iran-N', bbox: '32.0,44.0,40.0,63.3' },
  { country: 'IR', label: 'Iran-S', bbox: '25.1,44.0,32.0,63.3' },
  { country: 'JO', bbox: '29.2,34.9,33.4,39.3' },
  { country: 'LB', bbox: '33.0,35.1,34.7,36.6' },
  { country: 'KW', bbox: '28.5,46.5,30.1,48.4' },
  { country: 'QA', bbox: '24.5,50.7,26.2,51.7' },
  { country: 'BH', bbox: '25.8,50.4,26.4,50.8' },
  { country: 'OM', bbox: '16.6,52.0,26.7,59.9' },

  // ── Africa (top markets only — keep query budget reasonable) ──
  { country: 'ZA', label: 'SA-N', bbox: '-27.0,16.5,-22.1,32.9' },
  { country: 'ZA', label: 'SA-S', bbox: '-35.0,16.5,-27.0,32.9' },
  { country: 'EG', bbox: '21.7,24.7,31.7,36.9' },
  { country: 'MA', bbox: '21.0,-17.1,35.9,-1.0' },
  { country: 'KE', bbox: '-4.7,33.9,4.6,41.9'   },
  { country: 'NG', bbox: '4.2,2.7,13.9,14.7'    },
  { country: 'GH', bbox: '4.7,-3.3,11.2,1.2'    },
  { country: 'TN', bbox: '30.2,7.5,37.5,11.6'   },
  { country: 'DZ', label: 'Algeria-N', bbox: '32.0,-8.7,37.1,11.0' },
  { country: 'ET', bbox: '3.4,32.9,14.9,48.0'   },

  // ── Russia (Asian portion not in Europe scraper) ──────────────
  { country: 'RU', label: 'Russia-Sib-W', bbox: '50.0,60.0,70.0,90.0'  },
  { country: 'RU', label: 'Russia-Sib-E', bbox: '50.0,90.0,75.0,140.0' },
  { country: 'RU', label: 'Russia-FE',    bbox: '42.0,130.0,75.0,180.0' },
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
[out:json][timeout:60];
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
        console.log(`    Rate limited, waiting 20s...`);
        await sleep(20000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt < retries) {
        console.log(`    Retry ${attempt}/${retries}: ${e.message}`);
        await sleep(8000 * attempt);
      } else {
        throw e;
      }
    }
  }
}

async function main() {
  const allGyms = [];
  const tally = {};

  for (const region of REGIONS) {
    const lbl = region.label ? `${region.country} (${region.label})` : region.country;
    console.log(`Querying OSM for ${lbl}...`);
    try {
      const data = await queryOverpass(region.bbox);
      const elements = data.elements || [];
      console.log(`  Got ${elements.length} elements`);
      tally[lbl] = elements.length;

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
          country: region.country,
          lat: parseFloat(lat.toFixed(6)),
          lng: parseFloat(lng.toFixed(6)),
          discipline,
          website: tags.website || tags['contact:website'] || '',
        });
      }
      await sleep(4000);
    } catch (e) {
      console.log(`  Error for ${lbl}: ${e.message}`);
      tally[lbl] = `ERR: ${e.message}`;
      await sleep(8000);
    }
  }

  // Dedup by name+country+rough-coords (catches sub-bbox overlaps)
  const seen = new Set();
  const unique = allGyms.filter(g => {
    const key = `${g.name.toLowerCase()}|${g.country}|${g.lat.toFixed(3)}|${g.lng.toFixed(3)}`;
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
  console.log('Per-bbox tally:', JSON.stringify(tally, null, 2));

  writeFileSync('scripts/global-gyms.json', JSON.stringify(unique, null, 2));
  console.log(`Saved ${unique.length} gyms to scripts/global-gyms.json`);
}

main().catch(console.error);
