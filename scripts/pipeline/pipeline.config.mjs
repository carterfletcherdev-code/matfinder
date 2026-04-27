/**
 * pipeline.config.mjs — the ONE file you edit when reusing this pipeline for a new niche.
 *
 * For a new project (e.g. climbing gyms, restaurants, yoga studios), change:
 *   - niche
 *   - placesQueryTemplate
 *   - relevantPageKeywords
 *   - extractionSchema
 *   - extractionInstructions
 *
 * Everything else in scripts/pipeline/ stays the same.
 */

export const config = {
  // Human-readable niche name — used in logs.
  niche: 'BJJ Open Mats',

  // ── Stage 1: Google Places query ───────────────────────────────────────────
  // Template for searching Places API. {name} and {city} are substituted.
  placesQueryTemplate: '{name} {city} BJJ jiu-jitsu',

  // ── Stage 2: Page discovery ─────────────────────────────────────────────────
  // URL/path keywords used to score which page on a gym's site is most likely
  // to contain the schedule. Higher position = higher weight.
  relevantPageKeywords: [
    'open-mat',
    'open mat',
    'schedule',
    'classes',
    'class-schedule',
    'class schedule',
    'times',
    'hours',
    'programs',
    'calendar',
    'jiu-jitsu',
    'jiu jitsu',
    'jiujitsu',
    'bjj',
    'grappling',
    'training',
    'lessons',
    'sessions',
    'kids',
    'youth',
    'teens',
    'adults',
    'adult',
    'beginners',
    'martial-arts',
    'martial arts',
    'fundamentals',
    'curriculum',
    'membership',
  ],

  // Path segments treated as obvious junk — used as a fallback denylist
  // when no URL on a site scores above 0 against relevantPageKeywords.
  junkPathSegments: [
    'about', 'about-us', 'contact', 'contact-us', 'privacy', 'terms',
    'tos', 'cookie', 'cookies', 'login', 'signin', 'signup', 'register',
    'cart', 'checkout', 'account', 'profile', 'shop', 'store', 'product',
    'products', 'search', 'tag', 'category', 'author', 'feed', 'rss',
    'sitemap', 'wp-json', 'wp-admin', 'wp-content', 'gallery', 'galleries',
    'blog', 'news', 'press', 'media', 'careers', 'jobs', 'faq', 'reviews',
    'testimonials', 'history', 'lineage', 'mission', 'team', 'staff',
    'instructors', 'coaches', 'bio', 'home',
  ],

  // Max pages to keep per gym after scoring.
  maxPagesPerSite: 4,

  // ── Stage 3: Scraping ───────────────────────────────────────────────────────
  scrapeTimeout: 15000,           // ms per page
  scrapeUserAgent: 'MatFinderBot/1.0 (+https://matfinder-two.vercel.app)',

  // ── Stage 4: Extraction (Claude Haiku) ──────────────────────────────────────
  extractionModel: 'claude-haiku-4-5-20251001',

  // The JSON schema we ask the model to return. Each item MUST include source_quote.
  extractionSchemaDescription: `
    Return a JSON object: { "schedule": [...] }
    Each schedule entry has:
      - day: one of "monday","tuesday","wednesday","thursday","friday","saturday","sunday"
      - start_time: 24h "HH:MM" (e.g. "18:30")
      - end_time: 24h "HH:MM" (or null if not stated)
      - class_name: short label as it appears on the site (e.g. "Adult BJJ", "Kids Muay Thai", "Open Mat")
      - discipline: one of "bjj","nogi_bjj","gi_bjj","wrestling","judo","muay_thai","mma","kickboxing","boxing","karate","taekwondo"
      - is_open_mat: boolean — true ONLY if the source explicitly labels this session as "open mat", "open training", "open roll", "open gym", or equivalent
      - is_kids: boolean — true if the class is for children/youth
      - level: optional string — "beginner", "advanced", "all-levels", etc., only if stated
      - source_quote: VERBATIM text snippet from the page that proves this entry. MUST appear word-for-word in the source.
  `.trim(),

  // The most important rule. Fed verbatim into the system prompt.
  extractionInstructions: `
    You extract martial-arts gym class schedules from website content.

    CRITICAL RULES:
    1. Every entry MUST include source_quote — a VERBATIM 10–200 character substring of the provided page content that explicitly states this schedule entry's day AND time. Copy it exactly: same words, same order, same punctuation, same capitalization. Do NOT paraphrase, normalize, expand abbreviations ("Mon" stays "Mon"), or merge separate lines into one quote.
    2. If you cannot find such a substring stating a day + time, OMIT that entry. DO NOT INFER. DO NOT GUESS. DO NOT FILL IN TYPICAL SCHEDULES. If no schedule exists in the source, return an empty schedule array.
    3. Extract ALL classes shown in the schedule, not only open mats. Set is_open_mat=true only when the source explicitly uses the words "open mat", "open training", "open roll", or "open gym".
    4. Times must be from the source. Do not standardize, round, or interpret. If the source says "6pm", the source_quote must contain "6pm" (your start_time field may normalize to "18:00", but the quote stays as written).
    5. Source_quote must be a SINGLE contiguous run of text from the page. Do not concatenate snippets from different parts. If the relevant text is split across non-adjacent lines, omit instead of stitching.
    6. If a class spans multiple days (e.g. "Mon/Wed/Fri 6pm BJJ"), output one entry per day, each with the SAME source_quote.
    7. Before outputting each entry, re-read your source_quote and confirm it appears character-for-character in the page content above. If unsure, omit. A rejected entry is far better than a hallucinated one.

    DISCIPLINE CLASSIFICATION (ambiguity rules):
    - BJJ family: only use "gi_bjj" if the source explicitly says "Gi" (e.g. "Gi class", "Adult Gi"); only use "nogi_bjj" if the source explicitly says "No-Gi" / "Nogi" / "No Gi"; otherwise use the generic "bjj".
    - Striking family: many gyms list "kickboxing" or "muay thai" interchangeably and the class is the same. If a class label says ONLY "kickboxing" without any mention of muay thai/clinch/elbows/knees, classify as "kickboxing". If it explicitly says "muay thai", classify as "muay_thai". If a gym's name is a kickboxing gym (e.g. "Austin Kickboxing Academy") and a class is unlabeled striking, prefer "kickboxing". Do NOT default unlabeled striking classes to "muay_thai".
    - Boxing family: only classify as "boxing" if the source explicitly says "boxing" (not just "kickboxing" or "striking"). Western boxing classes typically say "boxing fundamentals", "sweet science", "fight class", etc.
    - When in doubt between two close disciplines and the source does not disambiguate, prefer the LESS specific option (e.g. "kickboxing" over "muay_thai", "bjj" over "gi_bjj"). Never invent specificity.
  `.trim(),

  // ── Output paths (relative to project root) ─────────────────────────────────
  paths: {
    websites:        'scripts/pipeline/data/01-websites.json',
    relevantPages:   'scripts/pipeline/data/02-relevant-pages.json',
    scrapedContent:  'scripts/pipeline/data/03-scraped',
    extractedRaw:    'scripts/pipeline/data/04-extracted-raw.json',
    extractedVerified: 'scripts/pipeline/data/04-extracted-verified.json',
    extractionFailures: 'scripts/pipeline/data/04-extraction-failures.json',
    edgeCases:       'scripts/pipeline/data/edge-cases.json',
    dataFile:        'lib/data.ts',
  },
};
