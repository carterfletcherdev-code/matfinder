// Fire-and-forget analytics event ingestion.
//
// Accepts: { event_type: 'card_open' | 'pin_tap' | 'ig_click' | 'directions_click', gym_id: string }
// Writes one row to public.events. user_id is read from the request's
// supabase auth cookie when present; anonymous otherwise.
//
// Designed to be called from the client via fetch with `keepalive: true`
// so it never blocks the user's interaction. Always returns 200 — even on
// error — so the client never sees a failed request that could trigger a
// retry storm.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set([
  'card_open',
  'pin_tap',
  'ig_click',
  'directions_click',
  'phone_click',
]);

export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ ok: true });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const eventType = String(body.event_type ?? '').slice(0, 32);
    const gymId = String(body.gym_id ?? '').slice(0, 128);
    if (!eventType || !gymId || !VALID_TYPES.has(eventType)) {
      return NextResponse.json({ ok: true });
    }

    // Server-side derive user_id from the auth cookie (if present) so
    // the client can't forge it. We don't await this — fire and forget.
    const authHeader = req.headers.get('authorization') ?? undefined;
    const supa = createClient(url, key, {
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
      auth: { persistSession: false },
    });

    let userId: string | null = null;
    try {
      const { data } = await supa.auth.getUser();
      userId = data.user?.id ?? null;
    } catch { /* anonymous */ }

    await supa.from('events').insert({
      event_type: eventType,
      gym_id: gymId,
      user_id: userId,
    });
  } catch { /* swallow */ }

  return NextResponse.json({ ok: true });
}
