// Owner schedule API.
//
// GET  /api/owner/schedule?gym_id=<id>
//   Returns { schedule: ScheduleEntry[], website, phone, instagram }
//   reflecting the gym_overrides row, OR the static fallback if no
//   override exists yet. Caller must be a verified owner of the gym.
//
// POST /api/owner/schedule
//   Body: { gym_id, schedule, website?, phone?, instagram? }
//   Upserts the override row. RLS gates this — the policy on
//   gym_overrides only allows the upsert if the requesting user has
//   a verified row in gym_owners for this gym.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS } from '@/lib/data';
import overridesJson from '@/lib/schedule-overrides.json';
import type { Gym, ScheduleEntry, DayOfWeek, Discipline } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_DAYS = new Set<DayOfWeek>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const VALID_DISCIPLINES = new Set<Discipline>(['bjj', 'nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing', 'karate', 'taekwondo']);

const STATIC_OVERRIDES = overridesJson as unknown as Record<string, { schedule?: ScheduleEntry[] } | undefined>;

function findGym(id: string): Gym | null {
  const all = [GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS];
  for (const list of all) {
    const g = list.find(x => x.id === id);
    if (g) return g;
  }
  return null;
}

function clientFromAuth(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') ?? undefined;
  return createClient(url, key, {
    global: auth ? { headers: { Authorization: auth } } : undefined,
    auth: { persistSession: false },
  });
}

async function isVerifiedOwner(supa: ReturnType<typeof clientFromAuth>, gymId: string) {
  const { data: u } = await supa.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supa
    .from('gym_owners')
    .select('id, status')
    .eq('user_id', u.user.id)
    .eq('gym_id', gymId)
    .eq('status', 'verified')
    .maybeSingle();
  if (error || !data) return null;
  return u.user.id;
}

function sanitizeScheduleEntry(raw: unknown, ownerId: string): ScheduleEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const day = r.day as DayOfWeek;
  const discipline = r.discipline as Discipline;
  if (!VALID_DAYS.has(day)) return null;
  if (!VALID_DISCIPLINES.has(discipline)) return null;
  if (typeof r.start_time !== 'string') return null;
  if (typeof r.class_name !== 'string') return null;
  return {
    day,
    start_time: String(r.start_time).slice(0, 5),
    end_time: typeof r.end_time === 'string' ? String(r.end_time).slice(0, 5) : null,
    class_name: String(r.class_name).slice(0, 80),
    discipline,
    is_open_mat: !!r.is_open_mat,
    is_kids: !!r.is_kids,
    level: typeof r.level === 'string' ? String(r.level).slice(0, 40) : undefined,
    // Owner-submitted entries are auto-verified — they're the source of truth.
    verified: true,
    source_url: undefined,
    source_quote: `Submitted by verified gym owner (${ownerId.slice(0, 8)})`,
    verified_at: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const gymId = req.nextUrl.searchParams.get('gym_id');
  if (!gymId) return NextResponse.json({ error: 'Missing gym_id' }, { status: 400 });

  const supa = clientFromAuth(req);
  const ownerId = await isVerifiedOwner(supa, gymId);
  if (!ownerId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  // Try the override first
  const { data: override } = await supa
    .from('gym_overrides')
    .select('schedule, website, phone, instagram')
    .eq('gym_id', gymId)
    .maybeSingle();

  if (override?.schedule) {
    return NextResponse.json({
      gym_id: gymId,
      schedule: override.schedule,
      website: override.website,
      phone: override.phone,
      instagram: override.instagram,
    });
  }

  // Fall back to static + JSON-overrides snapshot
  const gym = findGym(gymId);
  if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 });
  const staticSchedule = STATIC_OVERRIDES[gymId]?.schedule ?? gym.schedule ?? [];

  return NextResponse.json({
    gym_id: gymId,
    schedule: staticSchedule,
    website: gym.website ?? null,
    phone: gym.phone ?? null,
    instagram: gym.instagram ?? null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Bad body' }, { status: 400 });
  }
  const gymId = String((body as Record<string, unknown>).gym_id ?? '');
  if (!gymId) return NextResponse.json({ error: 'Missing gym_id' }, { status: 400 });

  const supa = clientFromAuth(req);
  const ownerId = await isVerifiedOwner(supa, gymId);
  if (!ownerId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const rawSchedule = (body as Record<string, unknown>).schedule;
  if (!Array.isArray(rawSchedule)) {
    return NextResponse.json({ error: 'schedule must be an array' }, { status: 400 });
  }
  const cleanedSchedule = rawSchedule
    .map(r => sanitizeScheduleEntry(r, ownerId))
    .filter((s): s is ScheduleEntry => s !== null);

  const website = typeof (body as Record<string, unknown>).website === 'string'
    ? String((body as Record<string, unknown>).website).slice(0, 256) : null;
  const phone = typeof (body as Record<string, unknown>).phone === 'string'
    ? String((body as Record<string, unknown>).phone).slice(0, 32) : null;
  const instagram = typeof (body as Record<string, unknown>).instagram === 'string'
    ? String((body as Record<string, unknown>).instagram).slice(0, 256) : null;

  const { error } = await supa
    .from('gym_overrides')
    .upsert({
      gym_id: gymId,
      schedule: cleanedSchedule,
      website,
      phone,
      instagram,
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: cleanedSchedule.length });
}
