/**
 * Scrapes findanopenmat.com by intercepting all network requests
 * made when the page loads, then extracts gym/open-mat data.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const captured = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});
const page = await context.newPage();

// Intercept every response — look for JSON that has gym/location data
page.on('response', async (response) => {
  const url = response.url();
  const ct = response.headers()['content-type'] ?? '';
  if (!ct.includes('json')) return;
  try {
    const body = await response.json();
    const str = JSON.stringify(body);
    // Look for responses that contain location or open mat data
    if (
      str.includes('openMat') || str.includes('open_mat') ||
      str.includes('latitude') || str.includes('lat') ||
      str.includes('address') || str.includes('schedule') ||
      str.includes('gym') || str.includes('location') ||
      str.length > 500
    ) {
      console.log('CAPTURED:', url, '— keys:', Object.keys(body).slice(0, 8).join(', '));
      captured.push({ url, body });
    }
  } catch {}
});

console.log('Loading findanopenmat.com...');
try {
  await page.goto('https://findanopenmat.com', { waitUntil: 'networkidle', timeout: 30000 });
} catch (e) {
  console.log('Timeout (ok) — checking what we captured');
}

// Wait a bit for any deferred requests
await page.waitForTimeout(3000);

// Also dump what's in the DOM — the map might store data in window or a script tag
const windowData = await page.evaluate(() => {
  // Check for any global variables containing gym data
  const keys = Object.keys(window).filter(k =>
    !['onmessage','onmousedown','location','document','window','self','top','frames'].includes(k) &&
    typeof window[k] === 'object' &&
    window[k] !== null
  );
  const result = {};
  for (const k of keys.slice(0, 50)) {
    try {
      const v = window[k];
      const str = JSON.stringify(v);
      if (str && str.length > 100 && (str.includes('lat') || str.includes('gym') || str.includes('mat'))) {
        result[k] = v;
      }
    } catch {}
  }
  return result;
});

if (Object.keys(windowData).length > 0) {
  console.log('Found window data keys:', Object.keys(windowData));
  captured.push({ url: 'window', body: windowData });
}

// Dump the rendered page text to see what's in the DOM
const text = await page.evaluate(() => document.body.innerText.slice(0, 5000));
console.log('\n--- PAGE TEXT SAMPLE ---\n', text.slice(0, 2000));

console.log(`\nTotal JSON responses captured: ${captured.length}`);
writeFileSync('/Users/jaymin/BJJ Open Mat/matfinder/scripts/captured.json', JSON.stringify(captured, null, 2));
console.log('Saved to scripts/captured.json');

await browser.close();
