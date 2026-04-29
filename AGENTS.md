<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# matfinder — master charter

> **Single source of truth.** Read this file at the start of every session. If a user prompt contradicts this doc, ask before proceeding. When the truth changes, update this doc in the same commit.

---

## 0. The person

**Carter** — solo founder, self-taught, fast. Built v1 (a working BJJ open-mat finder at matfinder.io) in 4 days. Mac + zsh. Avoids VS Code. GitHub `carterfletcherdev-code`, Vercel `carterfletcherdev-3653`. Email `jayminalc@gmail.com`. Wants pauses + walkthroughs when crossing into unfamiliar tooling (Apple Developer console, App Store Connect, Stripe Connect setup). Knows TS, React, Next.js, Tailwind, Supabase well enough to reason about edits.

Treat this app as Carter's livelihood. He works at high pace and won't quit until it ships.

---

## 1. What matfinder is

**One-liner:** Find the mat. Track the journey.

Started as a BJJ open-mat finder. Becoming the operating system for martial artists across **9 disciplines**: BJJ, MMA, Muay Thai, kickboxing, boxing, judo, taekwondo, karate, wrestling.

**Three channels, one app:**
| Channel | Audience | Job-to-be-done | Revenue |
|---|---|---|---|
| **Map / Discover** | Travelers + gym owners | Find gyms, schedules, open mats. Each gym gets a full-screen `/gym/[slug]` page. | Gym subscriptions ($30 / $99/mo) |
| **Passport** | Individual practitioners | Strava-for-martial-arts. Log every session. Track belt, stripes, mat hours, streaks across all 9 arts. | Athlete Pro ($6.99/mo, $59.99/yr) |
| **Community** | Network | Public feed of who's training where. Follow friends. RSVP to open mats. Live "training now" indicators. | Free — drives retention for both other channels |

The wedge: existing BJJ tracking apps (MatTime, BJJ Notes, BJJBuddy) are solo journals with no gym/community layer. Strava has refused martial arts for years. Other arts have nothing. **We are the only product combining a multi-art directory with a passport tracker and community.**

---

## 2. Build philosophy

- **Tools, not zoos.** Fewest features, maximum utility. Every feature must earn its place.
- **Evolve in place. Never rewrite.** v1 already has 6,768 gyms, paying users, working auth/Stripe/maps. Build features as new routes/components inside the existing repo. No "v2 parallel rebuild" — that pattern kills solo founders.
- **One concern per file.** Avoid premature abstraction. Duplicate twice before extracting.
- **Outsource to proven APIs.** Stripe, Mapbox, Supabase, Resend, OneSignal/Expo Push. Don't rebuild these.
- **Ship weekly to soft-launch on r/bjj.** Real user feedback beats perfect specs.
- **Native feel before marketing push.** App-grade UI polish lands before iOS submission so review doesn't reject for "minimum functionality."

---

## 3. The current state (as of 2026-04-29)

### Stack
- **Next.js 15** App Router, TypeScript strict
- **Supabase** (Postgres + RLS) — project id `qwzitshebstmcmnqihvq`, name `matfinder`, region `us-east-1`
- **Auth:** Supabase email magic-link
- **Maps:** Mapbox GL JS
- **Payments:** Stripe live mode — Pro `price_1TRHFWEP7NK8410C6WY70nKP` ($6.99/mo), Annual `price_1TRHJ6EP7NK8410CcPu70CRd` ($59.99/yr)
- **Hosting:** Vercel, deployed at matfinder.io
- **Analytics:** in-house events table

### Repo layout
```
app/                 — App Router pages + /api routes
  page.tsx           — main map page (large; refactor candidate)
  admin/corrections/ — admin moderation queue + stats
  owner/[gymId]/     — gym owner editor
  account/, claim/, favorites/, privacy/, terms/
components/          — UI components
  GymCard.tsx, Map.tsx, Header.tsx, Filters.tsx,
  AuthProvider.tsx, FavoritesProvider.tsx,
  CheckInButton.tsx, HeartButton.tsx, StarRating.tsx,
  SignInModal.tsx, ProfileDropdown.tsx, VerifiedBadge.tsx,
  DisciplineOnboarding.tsx, BackButton.tsx
lib/                 — types, utils, hooks (track, useOwnedGyms, etc.)
scripts/pipeline/    — data enrichment scripts (Phase 1, 1B, 2, photos)
supabase/migrations/ — SQL migrations
```

