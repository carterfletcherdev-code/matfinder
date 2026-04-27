/**
 * apply-schedule-fixes.mjs
 *
 * Reads a schedule-report.json produced by verify-schedules.mjs and applies
 * the "update" entries to lib/data.ts.
 *
 * Only applies entries where suggested_action === "update" AND confidence is
 * "high" (or "medium" if --include-medium is passed).
 *
 * Run:
 *   node scripts/apply-schedule-fixes.mjs [--input=scripts/schedule-report.json] [--dry-run] [--include-medium]
 */

import { readFileSync, writeFileSync } from 'fs';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const INPUT = args.input || 'scripts/schedule-report.json';
const DRY_RUN = !!args['dry-run'];
const INCLUDE_MEDIUM = !!args['include-medium'];
const DATA_PATH = 'lib/data.ts';

let report;
try {
  report = JSON.parse(readFileSync(INPUT, 'utf8'));
} catch (e) {
  console.error(`Could not read report at ${INPUT}: ${e.message}`);
  process.exit(1);
}

let raw = readFileSync(DATA_PATH, 'utf8');

const toApply = (report.discrepancies ?? []).filter(entry => {
  if (entry.suggested_action !== 'update') return false;
  if (entry.confidence === 'high') return true;
  if (entry.confidence === 'medium' && INCLUDE_MEDIUM) return true;
  return false;
});

console.log(`Report: ${report.checked} gyms checked`);
console.log(`Updates with high confidence: ${toApply.length}`);
if (!INCLUDE_MEDIUM) console.log(`(Pass --include-medium to also apply medium-confidence fixes)`);
if (DRY_RUN) console.log('[dry-run — no writes]');
console.log('');

if (toApply.length === 0) {
  console.log('Nothing to apply.');
  process.exit(0);
}

// ── Build replacement open_mats array for a gym ───────────────────────────────
function buildOpenMatsJson(gymId, newMats, baseOpenMats) {
  // Preserve existing id format: gymId-matIndex-subIndex
  return newMats.map((m, i) => ({
    id: `${gymId}-${i + 1}-1`,
    discipline: m.discipline ?? baseOpenMats[0]?.discipline ?? 'bjj',
    day: m.day,
    start_time: m.start_time,
    end_time: m.end_time ?? baseOpenMats[0]?.end_time ?? '12:00',
    is_free: m.is_free ?? false,
    cost: m.is_free ? undefined : (m.cost ?? baseOpenMats[0]?.cost ?? 20),
    confirmed: true,
  }));
}

// ── Patch open_mats in data.ts for one gym ────────────────────────────────────
function patchOpenMats(src, gymId, newOpenMats) {
  const idMarker = `"id": "${gymId}",`;
  const pos = src.indexOf(idMarker);
  if (pos === -1) return { src, patched: false, reason: 'id not found' };

  const openMatsStart = src.indexOf('"open_mats": [', pos);
  if (openMatsStart === -1) return { src, patched: false, reason: 'open_mats not found' };

  // Find the matching closing ] for the open_mats array
  let depth = 0;
  let i = openMatsStart + '"open_mats": '.length;
  let arrayStart = i;
  while (i < src.length) {
    if (src[i] === '[') { depth++; }
    else if (src[i] === ']') { depth--; if (depth === 0) break; }
    i++;
  }
  const arrayEnd = i + 1; // past the ]

  const newJson = JSON.stringify(newOpenMats, null, 6)
    .split('\n')
    .map((line, idx) => idx === 0 ? line : '    ' + line)
    .join('\n');

  const newContent = src.slice(0, openMatsStart + '"open_mats": '.length) + newJson + src.slice(arrayEnd);
  return { src: newContent, patched: true };
}

// ── Main ──────────────────────────────────────────────────────────────────────
let patched = 0;
let skipped = 0;

for (const entry of toApply) {
  if (!entry.found_on_site?.length) {
    console.log(`  SKIP [${entry.gym_id}] ${entry.gym_name} — no open mats in report`);
    skipped++;
    continue;
  }

  const newMats = buildOpenMatsJson(entry.gym_id, entry.found_on_site, entry.stored);
  console.log(`  [${entry.gym_id}] ${entry.gym_name} (${entry.gym_city})`);
  console.log(`    stored: ${entry.stored.map(s => `${s.day} ${s.start_time}`).join(', ')}`);
  console.log(`    new:    ${newMats.map(m => `${m.day} ${m.start_time}`).join(', ')}`);
  console.log(`    note:   ${entry.discrepancies}`);

  if (!DRY_RUN) {
    const { src, patched: ok, reason } = patchOpenMats(raw, entry.gym_id, newMats);
    if (ok) {
      raw = src;
      patched++;
    } else {
      console.warn(`    WARNING: could not patch — ${reason}`);
      skipped++;
    }
  }
}

console.log(`\nSummary: ${patched} patched, ${skipped} skipped`);

if (!DRY_RUN && patched > 0) {
  writeFileSync(DATA_PATH, raw);
  console.log(`Wrote lib/data.ts`);
}
