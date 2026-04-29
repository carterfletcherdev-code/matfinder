// Aggregate check-in counts per gym for the trailing 7 days.
//
// Used for:
//   1. Social-proof badge on each gym card ("12 trained here this week")
//   2. The "Popular" sort tab — gyms with more recent check-ins float up.
//
// Returns a flat map { [gym_id]: count }. No usernames, no PII.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ counts: {} }, { status: 200 });
  }
  const supa = createClient(url, key);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // We just need gym_id from rows in the last 7 days; tally client-side.
  // For ~thousands of recent check-ins this is fine; if it grows we'll
  // add a materialized view.
  const { data, error } = await supa
    .from('checkins')
    .select('gym_id')
    .gte('checked_in_at', sevenDaysAgo);

  if (error || !data) {
    return NextResponse.json({ counts: {} }, { status: 200 });
  }

  const counts: Record<string, number> = {};
  for (const r of data) {
    if (!r.gym_id) continue;
    counts[r.gym_id] = (counts[r.gym_id] ?? 0) + 1;
  }

  return NextResponse.json({ counts }, {
    headers: {
      // Edge-cache 5 minutes; browsers don't hold on.
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