### Data already in production
- **6,768 gyms** discovered across 34 cities (US + intl tourist hubs)
- **924 gyms with citation-grounded verified schedules** (17,542 verified classes)
- **~774 → ~6,000 gyms with photos + ratings** (Google Places enrichment runs as needed via `scripts/pipeline/enrich-photos.mjs --resume`)
- All gym data lives in `gyms` (seed) + `gym_overrides` (enrichment + owner edits) tables; the API layer merges both with 30s edge cache.

### Tables that exist
`gyms`, `gym_overrides`, `events`, `corrections`, `gym_owners`, `admins`, `subscriptions`, `ratings`, `favorites`, `check_in_sessions`, plus `auth.users`.

### What's NOT built yet
- `sessions` + `ranks` tables (the Passport core)
- `/u/[handle]` user profile page
- Public feed / community page
- RSVP system (currently stubbed — alert "coming soon")
- Gym owner analytics dashboard ($99/mo Sponsor tier)
- iOS app (Capacitor wrap planned)
- Three-tab nav (Map / Passport / Community)

### What just shipped (Week 1)
- ✅ Master charter (`AGENTS.md`)
- ✅ Design-system foundation (`components/ui/`: Button, Card, Pill, StatusBadge)
- ✅ Status helper (`lib/gymStatus.ts`)
- ✅ Photo + rating columns on `gym_overrides` + Phase 1/1B/2 enrichment (~6,000 gyms)
- ✅ `/api/gyms` merges photo_url, rating, review_count
- ✅ Gym type extended with photo + rating fields
- ✅ Button primitive migration across 9 high-impact files (paywall, auth,
  onboarding, form submits)
- ✅ GymCard rebuilt — Card A vertical (list) + landscape (mapOverlay popover)
  with photo-header layout, status badges, RSVP-bearing open-mat panel
- ✅ `/gym/[gymId]` full detail page — hero photo, header, day-strip schedule
  with grouped open mats, sidebar (Contact / At a glance / Trained here)
- ✅ Card → gym page navigation (`View full page →` link on both list and
  popover variants)
- ✅ `<PhotoLightbox>` modal — opens via "Browse photos", supports 1+ photos
  with arrow nav, thumb strip, Esc-to-close, body scroll lock
- ✅ `<CorrectionForm>` modal — replaces legacy inline form. Used by both
  GymCard "Wrong info?" link and gym page "Report wrong info". Posts to
  `/api/corrections` with optional Instagram side-channel record.

---

## 4. The design system

> Carter has already built this in `app/globals.css`. Don't replace tokens — use them. Extend only when there's a real gap.

### Tokens

**Brand colors — bone & brown.** Warm, gym-aesthetic, distinctive.
```
--bone:        #F5F1E8     base surface
--brown-50 → 900            8-step ladder, warm brown
```

**Semantic status colors — use these for green/yellow/red signals:**
| Token | Hex | Semantic meaning |
|---|---|---|
| `--success`     | #5E8B5E | **OPEN** — open mat happening, available, active |
| `--processing`  | #D97706 | **IN SESSION** — class in progress, starting soon |
| `--warning`     | #C8A145 | **CAUTION / FEATURED** — paid-tier badges, warnings |
| `--danger`      | #C4352E | **CLOSED** — closed, cancelled, full, unavailable |

> **Rule:** `--warning` is dual-use (gold/amber). To avoid confusion, **`--success` / `--processing` / `--danger` are reserved for status semantics. `--warning` gold is reserved for monetization signals (featured / Pro badges).** When you need a generic "warning amber" for status use `--processing` (orange).

**Surfaces / text / borders — already aliased; always use the alias not the brown shade:**
```
--surface-base     →  bone (page bg)
--surface-raised   →  cards, panels
--surface-sunken   →  inputs, secondary surfaces
--text-primary     →  body
--text-secondary   →  meta
--text-muted       →  hints
--border           →  default border
--accent           →  primary brand interactive
--accent-hover     →  hover state
```

**Light + dark mode** — every token has `[data-theme="dark"]` variant. New components must work in both. Test by toggling.

**Shadows (4 stops):** `--shadow-sm/md/lg/xl` already defined.
**Radii (5 stops):** `--radius-sm/md/lg/xl/full` already defined.

### Typography
- **UI:** Inter Tight (400/500/600/800)
- **Stats / mono:** JetBrains Mono (400/500)
- **Editorial accents:** Instrument Serif italic, Archivo Black (use sparingly)
- **Sentence case everywhere.** No `MAT FINDER`, no `Find A Gym`. Just `matfinder`, `Find a gym`, `Open mats today`.

