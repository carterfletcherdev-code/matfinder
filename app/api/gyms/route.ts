import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS } from '@/lib/data';
import overridesJson from '@/lib/schedule-overrides.json';
import type { Gym, OpenMat, ScheduleEntry, DayOfWeek, Discipline } from '@/lib/types';

// Was previously `force-static` — that baked the JSON into the build and
// relied on the browser/CDN to revalidate. In practice browsers held onto
// stale variants across deploys, so users could see a truncated dataset
// (e.g. 63 gyms) until they hard-reloaded. Now we serve dynamic + explicit
// cache headers: edge can cache for 1h with SWR, browser never holds on.
export const dynamic = 'force-dynamic';

const OVERRIDES = overridesJson as unknown as Record<string, { schedule?: ScheduleEntry[] } | undefined>;

const VALID_DAYS = new Set<DayOfWeek>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const VALID_DISCIPLINES = new Set<Discipline>(['bjj', 'nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing', 'karate', 'taekwondo']);

interface DbOverride {
  schedule?: ScheduleEntry[] | null;
  website?: string | null;
  phone?: string | null;
  instagram?: string | null;
  photo_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  // Path B: gym_overrides is now a first-class gym source. Override-only
  // rows (gym_id starting with `places_`) carry their own location data
  // so the API can synthesize a full Gym object from them.
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
}

function applyScheduleOverride(gym: Gym, schedule: ScheduleEntry[]): Gym {
  const validSchedule = schedule.filter(s =>
    VALID_DAYS.has(s.day) &&
    VALID_DISCIPLINES.has(s.discipline) &&
    typeof s.start_time === 'string'
  );
  if (validSchedule.length === 0) return gym;

  const openMats: OpenMat[] = validSchedule
    .filter(s => s.is_open_mat && !s.is_kids)
    .map((s, i) => ({
      id: `${gym.id}-ov-${i}`,
      day: s.day,
      start_time: s.start_time,
      end_time: s.end_time ?? s.start_time,
      discipline: s.discipline,
      is_free: true,
      confirmed: !!s.verified,
      verified: !!s.verified,
      source_url: s.source_url,
      source_quote: s.source_quote,
      verified_at: s.verified_at,
    }));

  return {
    ...gym,
    open_mats: openMats.length > 0 ? openMats : gym.open_mats,
    schedule: validSchedule,
    provenance: {
      ...(gym.provenance ?? {}),
      schedule_extracted_at: validSchedule[0]?.verified_at ?? gym.provenance?.schedule_extracted_at,
      extraction_status: 'verified',
    },
  };
}

// Static-JSON override layer (legacy — kept as a fallback path).
function applyJsonOverride(gym: Gym): Gym {
  const ov = OVERRIDES[gym.id];
  if (!ov?.schedule || ov.schedule.length === 0) return gym;
  return applyScheduleOverride(gym, ov.schedule);
}

// DB override layer (new — owner edits land here). Pulled with a single
// `select * from gym_overrides` query at request time, then keyed by
// gym_id so the per-gym merge is O(1).
async function fetchDbOverrides(): Promise<Record<string, DbOverride>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return {};
  const supa = createClient(url, key, { auth: { persistSession: false } });

  // Page through — Supabase caps a single .select() at 1000 rows.
  // gym_overrides has ~6,200 places_* rows + a small number of seed
  // overrides. ~7 pages.
  const PAGE = 1000;
  const map: Record<string, DbOverride> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from('gym_overrides')
      .select(
        'gym_id, schedule, website, phone, instagram, photo_url, rating, review_count, ' +
        'name, address, city, state, country, lat, lng',
      )
      .order('gym_id')
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data as unknown as Array<{ gym_id: string } & DbOverride>) {
      map[r.gym_id] = r;
    }
    if (data.length < PAGE) break;
  }
  return map;
}

/** Synthesize a full Gym object from an override-only row. Used for
 *  rows whose gym_id starts with `places_` and doesn't match any seed
 *  gym. Requires `name` + `lat` + `lng` (the location columns added in
 *  the Path B migration). Returns null if essential data is missing. */
