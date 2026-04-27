/**
 * Stage 3: Scrape page content.
 *
 * Reads scripts/pipeline/data/02-relevant-pages.json (Stage 2 output).
 * For each gym, fetches each candidate URL, extracts the main text content
 * with cheerio (stripping nav/footer/scripts/styles), and writes a clean
 * markdown-ish .md file per page.
 *
 * Output:
 *   scripts/pipeline/data/03-scraped/{gym_id}/{page_index}.md
 *     ── frontmatter: source URL, fetched_at
 *     ── body: cleaned text (preserves headings, lists, links inline)
 *
 *   scripts/pipeline/data/03-scrape-index.json
 *     { [gym_id]: { pages: [ { url, file, bytes, fetched_at } ], errors: [...] } }
 *
 *   scripts/pipeline/data/03-failures.json
 *     { [gym_id]: { url, error } }
 *
 * Run:
 *   node scripts/pipeline/03-scrape-pages.mjs --test
 *   node scripts/pipeline/03-scrape-pages.mjs --limit=200
 *   node scripts/pipeline/03-scrape-pages.mjs                 # full
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { config } from './pipeline.config.mjs';
import * as cheerio from 'cheerio';

// ── Args ─────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const LIMIT = args.limit ? parseInt(args.limit) : Infinity;
const OFFSET = args.offset ? parseInt(args.offset) : 0;
const TEST = !!args.test;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency) : 6;

// ── Load Stage 2 output ──────────────────────────────────────────────────────
if (!existsSync(config.paths.relevantPages)) {
  console.error(`Error: ${config.paths.relevantPages} not found. Run Stage 2 first.`);
  process.exit(1);
}
const stage2 = JSON.parse(readFileSync(config.paths.relevantPages, 'utf8'));

let gymIds = Object.keys(stage2);
if (args.ids) {
  const wanted = new Set(String(args.ids).split(',').map(s => s.trim()));
  gymIds = gymIds.filter(id => wanted.has(id));
  console.log(`[--ids filter] kept ${gymIds.length}/${wanted.size} requested gyms`);
}
const subset = TEST ? gymIds.slice(0, 5) : gymIds.slice(OFFSET, OFFSET + LIMIT);

console.log('─── Stage 3: Scrape page content ───');
console.log(`Gyms with relevant pages: ${gymIds.length}`);
console.log(`Will process:             ${subset.length}`);
console.log(`Concurrency:              ${CONCURRENCY}`);
if (TEST) console.log('[TEST mode — 5 gyms only, verbose]');
console.log('');

// ── Fetch with timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, timeoutMs = config.scrapeTimeout) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': config.scrapeUserAgent, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ct)) return { error: `not_html (${ct.split(';')[0]})` };
    const body = await res.text();
    return { body, contentType: ct, finalUrl: res.url };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

// ── Clean HTML → readable text ───────────────────────────────────────────────
// Strips chrome (nav/footer/scripts/styles), preserves heading + list structure,
// inlines link text. Output is markdown-ish — easy for an LLM to read AND
// preserves substrings so the citation verifier can match them.
function htmlToText(html) {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, noscript, iframe, svg, link, meta').remove();
  $('nav, header, footer, aside').remove();
  $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  $('.menu, .navigation, .nav, .footer, .header, .sidebar, .cookie, .popup').remove();

  // Keep the most content-heavy section if a <main>/<article> exists
  const root = $('main').first().length ? $('main').first()
            : $('article').first().length ? $('article').first()
            : $('body');

  const lines = [];

  function pushLine(s) {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t) lines.push(t);
  }

  // Walk the chosen subtree, emit semantic blocks
  function walk(el) {
    el.contents().each((_, node) => {
      if (node.type === 'text') {
        const txt = (node.data || '').replace(/\s+/g, ' ').trim();
        if (txt) lines.push(txt);
        return;
      }
      if (node.type !== 'tag') return;
      const $n = $(node);
      const tag = node.name.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1]);
        pushLine(`\n${'#'.repeat(level)} ${$n.text()}\n`);
        return;
      }
      if (tag === 'br') { lines.push('\n'); return; }
      if (tag === 'p' || tag === 'div' || tag === 'section') {
        const before = lines.length;
        walk($n);
        if (lines.length > before) lines.push('\n');
        return;
      }
      if (tag === 'li') { pushLine(`- ${$n.text()}`); return; }
      if (tag === 'ul' || tag === 'ol') { walk($n); lines.push('\n'); return; }
      if (tag === 'tr') { pushLine($n.find('td,th').map((_, c) => $(c).text().trim()).get().join(' | ')); return; }
      if (tag === 'table') { walk($n); lines.push('\n'); return; }
      if (tag === 'a') {
        const txt = $n.text().trim();
        if (txt) lines.push(txt + ' ');
        return;
      }
      walk($n);
    });
  }
  walk(root);

  // Collapse whitespace, dedupe blank lines
  const text = lines.join(' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return text;
}

// ── Per-gym scrape ──────────────────────────────────────────────────────────
async function scrapeGym(gymId, urls) {
  const dir = `${config.paths.scrapedContent}/${gymId}`;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const pages = [];
  const errors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const r = await fetchWithTimeout(url);
    if (r.error) {
      errors.push({ url, error: r.error });
      continue;
    }
    let text = '';
    try { text = htmlToText(r.body); }
    catch (e) { errors.push({ url, error: `parse_failed: ${e.message}` }); continue; }

    if (text.length < 50) {
      errors.push({ url, error: 'too_short' });
      continue;
    }

    const file = `${dir}/${i}.md`;
    const fetched_at = new Date().toISOString();
    const md =
      `---\nsource_url: ${url}\nfinal_url: ${r.finalUrl || url}\nfetched_at: ${fetched_at}\n---\n\n${text}\n`;
    writeFileSync(file, md);
    pages.push({ url, file, bytes: md.length, fetched_at });
  }

  return { pages, errors };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(config.paths.scrapedContent)) {
    mkdirSync(config.paths.scrapedContent, { recursive: true });
  }

  const index = {};
  const failures = {};
  let processed = 0, withPages = 0, allFailed = 0;

  for (let i = 0; i < subset.length; i += CONCURRENCY) {
    const batch = subset.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (gymId) => {
      const entry = stage2[gymId];
      const urls = entry?.pages || [];
      if (urls.length === 0) {
        failures[gymId] = { error: 'no_pages_from_stage2' };
        allFailed++;
        processed++;
        return;
      }
      try {
        const r = await scrapeGym(gymId, urls);
        if (r.pages.length > 0) {
          index[gymId] = { pages: r.pages, errors: r.errors };
          withPages++;
          if (TEST) {
            console.log(`  [${gymId}] scraped ${r.pages.length}/${urls.length} pages`);
            for (const p of r.pages) console.log(`    ✓ ${p.url} → ${p.file} (${p.bytes}b)`);
            for (const e of r.errors) console.log(`    ✗ ${e.url} — ${e.error}`);
          }
        } else {
          failures[gymId] = { errors: r.errors };
          allFailed++;
          if (TEST) {
            console.log(`  [${gymId}] ALL FAILED`);
            for (const e of r.errors) console.log(`    ✗ ${e.url} — ${e.error}`);
          }
        }
      } catch (e) {
        failures[gymId] = { error: e.message };
        allFailed++;
      }
      processed++;
    }));

    if (!TEST) {
      process.stdout.write(`\r  ${processed}/${subset.length} — scraped ${withPages}, all-failed ${allFailed}  `);
    }
  }
  if (!TEST) process.stdout.write('\n');

  // ── Save index + failures (merged with prior runs) ──────────────────────────
  const merge = (path, fresh) => {
    let merged = {};
    if (existsSync(path)) {
      try { merged = JSON.parse(readFileSync(path, 'utf8')); }
      catch { /* ignore */ }
    }
    Object.assign(merged, fresh);
    writeFileSync(path, JSON.stringify(merged, null, 2));
    return Object.keys(merged).length;
  };

  const indexPath = 'scripts/pipeline/data/03-scrape-index.json';
  const failuresPath = 'scripts/pipeline/data/03-failures.json';
  const totalIndex = merge(indexPath, index);
  const totalFailures = merge(failuresPath, failures);

  console.log(`\nWrote ${totalIndex} entries to ${indexPath}`);
  console.log(`Wrote ${totalFailures} entries to ${failuresPath}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\nSummary:');
  console.log(`  Processed:      ${processed}`);
  console.log(`  Got pages:      ${withPages}`);
  console.log(`  All failed:     ${allFailed}`);

  // Failure reason breakdown
  const reasons = {};
  for (const f of Object.values(failures)) {
    if (f.error) reasons[f.error] = (reasons[f.error] || 0) + 1;
    if (f.errors) for (const e of f.errors) reasons[e.error] = (reasons[e.error] || 0) + 1;
  }
  if (Object.keys(reasons).length > 0) {
    console.log('\nFailure reasons:');
    for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(k).padEnd(28)} ${v}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