### Motion
- Easing: `cubic-bezier(0.32, 0.72, 0, 1)` (the iOS curve, already used on bottom-sheet)
- Durations: tap 100ms, hover 150ms, base 220ms, slow 320ms, big enter 420ms
- Always honor `prefers-reduced-motion`.
- Hover lift = `translateY(-1px)` + shadow shift `--shadow-sm` → `--shadow-md`. Tap = `scale(0.98)` for 100ms.

### Card vs page action grammar (locked)

The list/popover card and the gym-detail page are different surfaces and serve different jobs. The actions on each follow strict rules:

| Action | List card (vertical) | Popover card (`mapOverlay`, landscape) | Gym page (`/gym/[slug]`) |
|---|---|---|---|
| **RSVP** (in open-mat panel) | ✓ shown | ✓ shown | ✓ shown, full-size |
| **Directions / Call / Instagram** | ✓ uniform 3-btn grid | ✓ uniform 3-btn grid | ✓ in Contact sidebar card |
| **Check in here** | ❌ NOT on cards | ❌ NOT on cards | ✓ primary CTA in header |
| **Save (heart)** | ✓ photo overlay | ✓ photo overlay | ✓ in header |
| **Wrong info?** | ✓ ghost link bottom | ✓ omitted (space) | ✓ ghost link bottom of sidebar |

**Why no Check-in on cards:** list cards exist for *discovery* (browsing, comparing, planning trips). Check-in is a *destination* action — only meaningful when the user is at the gym, in which case they'd open the detail page. Putting Check-in on every card adds noise and dilutes the discovery flow.

### Card variant rules

- **Vertical card** (default) — list views, mobile feed. Photo on top (16:9), info below.
- **Landscape card** (`mapOverlay={true}`) — desktop map pin popover. Photo on left (220px square), info on right. Max width 640px. Fits next to the pin without scrolling.
- **Mobile sheet** (m1) — what the card expands into on mobile when tapped. Full-bleed photo with overlay text, big thumb-friendly action grid. (Not yet built — Week 2.)

