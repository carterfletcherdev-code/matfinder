/**
 * Edge-cases report.
 *
 * Aggregates failures from each stage into data/edge-cases.json.
 *
 * Categories:
 *   - no_website          — Stage 1 didn't find one
 *   - no_schedule_page    — Stage 2 found no relevant pages
 *   - scrape_failed       — Stage 3 errored (timeout, 403, JS-only)
 *   - extraction_rejected — Stage 4 returned data but citation didn't verify
 *   - extracted_empty     — Stage 4 ran cleanly but found no schedule
 *
 * This is the manual-review / paid-tools list (~5-10% of dataset).
 *
 * Run:
 *   node scripts/pipeline/report-failures.mjs
 *
 * To be implemented in Phase 6.
 */

console.log('Edge cases report — not yet implemented (Phase 6).');