function gymFromOverride(gymId: string, ov: DbOverride): Gym | null {
  if (!ov.name || ov.lat == null || ov.lng == null) return null;

  // Pre-built open_mats from any verified schedule entries
  const schedule = (ov.schedule && Array.isArray(ov.schedule)) ? ov.schedule : [];
  const validSchedule = schedule.filter(s =>
    VALID_DAYS.has(s.day) &&
    VALID_DISCIPLINES.has(s.discipline) &&
    typeof s.start_time === 'string'
  );
  const openMats: OpenMat[] = validSchedule
    .filter(s => s.is_open_mat && !s.is_kids)
    .map((s, i) => ({
      id: `${gymId}-ov-${i}`,
      day: s.day,
      start_time: s.start_time,
      end_time: s.end_time ?? s.start_time,
      discipline: s.discipline,
      is_free: true,
      confirmed: !!s.verified,
      verified: !!s.verified,
      source_url: s.source_url,
      source_quote: s.source_quote,
      verified_at: s.verified_at,
    }));

  return {
    id: gymId,
    name: ov.name,
    address: ov.address ?? '',
    city: ov.city ?? '',
    state: ov.state ?? '',
    country: ov.country ?? 'US',
    lat: Number(ov.lat),
    lng: Number(ov.lng),
    website: ov.website ?? undefined,
    phone: ov.phone ?? undefined,
    instagram: ov.instagram ?? undefined,
    open_mats: openMats,
    schedule: validSchedule.length > 0 ? validSchedule : undefined,
    photo_url: ov.photo_url ?? null,
    rating: ov.rating ?? null,
    review_count: ov.review_count ?? null,
    provenance: {
      website_source: 'places',
      places_id: gymId.replace(/^places_/, ''),
      extraction_status: validSchedule.length > 0 ? 'verified' : 'no_schedule_page',
      schedule_extracted_at: validSchedule[0]?.verified_at,
    },
  };
}

function applyDbOverride(gym: Gym, ov: DbOverride | undefined): Gym {
  if (!ov) return gym;
  let next = gym;
  if (ov.schedule && Array.isArray(ov.schedule) && ov.schedule.length > 0) {
    next = applyScheduleOverride(next, ov.schedule);
  }
  if (ov.website)   next = { ...next, website: ov.website };
  if (ov.phone)     next = { ...next, phone: ov.phone };
  if (ov.instagram) next = { ...next, instagram: ov.instagram };
  if (ov.photo_url !== undefined && ov.photo_url !== null) next = { ...next, photo_url: ov.photo_url };
  if (ov.rating !== undefined && ov.rating !== null) next = { ...next, rating: ov.rating };
  if (ov.review_count !== undefined && ov.review_count !== null) next = { ...next, review_count: ov.review_count };
  return next;
}

/** Normalize a gym name for fuzzy matching. Lowercase, strip
 *  punctuation, drop common BJJ/MMA suffix tokens that vary across
 *  listings ("bjj" vs "brazilian jiu jitsu" vs "jiu-jitsu academy"). */
