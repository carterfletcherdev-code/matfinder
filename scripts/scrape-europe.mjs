/**
 * Scrapes European martial arts gym data from Tapology
 * Geocodes using OpenStreetMap Nominatim
 * Outputs: scripts/europe-gyms.json
 */
import { readFileSync, writeFileSync } from 'fs';

const EU_COUNTRIES = {
  gb: { name: 'UK',  country: 'UK'  },
  ie: { name: 'IE',  country: 'IE'  },
  nl: { name: 'NL',  country: 'NL'  },
  de: { name: 'DE',  country: 'DE'  },
  es: { name: 'ES',  country: 'ES'  },
  fr: { name: 'FR',  country: 'FR'  },
  se: { name: 'SE',  country: 'SE'  },
  it: { name: 'IT',  country: 'IT'  },
  pt: { name: 'PT',  country: 'PT'  },
  no: { name: 'NO',  country: 'NO'  },
  dk: { name: 'DK',  country: 'DK'  },
  fi: { name: 'FI',  country: 'FI'  },
  be: { name: 'BE',  country: 'BE'  },
  ch: { name: 'CH',  country: 'CH'  },
  at: { name: 'AT',  country: 'AT'  },
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseTapologyPage(html, countryCode) {
  const gyms = [];
  const rows = html.split('<tr>').slice(2); // skip header
  for (const row of rows) {
    const nameMatch = row.match(/<a href="\/gyms\/[^"]+">([^<]+)<\/a>/);
    const locationMatch = row.match(/class='noBorder'>([^<]+, [^<]+)<\/td>/);
    if (!nameMatch || !locationMatch) continue;
    const name = nameMatch[1].trim();
    const locationStr = locationMatch[1].trim();
    // Location is "City, Region, Country" or "City, Country"
    const parts = locationStr.split(', ');
    const city = parts[0].trim();
    const country = EU_COUNTRIES[countryCode]?.country ?? countryCode.toUpperCase();
    gyms.push({ name, city, country, rawLocation: locationStr });
  }
  return gyms;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function geocodeCity(city, countryCode) {
  const q = encodeURIComponent(`${city}, ${countryCode}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'MatFinder/1.0 (open mat finder app)',
        'Accept-Language': 'en',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function inferDiscipline(name) {
  const n = name.toLowerCase();
  if (/\bno.?gi\b|\bgrappling\b|\bsubmission\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b|\bjiu-jitsu\b/.test(n)) return 'nogi_bjj';
  if (/\bjudo\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'judo';
  if (/\bwrestling\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'wrestling';
  if (/\bmuay.thai\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'muay_thai';
  if (/\bkickbox/.test(n) && !/\bbjj\b/.test(n)) return 'kickboxing';
  if (/\bbox(?:ing)?\b/.test(n) && !/\bkickbox\b|\bbjj\b/.test(n)) return 'boxing';
  if (/\bmma\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'mma';
  return 'gi_bjj';
}

async function main() {
  const allGyms = [];
  const cityCache = {};

  for (const [iso, meta] of Object.entries(EU_COUNTRIES)) {
    const url = `https://www.tapology.com/gyms/country/${iso}`;
    console.log(`Scraping ${meta.country} from ${url}...`);
    let html;
    try {
      html = await fetchPage(url);
      await sleep(1500);
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
      continue;
    }
    const gyms = parseTapologyPage(html, iso);
    console.log(`  Found ${gyms.length} gyms`);
    allGyms.push(...gyms.map(g => ({ ...g, iso })));
  }

  console.log(`\nTotal gyms scraped: ${allGyms.length}`);
  console.log('Geocoding by city (Nominatim, 1 req/sec)...');

  const geocoded = [];
  let geocodeCount = 0;
  let skipCount = 0;

  for (const gym of allGyms) {
    const cacheKey = `${gym.city}|${gym.iso}`;
    let coords = cityCache[cacheKey];
    if (!coords) {
      coords = await geocodeCity(gym.city, gym.iso);
      await sleep(1100); // Nominatim rate limit: 1 req/sec
      if (coords) {
        cityCache[cacheKey] = coords;
        geocodeCount++;
      }
    }
    if (!coords) {
      skipCount++;
      continue;
    }

    const discipline = inferDiscipline(gym.name);
    geocoded.push({
      name: gym.name,
      city: gym.city,
      country: gym.country,
      lat: parseFloat(coords.lat.toFixed(6)),
      lng: parseFloat(coords.lng.toFixed(6)),
      discipline,
    });
  }

  console.log(`Geocoded: ${geocodeCount} new, ${skipCount} skipped`);
  console.log(`Final: ${geocoded.length} gyms with coordinates`);

  const byCountry = {};
  geocoded.forEach(g => { byCountry[g.country] = (byCountry[g.country] || 0) + 1; });
  console.log('By country:', JSON.stringify(byCountry));

  writeFileSync('scripts/europe-gyms.json', JSON.stringify(geocoded, null, 2));
  console.log('Saved to scripts/europe-gyms.json');
}

main().catch(console.error);
