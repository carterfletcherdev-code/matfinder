/**
 * Stage 2: Find the schedule page on each gym's website.
 *
 * Reads scripts/pipeline/data/01-websites.json (Stage 1 output).
 * For each gym with website + acceptable match_confidence:
 *   1. Try /sitemap.xml (recurses sitemap index up to 2 levels deep)
 *   2. Fall back to fetching homepage + extracting internal <a href> links
 *   3. Score each URL by config.relevantPageKeywords (URL path + link text)
 *   4. Keep top N (config.maxPagesPerSite). Always include homepage as fallback.
 *
 * Output: scripts/pipeline/data/02-relevant-pages.json
 *   { [gym_id]: { pages: [url1, ...], source: 'sitemap'|'homepage_crawl', ... } }
 *
 * Failures: scripts/pipeline/data/02-failures.json
 *
 * Run:
 *   node scripts/pipeline/02-find-relevant-pages.mjs --test
 *   node scripts/pipeline/02-find-relevant-pages.mjs --limit=200
 *   node scripts/pipeline/02-find-relevant-pages.mjs                 # full
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
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency) : 8;
const ACCEPT_LOW = !!args['accept-low']; // include low-confidence Places matches

// ── Load Stage 1 output ──────────────────────────────────────────────────────
if (!existsSync(config.paths.websites)) {
  console.error(`Error: ${config.paths.websites} not found. Run Stage 1 first.`);
  process.exit(1);
}
const sites = JSON.parse(readFileSync(config.paths.websites, 'utf8'));

const acceptableConfidences = ACCEPT_LOW
  ? ['high', 'medium', 'low']
  : ['high', 'medium'];

let candidates = Object.entries(sites)
  .filter(([_, info]) => info.website && acceptableConfidences.includes(info.match_confidence))
  .map(([id, info]) => ({ id, website: info.website.replace(/\/$/, '') }));

if (args.ids) {
  const wanted = new Set(String(args.ids).split(',').map(s => s.trim()));
  candidates = candidates.filter(c => wanted.has(c.id));
  console.log(`[--ids filter] kept ${candidates.length}/${wanted.size} requested gyms`);
}

const subset = TEST ? candidates.slice(0, 10) : candidates.slice(OFFSET, OFFSET + LIMIT);

console.log('─── Stage 2: Find relevant schedule pages ───');
console.log(`Sites with website (Stage 1):  ${candidates.length}`);
console.log(`Confidence threshold:          ${acceptableConfidences.join(', ')}`);
console.log(`Will process:                  ${subset.length}`);
console.log(`Concurrency:                   ${CONCURRENCY}`);
if (TEST) console.log('[TEST mode — 10 sites only, verbose]');
console.log('');

// ── Fetch with timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, timeoutMs = config.scrapeTimeout) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': config.scrapeUserAgent },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    const body = await res.text();
    return { body, contentType: ct, finalUrl: res.url };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

// ── Sitemap discovery (recursive sitemap index handling) ─────────────────────
async function fetchSitemapUrls(siteUrl) {
  const origin = new URL(siteUrl).origin;
  const visited = new Set();
  const found = new Set();

  async function visit(url, depth = 0) {
    if (depth > 2 || visited.has(url)) return;
    visited.add(url);
    const r = await fetchWithTimeout(url);
    if (r.error || !r.body) return;

    // sitemap index: <sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>
    if (/<sitemapindex/i.test(r.body)) {
      const sitemaps = [...r.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
        .map(m => m[1].trim());
      for (const sm of sitemaps.slice(0, 15)) {
        try {
          const u = new URL(sm);
          if (u.origin === origin) await visit(u.href, depth + 1);
        } catch {}
      }
    } else {
      const urls = [...r.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
        .map(m => m[1].trim());
      for (const u of urls) {
        try {
          const parsed = new URL(u);
          if (parsed.origin === origin) found.add(parsed.href);
        } catch {}
      }
    }
  }

  // Common sitemap locations
  await visit(`${origin}/sitemap.xml`);
  if (found.size === 0) await visit(`${origin}/sitemap_index.xml`);
  if (found.size === 0) await visit(`${origin}/wp-sitemap.xml`);

  return [...found];
}

// ── Homepage crawl fallback ──────────────────────────────────────────────────
async function crawlHomepage(siteUrl) {
  const r = await fetchWithTimeout(siteUrl);
  if (r.error) return { urls: [], linkText: {}, error: r.error };
  if (!/text\/html/i.test(r.contentType || '') && !r.body.includes('<html')) {
    return { urls: [], linkText: {}, error: 'not_html' };
  }
  let $;
  try { $ = cheerio.load(r.body); }
  catch (e) { return { urls: [], linkText: {}, error: 'parse_failed' }; }

  const origin = new URL(siteUrl).origin;
  const urls = new Set([siteUrl]);
  const linkText = {};

  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    const text = $(a).text().trim();
    if (!href) return;
    try {
      const u = new URL(href, siteUrl);
      if (u.origin === origin) {
        // Strip fragments for dedup
        u.hash = '';
        urls.add(u.href);
        if (text && text.length < 120) {
          const existing = linkText[u.href];
          if (!existing) linkText[u.href] = text.toLowerCase();
        }
      }
    } catch {}
  });

  return { urls: [...urls], linkText };
}

// ── URL scoring ──────────────────────────────────────────────────────────────
function scoreUrl(url, keywords, linkText = '') {
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); }
  catch { return 0; }

  const haystack = `${path} ${linkText.toLowerCase()}`;
  let score = 0;
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i].toLowerCase();
    if (haystack.includes(kw)) {
      // Earlier keywords in config = higher weight
      score += keywords.length - i;
      // Bonus when keyword is its own URL path segment
      const segs = path.split('/').filter(Boolean);
      const kwHyphenated = kw.replace(/\s+/g, '-');
      if (segs.some(s => s === kw || s === kwHyphenated)) score += 3;
    }
  }
  // Penalize obvious non-content URLs
  if (/\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js|xml)$/i.test(path)) score = 0;
  if (/\/(wp-content|wp-admin|cdn|assets|static|images?)\//i.test(path)) score = 0;
  return score;
}

// ── Per-site logic ───────────────────────────────────────────────────────────
async function findPagesForSite(siteUrl) {
  // Sitemap first
  let urls = [];
  let linkText = {};
  let source = 'sitemap';
  let sitemapError = null;

  try { urls = await fetchSitemapUrls(siteUrl); }
  catch (e) { sitemapError = e.message; }

  if (urls.length === 0) {
    source = 'homepage_crawl';
    const r = await crawlHomepage(siteUrl);
    if (r.error) return { error: r.error };
    urls = r.urls;
    linkText = r.linkText || {};
  }

  if (urls.length === 0) return { error: 'no_urls_discovered' };

  // Score & rank
  const scored = urls
    .map(u => ({ url: u, score: scoreUrl(u, config.relevantPageKeywords, linkText[u] || '') }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  let top = scored.slice(0, config.maxPagesPerSite).map(s => s.url);
  let usedFallback = false;

  // Fallback: when nothing scored, instead of giving Stage 3 just the homepage,
  // grab up to 3 non-junk internal pages so the model has *some* content surface.
  if (top.length === 0) {
    const junk = new Set((config.junkPathSegments || []).map(s => s.toLowerCase()));
    const isJunk = (u) => {
      try {
        const path = new URL(u).pathname.toLowerCase();
        if (path === '/' || path === '') return true;
        if (/\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js|xml)$/i.test(path)) return true;
        const segs = path.split('/').filter(Boolean);
        return segs.some(s => junk.has(s));
      } catch { return true; }
    };
    const candidates = urls
      .filter(u => !isJunk(u) && u !== siteUrl && u !== `${siteUrl}/`)
      // shorter paths first — top-level pages more likely to be class/schedule
      .sort((a, b) => {
        try { return new URL(a).pathname.length - new URL(b).pathname.length; }
        catch { return 0; }
      });
    top = candidates.slice(0, 3);
    if (top.length > 0) usedFallback = true;
  }

  // Always include homepage so Stage 3 has a final fallback
  if (!top.some(u => u === siteUrl || u === `${siteUrl}/`)) {
    top.push(siteUrl);
  }

  return {
    pages: top,
    source,
    total_urls_found: urls.length,
    scored_count: scored.length,
    used_fallback: usedFallback,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const results = {};
  const failures = {};
  let processed = 0, withPages = 0, failed = 0;

  // Process in concurrent batches
  for (let i = 0; i < subset.length; i += CONCURRENCY) {
    const batch = subset.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ({ id, website }) => {
      try {
        const r = await findPagesForSite(website);
        if (r.error) {
          failures[id] = { website, error: r.error };
          failed++;
          if (TEST) console.log(`  [${id}] ${website} — FAILED: ${r.error}`);
        } else {
          results[id] = r;
          withPages++;
          if (TEST) {
            console.log(`  [${id}] ${website}`);
            console.log(`    source: ${r.source}, URLs found: ${r.total_urls_found}, scored>0: ${r.scored_count}`);
            for (const p of r.pages) console.log(`      → ${p}`);
            console.log('');
          }
        }
      } catch (e) {
        failures[id] = { website, error: e.message };
        failed++;
      }
      processed++;
    }));

    if (!TEST) {
      process.stdout.write(`\r  ${processed}/${subset.length} — pages found ${withPages}, failed ${failed}  `);
    }
  }
  if (!TEST) process.stdout.write('\n');

  // ── Save ────────────────────────────────────────────────────────────────────
  const outDir = 'scripts/pipeline/data';
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Merge with existing if present (so re-runs accumulate)
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

  const totalResults = merge(config.paths.relevantPages, results);
  const failuresPath = 'scripts/pipeline/data/02-failures.json';
  const totalFailures = merge(failuresPath, failures);

  console.log(`\nWrote ${totalResults} entries to ${config.paths.relevantPages}`);
  console.log(`Wrote ${totalFailures} entries to ${failuresPath}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\nSummary:');
  console.log(`  Processed:       ${processed}`);
  console.log(`  Pages found:     ${withPages}`);
  console.log(`  Failed:          ${failed}`);

  // Source breakdown for this run
  const bySource = { sitemap: 0, homepage_crawl: 0 };
  for (const r of Object.values(results)) bySource[r.source] = (bySource[r.source] || 0) + 1;
  console.log('\nDiscovery method:');
  for (const [k, v] of Object.entries(bySource)) console.log(`  ${k.padEnd(18)} ${v}`);

  // Failure breakdown
  const byErr = {};
  for (const f of Object.values(failures)) byErr[f.error] = (byErr[f.error] || 0) + 1;
  if (Object.keys(byErr).length > 0) {
    console.log('\nFailure reasons:');
    for (const [k, v] of Object.entries(byErr).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(18)} ${v}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