function normalizeGymName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, '')                         // smart quotes / apostrophes
    .replace(/[^a-z0-9\s]/g, ' ')                      // strip punctuation
    .replace(/\b(bjj|brazilian jiu jitsu|jiu jitsu|jujitsu|jiujitsu|jj|gym|academy|martial arts|self defense|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Approx great-circle distance in meters. Used to keep dedup matches
 *  honest — same name but 50 km apart isn't actually the same gym. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Build a map keyed by `normalized-name|city` of seed gyms, so we can
 *  detect when a places_* row is just a duplicate of a seed gym we
 *  already have. */
function indexSeedGymsByName(seedGyms: Gym[]): Map<string, Gym[]> {
  const idx = new Map<string, Gym[]>();
  for (const g of seedGyms) {
    const key = `${normalizeGymName(g.name)}|${(g.city || '').toLowerCase()}`;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key)!.push(g);
  }
  return idx;
}

/** Find a seed gym that matches a places_* override by normalized
 *  name + city, within 25 km (cities have multiple branches but a true
 *  duplicate is always nearby). Returns the seed gym or null. */
function findDuplicateSeedGym(
  ov: DbOverride,
  seedByName: Map<string, Gym[]>,
): Gym | null {
  if (!ov.name || ov.lat == null || ov.lng == null) return null;
  const key = `${normalizeGymName(ov.name)}|${(ov.city || '').toLowerCase()}`;
  const candidates = seedByName.get(key);
  if (!candidates || candidates.length === 0) return null;
  let best: { gym: Gym; dist: number } | null = null;
  for (const cand of candidates) {
    const d = haversineMeters(Number(ov.lat), Number(ov.lng), cand.lat, cand.lng);
    if (d <= 25_000 && (!best || d < best.dist)) best = { gym: cand, dist: d };
  }
  return best?.gym ?? null;
}

export async function GET() {
  const seedGyms = [...GYMS, ...EXTRA_US_GYMS, ...EU_GYMS, ...US_OSM_GYMS, ...GLOBAL_GYMS];
  const seedIds = new Set(seedGyms.map(g => g.id));
  const seedByName = indexSeedGymsByName(seedGyms);

  // Pull DB overrides once per request — paged scan, ~7 round-trips.
  const dbOverrides = await fetchDbOverrides();

  // ── Pre-pass: dedup ──
  // Some places_* gyms are duplicates of seed gyms (the pipeline
  // re-discovered them under a Google Place ID). When we detect this,
  // we route the places_* enrichment (photo/rating/schedule) onto the
  // matching SEED gym so the result is one rich pin instead of two
  // (one bare seed pin + one rich places_* pin).
  //
  // Routing key: id-keyed override (when seed and places share id),
  // otherwise the matched seed gym's id.
  const routedOverrides: Record<string, DbOverride> = { ...dbOverrides };
  const consumedPlacesIds = new Set<string>();
  for (const [gymId, ov] of Object.entries(dbOverrides)) {
    if (!gymId.startsWith('places_')) continue; // only re-route places_* rows
    if (seedIds.has(gymId)) continue;            // already aligned with a seed
    const dup = findDuplicateSeedGym(ov, seedByName);
    if (!dup) continue;

    // Merge this places_* override into the seed gym's slot. If the
    // seed gym already had an override, prefer the existing one but
    // backfill any missing fields (photo, rating, schedule) from the
    // places_* row.
    const existing = routedOverrides[dup.id] ?? {};
    routedOverrides[dup.id] = {
      ...ov,
      ...existing,
      // Existing wins for these specific fields if it has them; ov
      // fills in the gaps. ?? preserves nullability.
      photo_url:    existing.photo_url    ?? ov.photo_url    ?? null,
      rating:       existing.rating       ?? ov.rating       ?? null,
      review_count: existing.review_count ?? ov.review_count ?? null,
      schedule: (existing.schedule && existing.schedule.length > 0)
        ? existing.schedule
        : (ov.schedule ?? null),
    };
    consumedPlacesIds.add(gymId);
  }

  // 1) Merge overrides into seed gyms — including any places_* data
  //    that was rerouted to a seed gym above.
  const merged = seedGyms.map(g => {
    const withJson = applyJsonOverride(g);
    return applyDbOverride(withJson, routedOverrides[g.id]);
  });

  // 2) Synthesize gyms for override-only rows that DIDN'T match a seed
  //    gym. These are net-new gyms the pipeline discovered (places_*
  //    ids that have no equivalent seed gym).
  const synthesized: Gym[] = [];
  for (const [gymId, ov] of Object.entries(dbOverrides)) {
    if (seedIds.has(gymId)) continue;            // already merged above
    if (consumedPlacesIds.has(gymId)) continue;  // collapsed into a seed
    const gym = gymFromOverride(gymId, ov);
    if (gym) synthesized.push(gym);
  }

  const all = [...merged, ...synthesized];

  return NextResponse.json(all, {
    headers: {
      // Edge cache 30s + SWR 600s — owner edits + admin-approved
      // corrections propagate to all viewers within ~30 seconds, with
      // stale-while-revalidate keeping things fast in the meantime.
      // Browser never holds on so a refresh always gets the freshest copy.
      'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=600',
      'X-Gym-Count': String(all.length),
      'X-Gym-Seed-Count': String(merged.length),
      'X-Gym-Synthesized-Count': String(synthesized.length),
      'X-Gym-Deduped-Count': String(consumedPlacesIds.size),
    },
  });
}
