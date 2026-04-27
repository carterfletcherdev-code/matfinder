import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseEnabled } from '@/lib/supabase';

// GET /api/ratings — returns aggregates { gymId: { avg, count } }
// Writes are performed client-side via the authenticated supabase client + RLS.
export async function GET(req: NextRequest) {
  const gymId = req.nextUrl.searchParams.get('gym_id');

  if (!supabaseEnabled) {
    return NextResponse.json(gymId ? { avg: null, count: 0 } : { aggregates: {} });
  }

  if (gymId) {
    const { data, error } = await supabase.from('ratings').select('score').eq('gym_id', gymId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const count = data?.length ?? 0;
    const avg = count ? data!.reduce((s, r) => s + r.score, 0) / count : null;
    return NextResponse.json({ avg, count });
  }

  const { data, error } = await supabase.from('ratings').select('gym_id, score');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const sums: Record<string, { sum: number; count: number }> = {};
  for (const r of data ?? []) {
    const a = sums[r.gym_id] ?? (sums[r.gym_id] = { sum: 0, count: 0 });
    a.sum += r.score; a.count += 1;
  }
  const aggregates: Record<string, { avg: number; count: number }> = {};
  for (const [id, { sum, count }] of Object.entries(sums)) {
    aggregates[id] = { avg: sum / count, count };
  }
  return NextResponse.json({ aggregates });
}
