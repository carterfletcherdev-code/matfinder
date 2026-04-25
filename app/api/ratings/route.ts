import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseEnabled } from '@/lib/supabase';

// GET /api/ratings?gym_id=123
export async function GET(req: NextRequest) {
  const gymId = req.nextUrl.searchParams.get('gym_id');
  if (!gymId) return NextResponse.json({ error: 'Missing gym_id' }, { status: 400 });

  if (!supabaseEnabled) {
    return NextResponse.json({ avg: null, count: 0, userRating: null });
  }

  const { data, error } = await supabase
    .from('ratings')
    .select('score, comment, created_at')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const avg = data?.length
    ? data.reduce((s, r) => s + r.score, 0) / data.length
    : null;

  return NextResponse.json({ avg, count: data?.length ?? 0, ratings: data ?? [] });
}

// POST /api/ratings  { gym_id, score, comment? }
export async function POST(req: NextRequest) {
  if (!supabaseEnabled) {
    return NextResponse.json({ error: 'Ratings not configured yet' }, { status: 503 });
  }

  const body = await req.json();
  const { gym_id, score, comment } = body;

  if (!gym_id || !score || score < 1 || score > 5) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Use IP as anonymous identifier (no auth required)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  const { error } = await supabase.from('ratings').upsert(
    { gym_id, score, comment: comment?.slice(0, 500) ?? null, ip_hash: ip },
    { onConflict: 'gym_id,ip_hash' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
