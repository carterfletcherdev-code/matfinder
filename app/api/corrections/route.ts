import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseEnabled } from '@/lib/supabase';

// POST /api/corrections  { gym_id, gym_name, gym_city, field, current_val, correct_val, notes? }
export async function POST(req: NextRequest) {
  if (!supabaseEnabled) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { gym_id, gym_name, gym_city, field, current_val, correct_val, notes } = body;

  if (!gym_id || !field || !correct_val) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error } = await supabase.from('corrections').insert({
    gym_id,
    gym_name: gym_name ?? null,
    gym_city: gym_city ?? null,
    field,
    current_val: current_val ?? null,
    correct_val: String(correct_val).slice(0, 500),
    notes: notes ? String(notes).slice(0, 1000) : null,
    status: 'pending',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// GET /api/corrections?secret=<ADMIN_SECRET>  — list all pending
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseEnabled) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('corrections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH /api/corrections  { id, status: 'approved'|'rejected', secret }
export async function PATCH(req: NextRequest) {
  if (!supabaseEnabled) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { id, status, secret } = body;

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await supabase
    .from('corrections')
    .update({ status })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
