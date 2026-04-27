import { NextResponse } from 'next/server';
import { GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS } from '@/lib/data';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json([
    ...GYMS,
    ...EXTRA_US_GYMS,
    ...EU_GYMS,
    ...US_OSM_GYMS,
    ...GLOBAL_GYMS,
  ]);
}
