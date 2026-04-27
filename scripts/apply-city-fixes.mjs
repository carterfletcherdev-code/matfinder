/**
 * Apply city fixes from scripts/city-fixes.json to lib/data.ts.
 * For each gym id in city-fixes.json, finds the gym object in data.ts
 * and updates its city (and state if empty).
 * Run after: node scripts/reverse-geocode-cities.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const fixesPath = join(__dir, 'city-fixes.json');
const fixes = JSON.parse(readFileSync(fixesPath, 'utf8'));
const ids = Object.keys(fixes);
console.log(`Applying ${ids.length} city fixes...`);

let dataTs = readFileSync(join(root, 'lib/data.ts'), 'utf8');

let applied = 0;
let skipped = 0;

for (const id of ids) {
  const { city, state } = fixes[id];
  if (!city) { skipped++; continue; }

  // Find the gym block by id. We look for `id: "GYMID"` then patch the city field.
  // Strategy: replace `  city: "",` (or with whitespace) near the id occurrence.
  // We use a targeted regex anchored to the id string to avoid false positives.

  // Find the position of this gym's id in the file
  const idPattern = new RegExp(`"id":\\s*"${escapeRegex(id)}"`, 'g');
  const idMatch = idPattern.exec(dataTs);
  if (!idMatch) { skipped++; continue; }

  const idPos = idMatch.index;

  // Look for city field within next 2000 chars after the id
  const window = dataTs.slice(idPos, idPos + 2000);
  const cityEmpty = window.match(/"city":\s*""/);
  if (!cityEmpty) { skipped++; continue; }

  const cityPos = idPos + cityEmpty.index;

  // Replace the empty city string
  const before = dataTs.slice(0, cityPos);
  const after = dataTs.slice(cityPos + cityEmpty[0].length);
  const escapedCity = city.replace(/"/g, '\\"');
  dataTs = before + `"city": "${escapedCity}"` + after;

  // If state is also empty, try to patch it too
  if (state) {
    const statePattern = new RegExp(`"state":\\s*""`);
    const newIdPos = before.length; // city was replaced, recalc window
    const newWindow = dataTs.slice(newIdPos, newIdPos + 2000);
    const stateEmpty = newWindow.match(/"state":\s*""/);
    if (stateEmpty) {
      const statePos = newIdPos + stateEmpty.index;
      const sb = dataTs.slice(0, statePos);
      const sa = dataTs.slice(statePos + stateEmpty[0].length);
      const escapedState = state.replace(/"/g, '\\"');
      dataTs = sb + `"state": "${escapedState}"` + sa;
    }
  }

  applied++;
  if (applied % 500 === 0) process.stdout.write(`\r  ${applied}/${ids.length} applied`);
}

console.log(`\nApplied: ${applied}, Skipped: ${skipped}`);

writeFileSync(join(root, 'lib/data.ts'), dataTs);
console.log('lib/data.ts updated.');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
