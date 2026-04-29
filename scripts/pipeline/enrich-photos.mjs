/**
 * Enrich every discovered gym with a photo URL + rating + review count
 * via Google Places Details API. Runs in one pass across all 3 phases.
 *
 * Cost estimate: ~6,800 gyms × $0.017/call ≈ $115
 * Runtime: ~15-20 min at concurrency 10
 *
 * Output:
 *   - Updates `gym_overrides` rows with: photo_url, rating, review_count
 *   - Writes scripts/pipeline/data/photos/01-fetched.json (checkpointed)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Load .env.local ────────────────────────────────────────────────
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

const OUT_DIR = 'scripts/pipeline/data/photos';
mkdirSync(OUT_DIR, { recursive: true });
const FETCHED = `${OUT_DIR}/01-fetched.json`;
const LOG = `${OUT_DIR}/run.log`;
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
};

const RESUME = process.argv.includes('--resume');

// ── Collect every place_id from all 3 phase runs ──────────────────
function loadPlaceIds() {
  const all = new Map();
  for (const dir of ['phase1', 'phase1b', 'phase2']) {
    const path = `scripts/pipeline/data/${dir}/01-discovered.json`;
    if (!existsSync(path)) continue;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    for (const gyms of Object.values(data)) {
      for (const g of gyms) {
        if (g.place_id && !all.has(g.place_id)) all.set(g.place_id, g);
      }
    }
  }
  return [...all.values()];
}

// ── Google Places Details ─────────────────────────────────────────
async function fetchDetails(placeId) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'rating,userRatingCount,photos',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Places ${res.status}: ${txt.slice(0, 150)}`);
  }
  return res.json();
}

// Build a stable photo URL from a photo resource name.
// Format: https://places.googleapis.com/v1/{name}/media?maxWidthPx=800&key=KEY
// Storing the resource name lets us re-render at any size later.
function buildPhotoUrl(photoName) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${key}`;
}

// ── Concurrency helper ────────────────────────────────────────────
async function runConcurrent(items, concurrency, fn) {
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try { await fn(items[idx], idx); }
      catch (e) { /* logged inside fn */ }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const gyms = loadPlaceIds();
  log(`Loaded ${gyms.length} unique place_ids across all 3 phases`);

  const fetched = (RESUME && existsSync(FETCHED))
    ? JSON.parse(readFileSync(FETCHED, 'utf8'))
    : {};

  // Resume = retry errors AND skip successes. Successful entries have at least
  // a `rating` or `photo_url` key (not just an `error` field).
  const isSuccess = (v) => v && !v.error;
  const work = gyms.filter(g => !isSuccess(fetched[g.place_id]));
  log(`${work.length} gyms remaining to fetch (retrying prior 429s)`);

  // Place Details QPM limit is much stricter than searchText. Drop concurrency
  // to 2 + retry on 429 with backoff.
  async function fetchWithRetry(placeId, attempt = 0) {
    try {
      return await fetchDetails(placeId);
    } catch (e) {
      if (e.message.startsWith('Places 429') && attempt < 5) {
        const wait = 2000 * Math.pow(2, attempt) + Math.random() * 1000; // 2s, 4s, 8s, 16s, 32s
        await new Promise(r => setTimeout(r, wait));
        return fetchWithRetry(placeId, attempt + 1);
      }
      throw e;
    }
  }

  let count = 0;
  await runConcurrent(work, 2, async (gym) => {
    try {
      const d = await fetchWithRetry(gym.place_id);
      fetched[gym.place_id] = {
        rating: d.rating ?? null,
        review_count: d.userRatingCount ?? null,
        photo_url: d.photos?.[0]?.name ? buildPhotoUrl(d.photos[0].name) : null,
      };
    } catch (e) {
      fetched[gym.place_id] = { error: e.message };
    }
    count++;
    if (count % 100 === 0) {
      const successCount = Object.values(fetched).filter(isSuccess).length;
      log(`  processed ${count}/${work.length}  ·  total successes: ${successCount}/${gyms.length}  (~$${(successCount * 0.017).toFixed(2)})`);
      writeFileSync(FETCHED, JSON.stringify(fetched, null, 2));
    }
  });
  writeFileSync(FETCHED, JSON.stringify(fetched, null, 2));

  // ── Apply to Supabase ──
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supa = createClient(url, sk, { auth: { persistSession: false } });

  const rows = [];
  for (const [placeId, d] of Object.entries(fetched)) {
    if (!d || d.error) continue;
    if (!d.photo_url && !d.rating) continue;
    rows.push({
      gym_id: `places_${placeId}`,
      photo_url: d.photo_url ?? null,
      rating: d.rating ?? null,
      review_count: d.review_count ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  log(`Upserting ${rows.length} rows to gym_overrides…`);
  let ok = 0, errs = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supa.from('gym_overrides').upsert(chunk);
    if (error) { errs += chunk.length; log(`  chunk ${i}: ${error.message}`); }
    else ok += chunk.length;
  }
  log(`Done. ${ok} upserted / ${errs} errors. Total fetched: ${Object.keys(fetched).length}`);

  // Summary
  const withPhoto = Object.values(fetched).filter(d => d?.photo_url).length;
  const withRating = Object.values(fetched).filter(d => d?.rating).length;
  log(`  • ${withPhoto} gyms have photos (${(withPhoto / gyms.length * 100).toFixed(0)}%)`);
  log(`  • ${withRating} gyms have ratings (${(withRating / gyms.length * 100).toFixed(0)}%)`);
}

main().catch(e => { log(`FATAL: ${e.stack ?? e.message}`); process.exit(1); });
