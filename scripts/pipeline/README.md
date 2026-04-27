# Directory Pipeline — Citation-Grounded Extraction

A reusable 4-stage pipeline for building accurate business directory websites. Originally built for [MatFinder](https://matfinder-two.vercel.app) (BJJ open mats); designed to be ported to any niche (climbing gyms, restaurants, yoga studios, etc.).

## Why this exists

Naive LLM scraping hallucinates. Models will invent business hours, schedules, and details that look plausible but are completely fabricated. This pipeline solves that by requiring every extracted field to carry a verbatim source quote, then programmatically verifying the quote exists in the source HTML. **Citation-or-null.**

Realistic accuracy: 80–85% from automation alone, 92–95% with a community correction loop.

## The 4 stages

```
1. Find websites           Google Places API (free 10k/mo)
        ↓
2. Find relevant pages     sitemap.xml → fall back to crawl + URL keyword scoring
        ↓
3. Scrape page content     fetch + cheerio → markdown
        ↓
4. Extract with citations  Claude Haiku + verbatim-quote verification
        ↓
5. Apply to data file      Merge verified results, mark provenance
```

Plus an `edge-cases.json` report listing what fell out of each stage.

## How to reuse for a new niche

Edit `pipeline.config.mjs`. Change:

- `niche` — human label
- `placesQueryTemplate` — e.g. `"{name} {city} climbing gym"`
- `relevantPageKeywords` — what URL/path words signal the right page
- `extractionSchemaDescription` — the JSON shape you want extracted
- `extractionInstructions` — domain-specific extraction rules

Everything else stays the same. The verifier, the citation discipline, the failure tracking, the merge logic — all niche-agnostic.

## Running

```bash
# One-time setup
export GOOGLE_PLACES_API_KEY="..."
export ANTHROPIC_API_KEY="sk-ant-..."

# Run stages in order
node scripts/pipeline/01-find-websites.mjs
node scripts/pipeline/02-find-relevant-pages.mjs
node scripts/pipeline/03-scrape-pages.mjs
node scripts/pipeline/04-extract-with-citations.mjs
node scripts/pipeline/05-apply-results.mjs
node scripts/pipeline/report-failures.mjs
```

Each stage is independent — you can re-run any single stage without redoing prior work. Outputs are written to `scripts/pipeline/data/`.

## Cost estimate (8,000 businesses)

| Service | Free tier | Paid |
|---|---|---|
| Google Places API | 10k Essentials calls/mo (covers it) | $0 |
| Web fetching | self-hosted | $0 |
| Claude Haiku extraction | — | ~$30 one-time |
| **Total** | | **~$30** |

For larger datasets (>10k), Places goes to $5/1000 Essentials calls.

## Stage details

See header docstrings in each `0X-*.mjs` file. Each is implemented independently to keep them small and replaceable.

## Anti-hallucination contract

Stage 4 enforces:
1. Every entry MUST include `source_quote`
2. The quote MUST appear verbatim (substring match) in the scraped markdown
3. If no quote → entry is rejected
4. If LLM can't find verifiable schedule → returns empty array (no inference)

This is the discipline confirmed by recent extraction research (arxiv 2512.12117) and matches what Yext/Foursquare do internally with cross-source corroboration.

## Community loop (separate from this pipeline)

The pipeline alone gets you to ~85%. The remaining 10–15% comes from:
- "Report wrong time" button on each entry
- "Submit your business" form requiring source URL
- Admin review of submissions

These live in the main app, not this pipeline. See `app/admin/corrections/`.
