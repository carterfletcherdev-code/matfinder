/**
 * Scrapes European martial arts gym data from Tapology using Playwright
 * Geocodes using OpenStreetMap Nominatim
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const EU_COUNTRIES = {
  gb: 'UK', ie: 'IE', nl: 'NL', de: 'DE', es: 'ES',
  fr: 'FR', se: 'SE', it: 'IT', pt: 'PT', no: 'NO',
  dk: 'DK', fi: 'FI', be: 'BE', ch: 'CH', at: 'AT',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseTapologyHTML(html) {
  const gyms = [];
  const rowRegex = /<tr>[\s\S]*?<\/tr>/g;
  const rows = html.match(rowRegex) || [];
  for (const row of rows) {
    const nameMatch = row.match(/<a href="\/gyms\/[^"]+">([^<]+)<\/a>/);
    // Get the first noBorder td after the name link for location
    const cells = [...row.matchAll(/class='noBorder'>([\s\S]*?)<\/td>/g)].map(m => m[1].trim());
    if (!nameMatch || cells.length < 2) continue;
    const name = nameMatch[1].trim();
    const location = cells[1] || cells[0];
    if (!location || !location.includes(',')) continue;
    const city = location.split(',')[0].trim();
    gyms.push({ name, city, rawLocation: location });
  }
  return gyms;
}

function inferDiscipline(name) {
  const n = name.toLowerCase();
  if (/\bno.?gi\b|\bgrappling\b|\bsubmission\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'nogi_bjj';
  if (/\bjudo\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'judo';
  if (/\bwrestling\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'wrestling';
  if (/\bmuay.thai\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'muay_thai';
  if (/\bkickbox/.test(n) && !/\bbjj\b/.test(n)) return 'kickboxing';
  if (/\bbox(?:ing)?\b/.test(n) && !/\bkickbox\b|\bbjj\b/.test(n)) return 'boxing';
  if (/\bmma\b/.test(n) && !/\bbjj\b|\bjiu.jitsu\b/.test(n)) return 'mma';
  return 'gi_bjj';
}

async function geocodeCity(city, countryCode, cityCache) {
  const key = `${city.toLowerCase()}|${countryCode}`;
  if (cityCache[key]) return cityCache[key];

  const q = encodeURIComponent(`${city}, ${countryCode}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=${countryCode}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MatFinder/1.0 (open mat finder)', 'Accept-Language': 'en' },
    });
    const data = await res.json();
    if (data.length === 0) return null;
    const coords = { lat: parseFloat(parseFloat(data[0].lat).toFixed(6)), lng: parseFloat(parseFloat(data[0].lon).toFixed(6)) };
    cityCache[key] = coords;
    return coords;
  } catch {
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const allGyms = [];

  for (const [iso, country] of Object.entries(EU_COUNTRIES)) {
    const url = `https://www.tapology.com/gyms/country/${iso}`;
    console.log(`Scraping ${country}...`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Wait for the gym table to appear
      await page.waitForSelector('table.fcLeaderboard', { timeout: 8000 }).catch(() => {});
      const html = await page.content();
      const gyms = parseTapologyHTML(html);
      console.log(`  Found ${gyms.length} gyms`);
      gyms.forEach(g => allGyms.push({ ...g, iso, country }));
      await sleep(1500);
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\nTotal scraped: ${allGyms.length}`);

  // Deduplicate by name+city
  const seen = new Set();
  const unique = allGyms.filter(g => {
    const key = `${g.name.toLowerCase()}|${g.city.toLowerCase()}|${g.country}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`After name dedup: ${unique.length}`);

  // Geocode unique cities
  console.log('Geocoding cities...');
  const cityCache = {};
  const geocoded = [];
  let skip = 0;

  for (const gym of unique) {
    const key = `${gym.city.toLowerCase()}|${gym.iso}`;
    if (!cityCache[key]) {
      await sleep(1100); // Nominatim: 1 req/sec
    }
    const coords = await geocodeCity(gym.city, gym.iso, cityCache);
    if (!coords) { skip++; continue; }

    geocoded.push({
      name: gym.name,
      city: gym.city,
      country: gym.country,
      lat: coords.lat,
      lng: coords.lng,
      discipline: inferDiscipline(gym.name),
    });
  }

  console.log(`Geocoded: ${geocoded.length}, skipped: ${skip}`);

  const byCountry = {};
  geocoded.forEach(g => { byCountry[g.country] = (byCountry[g.country] || 0) + 1; });
  console.log('By country:', JSON.stringify(byCountry, null, 2));

  const byDisc = {};
  geocoded.forEach(g => { byDisc[g.discipline] = (byDisc[g.discipline] || 0) + 1; });
  console.log('By discipline:', JSON.stringify(byDisc, null, 2));

  writeFileSync('scripts/europe-gyms.json', JSON.stringify(geocoded, null, 2));
  console.log(`Saved ${geocoded.length} gyms to scripts/europe-gyms.json`);
}

main().catch(console.error);
