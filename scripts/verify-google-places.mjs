/**
 * verify-google-places.mjs
 *
 * Uses Google Places API (Nearby Search + Place Details) to confirm
 * discipline for gyms that have no website or weren't resolved by verify-websites.mjs.
 *
 * Looks at: business name, place types, editorial_summary, and reviews
 * for gi/no-gi keywords.
 *
 * Cost: ~$0.017 per gym (Nearby Search + Details = 2 calls)
 *       For 4,245 no-website gyms ≈ $72 total.
 *
 * Prerequisites:
 *   export GOOGLE_PLACES_API_KEY="your-key-here"
 *
 * Run: node scripts/verify-google-places.mjs [--dry-run] [--limit=100]
 *
 * Get a free key (with $200/mo credit) at:
 *   https://console.cloud.google.com/apis/library/places-backend.googleapis.com
 */

import { readFileSync, writeFileSync } from 'fs';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('Error: GOOGLE_PLACES_API_KEY environment variable not set.');
  console.error('Get a key at: https://console.cloud.google.com/apis/library/places-backend.googleapis.com');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const LIMIT = args.limit ? parseInt(args.limit) : Infinity;
const DRY_RUN = !!args['dry-run'];
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency) : 3;
const DELAY_MS = 100; // avoid rate limiting

// ── Keyword scoring (same as verify-websites) ─────────────────────────────────

const NOGI_PATTERNS = [/\bno[- ]?gi\b/i, /\bnogi\b/i, /\b10th?\s*planet\b/i, /\bgrappling\b/i, /\bsubmission\s*(wrestling|only)\b/i];
const GI_PATTERNS = [/\bgi\s+(class|bjj|jiu.jitsu|training)\b/i, /\bkimono\b/i, /\btrain\s+in\s+gi\b/i];
const AFFILIATION_NOGI = [/\b10th?\s*planet\b/i, /\bb[- ]?team\b.*jiu.jitsu/i];
const AFFILIATION_GI = [/\bgracie\s+barra\b/i, /\bcarlson\s+gracie\b/i, /\brenzo\s+gracie\b/i, /\broger\s+gracie\b/i, /\balliance\s+bjj\b/i, /\bcheckmat\b/i, /\batos\s+bjj\b/i, /\bgma\s+bjj\b/i];

function scoreText(text) {
  let nogi = 0, gi = 0;
  for (const p of NOGI_PATTERNS) if (p.test(text)) nogi += 2;
  for (const p of GI_PATTERNS) if (p.test(text)) gi += 2;
  return { nogi, gi };
}

function classifyName(name) {
  for (const p of AFFILIATION_NOGI) if (p.test(name)) return 'nogi_bjj';
  for (const p of AFFILIATION_GI) if (p.test(name)) return 'gi_bjj';
  return null;
}

function classify(nogiScore, giScore) {
  if (nogiScore === 0 && giScore === 0) return null;
  if (nogiScore > 0 && giScore > 0 && Math.abs(nogiScore - giScore) <= 1) return null;
  return nogiScore > giScore ? 'nogi_bjj' : 'gi_bjj';
}

// ── Google Places helpers ─────────────────────────────────────────────────────

async function findPlace(gym) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${gym.lat},${gym.lng}&radius=100&keyword=${encodeURIComponent(gym.name)}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) return null;
  // Pick closest result
  return data.results[0].place_id;
}

async function getPlaceDetails(placeId) {
  const fields = 'name,editorial_summary,reviews,types';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result ?? null;
}

async function classifyGym(gym) {
  // First try name
  const nameDisc = classifyName(gym.name);
  if (nameDisc) return { disc: nameDisc, source: 'name' };

  try {
    const placeId = await findPlace(gym);
    if (!placeId) return null;

    await new Promise(r => setTimeout(r, DELAY_MS));

    const details = await getPlaceDetails(placeId);
    if (!details) return null;

    // Aggregate text from all available fields
    const texts = [
      details.name ?? '',
      details.editorial_summary?.overview ?? '',
      ...(details.reviews ?? []).map(r => r.text ?? ''),
    ].join(' ');

    const { nogi, gi } = scoreText(texts);
    const disc = classify(nogi, gi);
    return disc ? { disc, source: 'google_places' } : null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const content = readFileSync('lib/data.ts', 'utf8');
  const arrayMatches = [...content.matchAll(/export const \w+ *: *Gym\[\] *= *(\[[\s\S]*?\n\]);/g)];
  const allGyms = arrayMatches.flatMap(m => { try { return JSON.parse(m[1]); } catch { return []; } });

  // Target: gyms with unconfirmed bjj and no website
  const candidates = allGyms.filter(g =>
    !g.website &&
    g.open_mats.some(o => o.discipline === 'bjj')
  );

  const toProcess = candidates.slice(0, LIMIT);
  console.log(`\nCandidates: ${candidates.length} no-website unknown-BJJ gyms`);
  console.log(`Processing: ${toProcess.length}`);
  console.log(`Estimated cost: $${(toProcess.length * 0.034).toFixed(2)}\n`);

  const results = new Map();
  let upgraded = 0;
  let noSignal = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async gym => {
      try {
        const result = await classifyGym(gym);
        if (result) {
          results.set(gym.id, result);
          upgraded++;
        } else {
          noSignal++;
        }
      } catch {
        failed++;
      }
    }));
    const done = Math.min(i + CONCURRENCY, toProcess.length);
    process.stdout.write(`\r  ${done}/${toProcess.length} — ${upgraded} confirmed, ${failed} failed`);
  }

  const nogiCount = [...results.values()].filter(r => r.disc === 'nogi_bjj').length;
  const giCount = [...results.values()].filter(r => r.disc === 'gi_bjj').length;
  console.log(`\n\nResults: ${upgraded} upgraded (No-Gi: ${nogiCount}, Gi: ${giCount})`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Not writing data.ts');
    let shown = 0;
    for (const [id, r] of results) {
      if (shown++ >= 20) break;
      const gym = allGyms.find(g => g.id === id);
      console.log(`  ${gym?.name} (${gym?.city}) → ${r.disc} [${r.source}]`);
    }
    return;
  }

  // Patch data.ts
  let newContent = content;
  let patched = 0;
  for (const [id, result] of results) {
    const idStr = `"id": "${id}"`;
    const idPos = newContent.indexOf(idStr);
    if (idPos === -1) continue;
    const blockStart = idPos - 20;
    const blockEnd = newContent.indexOf('\n  }', idPos);
    if (blockEnd === -1) continue;
    const gymBlock = newContent.slice(blockStart, blockEnd + 6);
    let newBlock = gymBlock
      .replace(/"discipline": "bjj"/g, `"discipline": "${result.disc}"`)
      .replace(/"confirmed": false/g, '"confirmed": true');
    if (newBlock !== gymBlock) {
      newContent = newContent.slice(0, blockStart) + newBlock + newContent.slice(blockEnd + 6);
      patched++;
    }
  }

  writeFileSync('lib/data.ts', newContent);
  console.log(`Wrote lib/data.ts — ${patched} blocks patched`);

  // Estimate new rate
  const totalMats = allGyms.flatMap(g => g.open_mats).length;
  const alreadyConfirmed = allGyms.flatMap(g => g.open_mats).filter(o => o.confirmed).length;
  const projected = alreadyConfirmed + upgraded;
  console.log(`\nProjected: ${projected}/${totalMats} (${(100*projected/totalMats).toFixed(1)}%)`);
}

main().catch(console.error);
