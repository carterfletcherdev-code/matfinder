// Tiny analytics tracker. Fires a POST to /api/events with the event
// type + gym id. Always non-blocking — uses `keepalive` so it survives
// even if the user navigates immediately after the call.
//
// Dedupes the same (event_type, gym_id) pair within a short window so
// a flood of card_open re-renders or rapid pin re-taps doesn't blow
// up the events table.

export type EventType =
  | 'card_open'
  | 'pin_tap'
  | 'ig_click'
  | 'directions_click'
  | 'phone_click';

const recent = new Map<string, number>();
const DEDUPE_MS = 30_000; // 30 seconds

export function trackEvent(eventType: EventType, gymId: string) {
  if (typeof window === 'undefined') return;
  if (!gymId) return;

  const key = `${eventType}:${gymId}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return;
  recent.set(key, now);

  // Garbage-collect older entries occasionally so the map doesn't grow
  // unbounded across long sessions.
  if (recent.size > 500) {
    for (const [k, t] of recent) {
      if (now - t > DEDUPE_MS) recent.delete(k);
    }
  }

  try {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, gym_id: gymId }),
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch { /* swallow */ }
}
