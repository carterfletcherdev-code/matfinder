import { NextResponse } from 'next/server';
import { supabase, supabaseEnabled } from '@/lib/supabase';

// Returns gym IDs with active featured listings so the frontend can merge them.
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabaseEnabled) return NextResponse.json([]);

  const { data, error } = await supabase
    .from('gym_claims')
    .select('gym_id')
    .eq('status', 'active');

  if (error) return NextResponse.json([]);
  return NextResponse.json((data ?? []).map((r: { gym_id: string }) => r.gym_id));
}
