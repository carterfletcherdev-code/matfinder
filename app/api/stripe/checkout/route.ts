import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);
const PRICE_ID = () => process.env.STRIPE_FEATURED_PRICE_ID!;

export async function POST(req: NextRequest) {
  try {
    const { gymId, gymName, ownerName, ownerEmail } = await req.json();

    if (!gymId || !gymName || !ownerName || !ownerEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY || !PRICE_ID()) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }


    // Check if this gym is already claimed and active
    const { data: existing } = await supabase
      .from('gym_claims')
      .select('status')
      .eq('gym_id', gymId)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This gym already has an active featured listing.' }, { status: 409 });
    }

    const origin = req.headers.get('origin') || 'https://matfinder.app';

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: ownerEmail,
      line_items: [{ price: PRICE_ID(), quantity: 1 }],
      metadata: { gym_id: gymId, gym_name: gymName, owner_name: ownerName, owner_email: ownerEmail },
      success_url: `${origin}/claim/success?gym_id=${gymId}&gym_name=${encodeURIComponent(gymName)}`,
      cancel_url: `${origin}/claim/${gymId}`,
      subscription_data: {
        metadata: { gym_id: gymId, gym_name: gymName, owner_name: ownerName },
      },
    });

    // Record the pending claim (needs service role to bypass RLS)
    await supabaseAdmin.from('gym_claims').upsert({
      gym_id: gymId,
      owner_name: ownerName,
      owner_email: ownerEmail,
      stripe_session_id: session.id,
      status: 'pending',
    }, { onConflict: 'gym_id' });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
