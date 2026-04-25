/**
 * verify-websites.mjs
 *
 * Fetches each gym's website (homepage + schedule/classes subpages) to
 * upgrade discipline from 'bjj' (unknown) → 'gi_bjj' or 'nogi_bjj' (confirmed).
 * Also detects drop_in_friendly, loaner_gi, free_for_visitors.
 *
 * Run: node scripts/verify-websites.mjs
 * Options:
 *   --limit=500     process at most N gyms (default: all)
 *   --concurrency=5 parallel fetches (default: 5)
 *   --dry-run       print results without writing data.ts
 */

import { readFileSync, writeFileSync } from 'fs';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);

const LIMIT = args.limit ? parseInt(args.limit) : Infinity;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency) : 5;
const DRY_RUN = !!args['dry-run'];
const TIMEOUT_MS = 8000;

// Sub-paths to also fetch for better schedule signals
const SCHEDULE_PATHS = ['/schedule', '/classes', '/programs', '/timetable', '/training', '/about'];

// ── Affiliation rules (name-based, high confidence) ───────────────────────────
// These are applied before web-scraping and are very reliable.
const AFFILIATION_NOGI = [
  /\b10th?\s*planet\b/i,
  /\b10p\b/i,
  /\bb[- ]?team\b.*jiu.jitsu/i,
  /\bdanaher\b/i,
];

const AFFILIATION_GI = [
  /\bgracie\s+barra\b/i,
  /\bcarlson\s+gracie\b/i,
  /\brenzo\s+gracie\b/i,
  /\broger\s+gracie\b/i,
  /\bgracie\s+humaita\b/i,
  /\bgracie\s+university\b/i,
  /\balliance\s+bjj\b/i,
  /\bcheckmat\b/i,
  /\batos\s+bjj\b/i,
  /\bmarcelo\s+garcia\b/i,
  /\bpedro\s+sauer\b/i,
  /\bribeiro\s+(jiu.jitsu|bjj)\b/i,
  /\bgma\s+bjj\b/i,
  /\bfabio\s+gurgel\b/i,
];

function checkAffiliation(name) {
  for (const p of AFFILIATION_NOGI) if (p.test(name)) return 'nogi_bjj';
  for (const p of AFFILIATION_GI) if (p.test(name)) return 'gi_bjj';
  return null;
}

// ── Keyword patterns ──────────────────────────────────────────────────────────

const NOGI_STRONG = [
  /\bno[- ]?gi\b/i,
  /\bnogi\b/i,
  /\b10th?\s*planet\b/i,
  /\bsubmission\s*wrestling\b/i,
  /\bsubmission\s*only\b/i,
];

const NOGI_WEAK = [
  /\bgrappling\s+class/i,
  /\bgrappling\s+session/i,
  /\bgrappling\s+open/i,
];

const GI_STRONG = [
  /\bgi\s+class\b/i,
  /\bgi\s+bjj\b/i,
  /\bgi\s+jiu.jitsu\b/i,
  /\bgi\s+training\b/i,
  /\bgi\s+open\s+mat\b/i,
  /\btrain\s+in\s+gi\b/i,
  /\bkimono\b/i,
];

const GI_WEAK = [
  // standalone "gi" not preceded by "no", only if multiple occurrences
];

// Use-case signals
const DROP_IN_PATTERNS = [
  /\bdrop[- ]?in\b/i,
  /\bvisitors?\s+welcome\b/i,
  /\bguests?\s+welcome\b/i,
  /\bopen\s+to\s+all\b/i,
  /\bdrop\s+in\s+(and\s+)?(train|roll|class|session)/i,
  /\bwelcome\s+visitors?\b/i,
];

const LOANER_GI_PATTERNS = [
  /\bloaner\s+gi\b/i,
  /\bgi\s+rental\b/i,
  /\brental\s+gi\b/i,
  /\bborrow\s+a?\s*gi\b/i,
  /\bgi(s)?\s+available\s+to\s+(rent|borrow|loan)\b/i,
  /\bwe\s+(have|provide|offer)\s+(loaner|rental)\s+gi/i,
];

