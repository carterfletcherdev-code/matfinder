/**
 * Stage 5: Apply verified extractions to a runtime-merged overrides file.
 *
 * Rather than mutate lib/data.ts (12k+ entries, easy to corrupt), we emit
 * lib/schedule-overrides.json keyed by gym id:
 *
 *   { [gymId]: { schedule: ScheduleEntry[], extracted_at: string } }
 *
 * The /api/gyms route merges these into each Gym at request time, replacing
 * open_mats[] with the open-mat subset of the verified schedule and attaching
 * the full schedule[] for the BJJ full-schedule view.
 *
 * Run:
 *   node scripts/pipeline/05-apply-results.mjs
 *   node scripts/pipeline/05-apply-results.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from './pipeline.config.mjs';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const DRY_RUN = !!args['dry-run'];

if (!existsSync(config.paths.extractedVerified)) {
  console.error(`Error: ${config.paths.extractedVerified} not found. Run Stage 4 first.`);
  process.exit(1);
}

const verified = JSON.parse(readFileSync(config.paths.extractedVerified, 'utf8'));
const failures = existsSync(config.paths.extractionFailures)
  ? JSON.parse(readFileSync(config.paths.extractionFailures, 'utf8'))
  : {};

console.log('─── Stage 5: Apply results to schedule-overrides.json ───');
console.log(`Verified gyms:   ${Object.keys(verified).length}`);
console.log(`Failed gyms:     ${Object.keys(failures).length}`);

// ── Build the overrides file ──────────────────────────────────────────────────
const overrides = {};
let totalEntries = 0;
let openMatEntries = 0;

const now = new Date().toISOString();
for (const [gymId, payload] of Object.entries(verified)) {
  const schedule = (payload?.schedule || []).map(e => ({
    day: e.day,
    start_time: e.start_time,
    end_time: e.end_time ?? null,
    class_name: e.class_name,
    discipline: e.discipline,
    is_open_mat: !!e.is_open_mat,
    is_kids: !!e.is_kids,
    level: e.level || null,
    verified: true,
    source_url: e.source_url || null,
    source_quote: e.source_quote || null,
    verified_at: e.verified_at || now,
  }));
  overrides[gymId] = { schedule, extracted_at: now };
  totalEntries += schedule.length;
  openMatEntries += schedule.filter(s => s.is_open_mat).length;
}

console.log(`Total schedule entries:  ${totalEntries}`);
console.log(`  Of which open mats:    ${openMatEntries}`);

if (DRY_RUN) {
  console.log('\n[DRY RUN — not writing file]');
  process.exit(0);
}

const out = 'lib/schedule-overrides.json';
writeFileSync(out, JSON.stringify(overrides, null, 2));
console.log(`\nWrote ${out} (${(JSON.stringify(overrides).length / 1024).toFixed(1)} KB)`);
console.log('\nNext: ensure app/api/gyms/route.ts merges these overrides into the response.');
