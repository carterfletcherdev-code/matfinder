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

export async function GET() {
  const seedGyms = [...GYMS, ...EXTRA_US_GYMS, ...EU_GYMS, ...US_OSM_GYMS, ...GLOBAL_GYMS];
  const seedIds = new Set(seedGyms.map(g => g.id));

  // Pull DB overrides once per request — paged scan, ~7 round-trips.
  const dbOverrides = await fetchDbOverrides();

  // 1) Merge overrides into seed gyms (existing behavior)
  const merged = seedGyms.map(g => {
    const withJson = applyJsonOverride(g);
    return applyDbOverride(withJson, dbOverrides[g.id]);
  });

  // 2) Path B: synthesize gyms for override-only rows whose id doesn't
  //    match any seed gym. These are the ~6,200 places_* gyms the
  //    Phase 1/2/1B pipelines discovered + enriched. Without this loop
  //    they never reach the UI.
  const synthesized: Gym[] = [];
  for (const [gymId, ov] of Object.entries(dbOverrides)) {
    if (seedIds.has(gymId)) continue; // already merged above
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
    },
  });
}