// Tighter: must be about open mat / visiting specifically, not general "first class free" marketing
const FREE_VISITOR_PATTERNS = [
  /\bfree\s+for\s+(all\s+)?visitors?\b/i,
  /\bguests?\s+(train|roll)\s+free\b/i,
  /\bopen\s+mat[^.]*?free\s+to\s+all\b/i,
  /\bno\s+charge\s+for\s+(visitors?|guests?)\b/i,
  /\bvisitors?\s+are\s+free\b/i,
];

function scoreText(text) {
  let nogiScore = 0;
  let giScore = 0;

  for (const p of NOGI_STRONG) if (p.test(text)) nogiScore += 2;
  for (const p of NOGI_WEAK) if (p.test(text)) nogiScore += 1;
  for (const p of GI_STRONG) if (p.test(text)) giScore += 2;

  const dropIn = DROP_IN_PATTERNS.some(p => p.test(text));
  const loanerGi = LOANER_GI_PATTERNS.some(p => p.test(text));
  const freeVisitor = FREE_VISITOR_PATTERNS.some(p => p.test(text));

  return { nogiScore, giScore, dropIn, loanerGi, freeVisitor };
}

function classifyFromScore(nogiScore, giScore) {
  if (nogiScore === 0 && giScore === 0) return null;
  // Require a clear winner — if both are present and close, leave as unknown
  if (nogiScore > 0 && giScore > 0 && Math.abs(nogiScore - giScore) <= 1) return null;
  if (nogiScore > giScore) return 'nogi_bjj';
  return 'gi_bjj';
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MatFinderBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchGymText(websiteUrl) {
  const base = websiteUrl.replace(/\/$/, '');
  const texts = [];
  const home = await fetchText(base);
  if (home) texts.push(home);

  // Try schedule sub-pages (stop early if we already have strong signals)
  for (const path of SCHEDULE_PATHS) {
    if (texts.join(' ').length > 50000) break; // enough content
    const sub = await fetchText(base + path);
    if (sub) texts.push(sub);
  }

  return texts.join(' ');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const content = readFileSync('lib/data.ts', 'utf8');

  const arrayMatches = [...content.matchAll(/export const \w+ *: *Gym\[\] *= *(\[[\s\S]*?\n\]);/g)];
  const allGyms = arrayMatches.flatMap(m => {
    try { return JSON.parse(m[1]); } catch { return []; }
  });

  // Phase 1: affiliation-based (no fetching needed)
  let affiliationUpgraded = 0;
  const affiliationResults = new Map();
  for (const gym of allGyms) {
    if (!gym.open_mats.some(o => o.discipline === 'bjj')) continue;
    const disc = checkAffiliation(gym.name);
    if (disc) {
      affiliationResults.set(gym.id, { disc, dropIn: false, loanerGi: false, freeVisitor: false });
      affiliationUpgraded++;
    }
  }
  console.log(`\nPhase 1 — Affiliation detection: ${affiliationUpgraded} gyms upgraded`);

  // Phase 2: website scraping (only gyms not already upgraded by affiliation)
  const candidates = allGyms.filter(g =>
    g.website &&
    g.open_mats.some(o => o.discipline === 'bjj') &&
    !affiliationResults.has(g.id)
  );

  const toProcess = candidates.slice(0, LIMIT);
  console.log(`Phase 2 — Website scraping: ${toProcess.length} candidates (of ${candidates.length})`);
  console.log(`Concurrency: ${CONCURRENCY}, Timeout: ${TIMEOUT_MS}ms\n`);

  const websiteResults = new Map();
  let upgraded = 0;
  let noSignal = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (gym) => {
      const text = await fetchGymText(gym.website);
      if (!text) { failed++; return; }
      const { nogiScore, giScore, dropIn, loanerGi, freeVisitor } = scoreText(text);
      const disc = classifyFromScore(nogiScore, giScore);
      if (disc || dropIn || loanerGi || freeVisitor) {
        websiteResults.set(gym.id, { disc, dropIn, loanerGi, freeVisitor });
        if (disc) upgraded++;
      } else {
        noSignal++;
      }
    }));
    const done = Math.min(i + CONCURRENCY, toProcess.length);
    process.stdout.write(`\r  ${done}/${toProcess.length} — ${upgraded} upgraded, ${failed} failed`);
  }

  const allResults = new Map([...affiliationResults, ...websiteResults]);

  console.log(`\n\nTotal results:`);
  console.log(`  Affiliation upgraded: ${affiliationUpgraded}`);
  console.log(`  Website upgraded:     ${upgraded}`);
  console.log(`  No signal:            ${noSignal}`);
  console.log(`  Fetch failed:         ${failed}`);

  const nogiCount = [...allResults.values()].filter(r => r.disc === 'nogi_bjj').length;
  const giCount = [...allResults.values()].filter(r => r.disc === 'gi_bjj').length;
  const dropInCount = [...allResults.values()].filter(r => r.dropIn).length;
  const loanerCount = [...allResults.values()].filter(r => r.loanerGi).length;
  const freeCount = [...allResults.values()].filter(r => r.freeVisitor).length;
  console.log(`  → No-Gi: ${nogiCount}, Gi: ${giCount}`);
  console.log(`  → Drop-in: ${dropInCount}, Loaner Gi: ${loanerCount}, Free for visitors: ${freeCount}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Not writing data.ts');
    let shown = 0;
    for (const [id, r] of allResults) {
      if (shown++ >= 20) break;
      const gym = allGyms.find(g => g.id === id);
      console.log(`  ${gym?.name} (${gym?.city}) → ${r.disc ?? 'no disc change'} | drop:${r.dropIn} loaner:${r.loanerGi} free:${r.freeVisitor}`);
    }
    // Estimate confirmation rate
    const totalMats = allGyms.flatMap(g => g.open_mats).length;
    const alreadyConfirmed = allGyms.flatMap(g => g.open_mats).filter(o => o.confirmed).length;
    const willConfirm = [...allResults.values()].filter(r => r.disc).length;
    const projected = alreadyConfirmed + willConfirm;
    console.log(`\nProjected confirmation rate:`);
    console.log(`  Before: ${alreadyConfirmed}/${totalMats} (${(100*alreadyConfirmed/totalMats).toFixed(1)}%)`);
    console.log(`  After:  ${projected}/${totalMats} (${(100*projected/totalMats).toFixed(1)}%)`);
    return;
  }

  // Apply all results to data.ts
  let newContent = content;
  let patched = 0;

  for (const [id, result] of allResults) {
    const idStr = `"id": "${id}"`;
    const idPos = newContent.indexOf(idStr);
    if (idPos === -1) continue;

    const blockStart = idPos - 20;
    const blockEnd = newContent.indexOf('\n  }', idPos);
    if (blockEnd === -1) continue;
    const blockEnd2 = blockEnd + 4;

    const gymBlock = newContent.slice(blockStart, blockEnd2 + 2);
    let newBlock = gymBlock;

    if (result.disc) {
      newBlock = newBlock.replace(/"discipline": "bjj"/g, `"discipline": "${result.disc}"`);
      newBlock = newBlock.replace(/"confirmed": false/g, '"confirmed": true');
    }
    if (result.dropIn && !newBlock.includes('"drop_in_friendly"')) {
      newBlock = newBlock.replace(/"open_mats":/, '"drop_in_friendly": true,\n    "open_mats":');
    }
    if (result.loanerGi && !newBlock.includes('"loaner_gi"')) {
      newBlock = newBlock.replace(/"open_mats":/, '"loaner_gi": true,\n    "open_mats":');
    }
    if (result.freeVisitor && !newBlock.includes('"free_for_visitors"')) {
      newBlock = newBlock.replace(/"open_mats":/, '"free_for_visitors": true,\n    "open_mats":');
    }

    if (newBlock !== gymBlock) {
      newContent = newContent.slice(0, blockStart) + newBlock + newContent.slice(blockEnd2 + 2);
      patched++;
    }
  }

  writeFileSync('lib/data.ts', newContent);
  console.log(`\nWrote lib/data.ts — ${patched} gym blocks patched`);
}

main().catch(console.error);
