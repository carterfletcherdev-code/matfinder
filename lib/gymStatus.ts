// Pure helpers for computing a gym's "right now" status from its weekly
// schedule. Returns one of 5 states the UI can render:
//
//   in_session    — a class is happening now
//   starting_soon — a class starts within 60 min
//   open_mat_today — today has an open-mat entry (any time)
//   open_today    — today has at least one class on the schedule
//   closed_today  — today is on the schedule but has no entries
//   unknown       — gym has no schedule data at all
//
// All inputs are pure data; this file imports nothing from React. Keeps
// the module testable and reusable from server components.

import type { ScheduleEntry, DayOfWeek } from './types';

export type GymStatus =
  | 'in_session'
  | 'starting_soon'
  | 'open_mat_today'
  | 'open_today'
  | 'closed_today'
  | 'unknown';

const DAYS: DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
];

/** Today's day-of-week token, in the gym's local time zone if we knew it.
 *  For now we use the user's local time — a future improvement is to look
 *  up the gym's IANA tz from coordinates. */
function todayKey(now: Date): DayOfWeek {
  return DAYS[now.getDay()]!;
}

/** Convert "HH:MM" → minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Window in which a class counts as "starting soon." */
const STARTING_SOON_MIN = 60;
/** When a class has no end time, assume this default duration. */
const DEFAULT_CLASS_DURATION_MIN = 60;

/** Compute current status for a gym given its schedule. Pure. */
export function computeGymStatus(
  schedule: ScheduleEntry[] | undefined,
  now: Date = new Date(),
): GymStatus {
  if (!schedule || schedule.length === 0) return 'unknown';

  const today = todayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayEntries = schedule.filter(e => e.day === today);

  if (todayEntries.length === 0) return 'closed_today';

  // 1) In session?
  for (const e of todayEntries) {
    const start = toMinutes(e.start_time);
    const end = e.end_time ? toMinutes(e.end_time) : start + DEFAULT_CLASS_DURATION_MIN;
    if (nowMin >= start && nowMin < end) return 'in_session';
  }

  // 2) Starting within 60 min?
  for (const e of todayEntries) {
    const start = toMinutes(e.start_time);
    if (start > nowMin && start - nowMin <= STARTING_SOON_MIN) return 'starting_soon';
  }

  // 3) Open mat today (any time, regardless of past/future)?
  if (todayEntries.some(e => e.is_open_mat)) return 'open_mat_today';

  // 4) Otherwise just "scheduled today."
  return 'open_today';
}

/** Human label for each status. Used by StatusBadge + screen readers. */
export const STATUS_LABEL: Record<GymStatus, string> = {
  in_session:     'In session',
  starting_soon:  'Starting soon',
  open_mat_today: 'Open mat today',
  open_today:     'Open today',
  closed_today:   'No classes today',
  unknown:        'Schedule unknown',
};

/** Maps each status to a CSS variable from globals.css. The UI layer
 *  uses these to build colored pills, dots, and icons consistently. */
export const STATUS_COLOR_VAR: Record<GymStatus, string> = {
  in_session:     'var(--processing)', // orange — class happening now
  starting_soon:  'var(--processing)', // orange — class about to start
  open_mat_today: 'var(--success)',    // green — open mat today
  open_today:     'var(--success)',    // green — at least one class today
  closed_today:   'var(--text-muted)', // muted — nothing scheduled today
  unknown:        'var(--text-muted)', // muted — no schedule data
};

/** Whether the status should be visually pulsed/animated. Reserved for
 *  the truly live states. */
export function isPulseStatus(s: GymStatus): boolean {
  return s === 'in_session' || s === 'starting_soon';
}
