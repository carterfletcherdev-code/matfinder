import { readFileSync, existsSync } from 'fs';
const rejected = JSON.parse(readFileSync('scripts/pipeline/data/04-rejected-entries.json', 'utf8'));
const scrapeIndex = JSON.parse(readFileSync('scripts/pipeline/data/03-scrape-index.json', 'utf8'));

function normalize(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function aggressive(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function tokens(s) { return new Set(aggressive(s).split(' ').filter(t => t.length >= 2)); }
function buildCorpus(gymId) {
  const e = scrapeIndex[gymId]; if (!e?.pages) return '';
  return e.pages.filter(p => existsSync(p.file))
    .map(p => readFileSync(p.file, 'utf8').replace(/^---\n[\s\S]*?\n---\n\n?/, ''))
    .join('\n\n');
}

const samples = [];
for (const [gymId, entries] of Object.entries(rejected)) {
  const corpus = buildCorpus(gymId);
  if (!corpus) continue;
  for (const r of entries) {
    const q = r.entry?.source_quote || '';
    if (q.length < 10) continue;
    if (normalize(corpus).includes(normalize(q))) continue;          // exact
    if (aggressive(corpus).includes(aggressive(q))) continue;        // punct
    const n = tokens(q); if (n.size < 4) continue;
    const h = tokens(corpus); let hits = 0;
    for (const t of n) if (h.has(t)) hits++;
    const ratio = hits / n.size;
    if (ratio >= 0.85) samples.push({ gymId, ratio, quote: q, day: r.entry.day, time: r.entry.start_time, corpus });
  }
}

samples.sort(() => Math.random() - 0.5);
const pick = samples.slice(0, 12);
for (const s of pick) {
  console.log(`\n[${s.gymId}] ratio=${s.ratio.toFixed(2)}  ${s.day} ${s.time}`);
  console.log(`  CLAIMED QUOTE: "${s.quote}"`);
  // Find the densest matching window in the corpus
  const tks = [...tokens(s.quote)];
  const lines = s.corpus.split('\n');
  let bestLine = '', bestHits = 0;
  for (const ln of lines) {
    if (ln.length < 5 || ln.length > 300) continue;
    const lc = aggressive(ln);
    let hits = 0;
    for (const t of tks) if (lc.includes(' ' + t + ' ') || lc.startsWith(t + ' ') || lc.endsWith(' ' + t) || lc === t) hits++;
    if (hits > bestHits) { bestHits = hits; bestLine = ln; }
  }
  console.log(`  CLOSEST LINE:  "${bestLine.slice(0, 200).trim()}"`);
}
console.log(`\nTotal fuzzy samples available: ${samples.length}`);
