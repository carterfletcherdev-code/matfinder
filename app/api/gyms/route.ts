import { NextResponse } from 'next/server';
import { GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS } from '@/lib/data';
import overridesJson from '@/lib/schedule-overrides.json';
import type { Gym, OpenMat, ScheduleEntry, DayOfWeek, Discipline } from '@/lib/types';

export const dynamic = 'force-static';

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

export function GET() {
  const all = [...GYMS, ...EXTRA_US_GYMS, ...EU_GYMS, ...US_OSM_GYMS, ...GLOBAL_GYMS];
  return NextResponse.json(all.map(applyOverrides));
}
