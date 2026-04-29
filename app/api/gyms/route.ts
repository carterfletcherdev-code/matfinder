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
  const { data, error } = await supa
    .from('gym_overrides')
    .select('gym_id, schedule, website, phone, instagram');
  if (error || !data) return {};
  const map: Record<string, DbOverride> = {};
  for (const r of data as Array<{ gym_id: string } & DbOverride>) {
    map[r.gym_id] = r;
  }
  return map;
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
  return next;
}

export async function GET() {
  const all = [...GYMS, ...EXTRA_US_GYMS, ...EU_GYMS, ...US_OSM_GYMS, ...GLOBAL_GYMS];
  // Pull DB overrides once per request — small table, fast scan.
  const dbOverrides = await fetchDbOverrides();
  const merged = all.map(g => {
    const withJson = applyJsonOverride(g);
    return applyDbOverride(withJson, dbOverrides[g.id]);
  });
  return NextResponse.json(merged, {
    headers: {
      // Edge cache 30s + SWR 600s — owner edits + admin-approved
      // corrections propagate to all viewers within ~30 seconds, with
      // stale-while-revalidate keeping things fast in the meantime.
      // Browser never holds on so a refresh always gets the freshest copy.
      'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=600',
      'X-Gym-Count': String(merged.length),
    },
  });
}
