import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const gymId = session.metadata?.gym_id;
    const userId = session.metadata?.user_id;
    const planId = session.metadata?.plan_id;
    const ownerEmail = session.metadata?.owner_email;
    const ownerName = session.metadata?.owner_name;
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
    const customerId = typeof session.customer === 'string' ? session.customer : null;

    // Gym featured listing
    if (gymId) {
      await supabaseAdmin.from('gym_claims').upsert({
        gym_id: gymId,
        owner_name: ownerName,
        owner_email: ownerEmail,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId ?? null,
        status: 'active',
      }, { onConflict: 'gym_id' });
    }

    // User subscription (Standard/Pro)
    if (userId && planId) {
      await supabaseAdmin.from('subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId ?? null,
        tier: planId,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const gymId = sub.metadata?.gym_id;
    const userId = sub.metadata?.user_id;
    if (gymId) {
      await supabaseAdmin.from('gym_claims').update({ status: 'cancelled' }).eq('gym_id', gymId);
    }
    if (userId) {
      await supabaseAdmin.from('subscriptions').update({ status: 'cancelled', tier: 'free', updated_at: new Date().toISOString() }).eq('user_id', userId);
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const gymId = sub.metadata?.gym_id;
    const userId = sub.metadata?.user_id;
    const planId = sub.metadata?.plan_id;
    const isActive = sub.status === 'active' || sub.status === 'trialing';
    if (gymId) {
      await supabaseAdmin.from('gym_claims').update({ status: isActive ? 'active' : 'cancelled', stripe_subscription_id: sub.id }).eq('gym_id', gymId);
    }
    if (userId) {
      await supabaseAdmin.from('subscriptions').update({
        status: isActive ? 'active' : 'cancelled',
        tier: isActive ? (planId ?? 'free') : 'free',
        stripe_subscription_id: sub.id,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId);
    }
  }

  return NextResponse.json({ received: true });
}
