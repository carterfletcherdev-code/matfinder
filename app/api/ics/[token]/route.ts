// Per-user ICS calendar feed.
//
// Subscribe URL: https://matfinder.io/api/ics/<token>/calendar.ics — actually
// we just match `/api/ics/[token]` here; the `.ics` suffix in the URL is
// optional (Apple Calendar adds it automatically when subscribing).
//
// `token` is the user's Supabase user_id (UUID). Treating it as a bearer
// token is acceptable for v1: UUIDs are 128-bit and not realistically
// guessable, and the data exposed is just open-mat times for gyms the
// user has favorited (no PII). If we want revocation later, we'll add a
// per-user ics_token column and rotate.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS } from '@/lib/data';
import overridesJson from '@/lib/schedule-overrides.json';
import type { Gym, OpenMat, ScheduleEntry, DayOfWeek, Discipline } from '@/lib/types';

export const dynamic = 'force-dynamic';

const OVERRIDES = overridesJson as unknown as Record<string, { schedule?: ScheduleEntry[] } | undefined>;
const VALID_DAYS = new Set<DayOfWeek>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const VALID_DISCIPLINES = new Set<Discipline>(['bjj', 'nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing', 'karate', 'taekwondo']);

function applyOverrides(gym: Gym): Gym {
  const ov = OVERRIDES[gym.id];
  if (!ov?.schedule || ov.schedule.length === 0) return gym;
  const validSchedule = ov.schedule.filter(s =>
    VALID_DAYS.has(s.day) &&
    VALID_DISCIPLINES.has(s.discipline) &&
    typeof s.start_time === 'string'
  );
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
    }));
  return {
    ...gym,
    open_mats: openMats.length > 0 ? openMats : gym.open_mats,
  };
}

const DAY_TO_RRULE: Record<DayOfWeek, string> = {
  sunday: 'SU', monday: 'MO', tuesday: 'TU', wednesday: 'WE',
  thursday: 'TH', friday: 'FR', saturday: 'SA',
};
const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};
const DISCIPLINE_LABELS: Record<Discipline, string> = {
  bjj: 'Jiu-Jitsu', nogi_bjj: 'No-Gi Jiu-Jitsu', gi_bjj: 'Gi Jiu-Jitsu',
  wrestling: 'Wrestling', judo: 'Judo', muay_thai: 'Muay Thai',
  mma: 'MMA', kickboxing: 'Kickboxing', boxing: 'Boxing',
  karate: 'Karate', taekwondo: 'Taekwondo',
};

/** Format a Date as a local ICS DATETIME (YYYYMMDDTHHMMSS — floating). */
function fmtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/** Format a Date as a UTC ICS DATETIME (YYYYMMDDTHHMMSSZ). */
function fmtUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/** Build the next future Date that falls on `day` at HH:MM (local floating). */
function nextOccurrence(day: DayOfWeek, hhmm: string, now: Date): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h || 0, m || 0, 0, 0);
  const todayIdx = target.getDay();
  const diff = (DAY_INDEX[day] - todayIdx + 7) % 7;
  target.setDate(target.getDate() + diff);
  if (diff === 0 && target.getTime() < now.getTime()) target.setDate(target.getDate() + 7);
  return target;
}

/** Escape ICS text fields per RFC 5545: backslash, comma, semicolon, newlines. */
function ics(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  // RFC 5545: lines should be folded at 75 octets with CRLF + space.
  if (line.length <= 75) return line;
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) {
    out.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
  }
  return out.join('\r\n');
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Strip optional .ics suffix so /api/ics/<token>/calendar.ics works too.
  const userId = token.replace(/\.ics$/i, '');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new NextResponse('Server not configured', { status: 500 });
  }
  const supa = createClient(url, key);

  // Read favorites for this user.
  const { data: favs } = await supa
    .from('favorites')
    .select('gym_id')
    .eq('user_id', userId);
  const favSet = new Set((favs ?? []).map(r => r.gym_id));

  if (favSet.size === 0) {
    // Empty calendar — still valid ICS.
    const empty = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MatFinder//Open Mats//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'NAME:MatFinder — My Open Mats',
      'X-WR-CALNAME:MatFinder — My Open Mats',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      'END:VCALENDAR',
    ].join('\r\n');
    return new NextResponse(empty, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  // Resolve gym data.
  const all: Gym[] = [
    ...GYMS, ...EXTRA_US_GYMS, ...EU_GYMS, ...US_OSM_GYMS, ...GLOBAL_GYMS,
  ].map(applyOverrides);
  const myGyms = all.filter(g => favSet.has(g.id));

  const now = new Date();
  const dtStamp = fmtUtc(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MatFinder//Open Mats//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'NAME:MatFinder — My Open Mats',
    'X-WR-CALNAME:MatFinder — My Open Mats',
    'X-WR-CALDESC:Open mats from gyms you have favorited on MatFinder.',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const gym of myGyms) {
    for (const mat of gym.open_mats ?? []) {
      if (!VALID_DAYS.has(mat.day)) continue;
      if (!mat.start_time) continue;

      const start = nextOccurrence(mat.day, mat.start_time, now);
      const endHHMM = mat.end_time && mat.end_time !== mat.start_time
        ? mat.end_time
        : null;
      let end: Date;
      if (endHHMM) {
        const [h, m] = endHHMM.split(':').map(Number);
        end = new Date(start);
        end.setHours(h || 0, m || 0, 0, 0);
        if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
      } else {
        end = new Date(start.getTime() + 60 * 60 * 1000); // default 1h
      }

      const summary = `Open mat — ${ics(gym.name)}`;
      const locParts = [gym.address, gym.city, gym.state, gym.country].filter(Boolean);
      const description = [
        `Discipline: ${DISCIPLINE_LABELS[mat.discipline] ?? mat.discipline}`,
        mat.is_free ? 'Free for visitors' : null,
        mat.verified ? 'Verified open mat' : null,
        gym.website ? `Website: ${gym.website}` : null,
        '',
        'Times in your local timezone — please confirm with the gym.',
      ].filter(Boolean).join('\\n');

      lines.push(
        'BEGIN:VEVENT',
        fold(`UID:${gym.id}-${mat.id}@matfinder.io`),
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${fmtLocal(start)}`,
        `DTEND:${fmtLocal(end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${DAY_TO_RRULE[mat.day]}`,
        fold(`SUMMARY:${summary}`),
        fold(`LOCATION:${ics(locParts.join(', '))}`),
        fold(`DESCRIPTION:${description}`),
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  const body = lines.join('\r\n') + '\r\n';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="matfinder.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