### Channel accents (per-section identity)
Same buttons / nav / shadows everywhere. The accent shifts to mark which channel you're in.
- **Map:** uses brand `--accent` (brown-600) — this is the default
- **Passport:** uses `--warning` gold (#C8A145) for hero stripe + active tab indicator
- **Community:** uses `--success` green (#5E8B5E) for hero stripe + active tab indicator

User can screenshot any page and tell which channel they're in within 100ms — but it still feels like one app.

### Naming rules
- Components: `PascalCase.tsx`, one default export.
- Hooks: `useThing.ts` in `lib/`.
- API routes: `app/api/[area]/route.ts`.
- Reusable primitives go in `components/ui/` (this folder doesn't exist yet — create when needed).

---

## 5. Voice

Direct. Plainspoken. Practical. We talk to training partners, not to "warriors crushing it." No hype-bro fitness language. Functional, never flowery.

**Buttons:** `Check in`, `Find a gym`, `Open mats today`. Verbs first. Sentence case.
**Empty states:** `No open mats today.` `Log your first session to start your streak.` Direct, never cute.
**Errors:** `Couldn't load gyms. Try again?` Short. Recoverable.

---

## 6. The roadmap (target ~6 weeks at Carter's pace; flexible)

| Week | Focus | Ships |
|---|---|---|
| **1** | Design-system foundation + Map polish | `components/ui/` primitives (Card, Button, Pill, StatusBadge, Tab, Modal, Drawer). Refactor GymCard to use them. Add photo + rating to every gym surface. Build full-screen `/gym/[slug]` page with hero photo, status badges, schedule, action row. |
| **2** | Passport core | `sessions` + `ranks` tables + RLS. Manual check-in flow (gym, art, duration, notes). `/u/[handle]` profile with belt + stripes + mat hours + streak + recent gyms map. |
| **3** | Community core | `/community` feed (recent public sessions). Follow/unfollow. "Friends training nearby." RSVP to open mats with green-pulse counter. |
| **4** | Gym dashboard + Sponsor tier | `/gym/[slug]/dashboard` (RLS-gated). Click analytics, IG taps, calls, page views. New Stripe SKU $99/mo Sponsor. Lead capture form. |
| **5** | iOS via Capacitor | Wrap existing app in native shell. OneSignal push, native geolocation, haptics, App Store screenshots. Submit to TestFlight + Play Console. |
| **6** | Soft launch | r/bjj launch post. 5–10 IG influencer DMs. Press list. iOS goes live mid-week. Push to existing v1 users via in-app notification. Iterate on early feedback. |

Carter sets the pace. If a week's work finishes early, advance. If it slips, the deadline slides — there's no fixed cutover date.

### Anti-goals (resist scope creep)
- ❌ Event ticketing / tournament hosting → post-launch
- ❌ Instructor marketplace → post-launch
- ❌ Gear affiliate engine → post-launch
- ❌ Gym SaaS white-label "site in a box" → post-launch
- ❌ Technique video library → never (BJJ Fanatics' job)
- ❌ AI training recommendations marketed as AI features → never as marketing; **roll-tagging via AI is on the roadmap for v2.5+** (positioned as "your training, automatically tracked")
- ❌ Android at launch → after iOS validates
- ❌ International marketing at launch → US-first (data is already global; marketing is US-only initially)

---

## 7. Working with Claude (session protocol)

### At session start
1. Re-read this file (`AGENTS.md`).
2. Run `git status` + `git log -5 --oneline` + check current branch.
3. Ask Carter what week + task we're on if it's not obvious.
4. Propose a small plan (3–7 bullets) before writing code. Confirm before migrations or deploys.

### Walk-through triggers
When the task involves any of these, slow down and explain step-by-step:
- `.env.local` edits
- Apple Developer Console / App Store Connect / TestFlight
- Stripe Connect / Customer Portal
- New Supabase migrations or RLS policy changes
- Git operations beyond add/commit/push (rebase, force-push, branch surgery)
- Any DNS / Vercel domain operation

### Code style
- TypeScript strict mode.
- Server Components by default; `'use client'` only when needed.
- Prefer typed Supabase client; raw SQL only in migrations.
- Use existing tokens (`var(--accent)`, `var(--shadow-md)`, etc.) — never hardcode hex.
- Sentence case for all UI strings.
- One concern per file.
- Inline comments on non-obvious logic; prefer prose over comment-heavy code.

### Commits
- Conventional: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `style:`.
- Small, focused, one logical change.
- Always commit before swapping branches or trying something risky.

### Things we've learned the hard way
- Postgres enums > CHECK constraints (TS type drift kills you).
- Partial unique indexes for nullable Stripe fields (`stripe_subscription_id`, etc.).
- `.env.local` with duplicate keys: pipeline scripts must use last-value-wins parser, not `--env-file` which takes the first.
- `printf "%s" "value" | vercel env add` — never `echo`, which appends a newline.
- IP capture for legal flows: server-side `next/headers`, never trust client.
- `SECURITY DEFINER` RPCs need explicit linkage check inside, not just an arg.
- No test runner ≠ no tests: pure functions get Vitest.
- Google Places Details API has a strict QPM limit — use concurrency 2 + 429 backoff for `enrich-photos.mjs`.

---

## 8. Pricing & monetization

| SKU | Price | What it unlocks |
|---|---|---|
| Athlete Free | $0 | Map, search, schedules, favorites |
| **Athlete Pro** | **$6.99/mo or $59.99/yr** | Unlimited favorites, training log/passport, streak tracker, schedule alerts, priority support |
| Gym Verified | $0 | Claim listing, edit info |
| **Gym Featured** | **$30/mo** | Featured pin, photos, "verified by owner" badge, lead notifications |
| **Gym Sponsor** | **$99/mo** *(launch w/ week 4)* | Top placement in city, analytics dashboard, lead capture form, monthly traffic report |

Marketplace fees (drop-in booking, seminars) are **post-launch** — they require Stripe Connect setup and gym onboarding flow.

---

## 9. Open items / decisions to revisit

- [ ] Trademark check on "matfinder" (App Store name conflict scan)
- [ ] Privacy Policy update for location + iOS background geofence (when Capacitor lands)
- [ ] Terms update for Athlete Pro & Sponsor tier
- [ ] Account deletion flow (App Store requirement)
- [ ] Apple Developer Program enrollment ($99/yr)
- [ ] Google Play Console enrollment ($25 one-time)
- [ ] Press list (target 20 BJJ/MMA media + creators)
- [ ] Trim `app/page.tsx` (~2,250 lines) into smaller route files when convenient
- [ ] Move 1,600-line `GymCard.tsx` to compose primitive UI components

---

## 10. Update protocol

This doc is living. Update it in the same commit when:
- A new feature ships (move from "not built" to "built")
- A new design token is added
- A new table or RLS policy is added
- A new SKU or price is added
- An anti-goal flips into a goal (or vice versa)

When in doubt, ask Carter what changed and write it down.
