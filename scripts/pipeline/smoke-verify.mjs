/**
 * Dry-run: re-apply the new (tiered) verifier to all currently-rejected
 * entries, using each gym's full scraped corpus. Predicts recovery without
 * any API calls. Run:  node scripts/pipeline/smoke-verify.mjs
 */
import { readFileSync, existsSync } from 'fs';

const rejected = JSON.parse(readFileSync('scripts/pipeline/data/04-rejected-entries.json', 'utf8'));
const scrapeIndex = JSON.parse(readFileSync('scripts/pipeline/data/03-scrape-index.json', 'utf8'));

function normalize(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function aggressive(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function tokens(s) { return new Set(aggressive(s).split(' ').filter(t => t.length >= 2)); }

function buildVerifyCorpus(gymId) {
  const entry = scrapeIndex[gymId];
  if (!entry?.pages?.length) return '';
  const out = [];
  for (const p of entry.pages) {
    if (!existsSync(p.file)) continue;
    let body = readFileSync(p.file, 'utf8');
    body = body.replace(/^---\n[\s\S]*?\n---\n\n?/, '');
    out.push(body);
  }
  return out.join('\n\n');
}

function tier(quote, corpus) {
  if (!quote || quote.length < 10 || quote.length > 300) return null;
  if (normalize(corpus).includes(normalize(quote))) return 'exact';
  const a = aggressive(quote);
  if (a.length >= 8 && aggressive(corpus).includes(a)) return 'punct';
  const n = tokens(quote);
  if (n.size < 4) return null;
  const h = tokens(corpus);
  let hits = 0;
  for (const t of n) if (h.has(t)) hits++;
  if (hits / n.size >= 0.85) return 'fuzzy';
  return null;
}

let totalRejected = 0, recovered = 0, byTier = { exact: 0, punct: 0, fuzzy: 0 };
let stillRejected = 0, gymsWithRecovery = 0;

for (const [gymId, entries] of Object.entries(rejected)) {
  const corpus = buildVerifyCorpus(gymId);
  if (!corpus) { totalRejected += entries.length; stillRejected += entries.length; continue; }
  let any = false;
  for (const r of entries) {
    totalRejected++;
    const t = tier(r.entry?.source_quote, corpus);
    if (t) { recovered++; byTier[t]++; any = true; }
    else stillRejected++;
  }
  if (any) gymsWithRecovery++;
}

console.log('Smoke test — new verifier vs. existing rejections (no API calls)\n');
console.log(`Total rejected entries:  ${totalRejected}`);
console.log(`Recovered by new tiers:  ${recovered}  (${(recovered / totalRejected * 100).toFixed(1)}%)`);
console.log(`  via exact match:       ${byTier.exact}  ← was rejected because filtered corpus dropped them`);
console.log(`  via punctuation strip: ${byTier.punct}`);
console.log(`  via 85% token overlap: ${byTier.fuzzy}`);
console.log(`Still rejected:          ${stillRejected}`);
console.log(`Gyms with new recovery:  ${gymsWithRecovery} / ${Object.keys(rejected).length}`);
