/**
 * One-time backfill: populate the new location columns on gym_overrides
 * (name / address / city / state / country / lat / lng) for every
 * `places_<place_id>` row, by reading the original 01-discovered.json
 * outputs from Phase 1, 1B, and 2 pipelines.
 *
 * Once this runs, /api/gyms will be able to surface the 6,070 override-
 * only gyms (the ones the pipelines discovered but that don't exist in
 * the seed JSON files) directly to users.
 *
 * Usage:
 *   node scripts/pipeline/backfill-override-locations.mjs
 *   node scripts/pipeline/backfill-override-locations.mjs --dry-run
 */

import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Env loader (same pattern as the rest of the pipeline) ───────────
function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  const text = readFileSync('.env.local', 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) process.env[key] = val;
  }
}
loadEnvLocal();

const DRY_RUN = process.argv.includes('--dry-run');

// ── 1) Build place_id → location map from the 3 phase JSON files ────
function loadDiscovered() {
  const out = new Map();
  const files = [
    'scripts/pipeline/data/phase1/01-discovered.json',
    'scripts/pipeline/data/phase1b/01-discovered.json',
    'scripts/pipeline/data/phase2/01-discovered.json',
  ];
  for (const path of files) {
    if (!existsSync(path)) {
      console.log(`  [skip] ${path} not found`);
      continue;
    }
    const data = JSON.parse(readFileSync(path, 'utf8'));
    for (const cityList of Object.values(data)) {
      for (const g of cityList) {
        if (!g.place_id) continue;
        // First write wins — Phase 1 has priority over 1B/2 for any
        // gym that appears in multiple phases (BJJ-first identity).
        if (!out.has(g.place_id)) {
          out.set(g.place_id, {
            name: g.name ?? null,
            address: g.address ?? null,
            city: g.city_name ?? null,
            state: parseStateFromAddress(g.address) ?? null,
            country: g.country ?? 'US',
            lat: g.lat ?? null,
            lng: g.lng ?? null,
          });
        }
      }
    }
    console.log(`  loaded ${path}: ${out.size} cumulative entries`);
  }
  return out;
}

/** Pull the 2-letter state code out of a US-style address.
 *  Matches the pattern ", XX 12345" or ", XX 12345-1234".
 *  Returns null for non-US addresses. */
function parseStateFromAddress(addr) {
  if (!addr) return null;
  const m = addr.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?(?:,|$)/);
  return m?.[1] ?? null;
}

// ── 2) Update gym_overrides rows in batches ─────────────────────────
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) {
    console.error('Missing SUPABASE env vars');
    process.exit(1);
  }
  const supa = createClient(url, sk, { auth: { persistSession: false } });

  console.log('Loading discovered.json files…');
  const discoveryMap = loadDiscovered();
  console.log(`  total unique place_ids in discovery: ${discoveryMap.size}`);

  console.log('\nFetching gym_overrides rows with places_* ids…');
  // Supabase default cap is 1000 rows per .select(). Page through with
  // .range() until we've seen everything.
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: pageErr } = await supa
      .from('gym_overrides')
      .select('gym_id, name, lat')
      .like('gym_id', 'places_%')
      .order('gym_id')
      .range(from, from + PAGE - 1);
    if (pageErr) {
      console.error('Fetch failed:', pageErr.message);
      process.exit(1);
    }
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  console.log(`  ${rows.length} places_* rows in gym_overrides`);

  // Filter to rows that need updating (name not yet populated)
  const toUpdate = rows.filter(r => !r.name || r.lat == null);
  console.log(`  ${toUpdate.length} rows still need name/lat populated`);

  if (toUpdate.length === 0) {
    console.log('\nNothing to do. ✓');
    return;
  }

  // Build update payload, skipping rows whose place_id we don't have
  // location data for (shouldn't happen but defensive).
  const updates = [];
  let missing = 0;
  for (const row of toUpdate) {
    const placeId = row.gym_id.replace(/^places_/, '');
    const loc = discoveryMap.get(placeId);
    if (!loc) { missing++; continue; }
    updates.push({
      gym_id: row.gym_id,
      name: loc.name,
      address: loc.address,
      city: loc.city,
      state: loc.state,
      country: loc.country,
      lat: loc.lat,
      lng: loc.lng,
      updated_at: new Date().toISOString(),
    });
  }
  console.log(`  ${updates.length} ready to update (${missing} not found in discovery JSON)`);

  if (DRY_RUN) {
    console.log('\nDry run — first 3 sample payloads:');
    console.log(JSON.stringify(updates.slice(0, 3), null, 2));
    return;
  }

  // Bulk upsert in chunks of 500
  console.log('\nUpserting…');
  let ok = 0, errs = 0;
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const { error: upsertErr } = await supa.from('gym_overrides').upsert(chunk);
    if (upsertErr) {
      errs += chunk.length;
      console.error(`  chunk ${i}: ${upsertErr.message}`);
    } else {
      ok += chunk.length;
      if ((i / 500) % 4 === 0) console.log(`  ${ok}/${updates.length} done`);
    }
  }
  console.log(`\nDone. ${ok} ok / ${errs} errors.`);

  // Sanity check — count rows now populated
  const { count: populated } = await supa
    .from('gym_overrides')
    .select('gym_id', { count: 'exact', head: true })
    .like('gym_id', 'places_%')
    .not('name', 'is', null)
    .not('lat', 'is', null);
  console.log(`Final: ${populated ?? '?'} places_* rows with name + lat populated.`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
