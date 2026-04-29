import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Standard tier was retired; only Pro is offered going forward. Two
// billing cadences both map to the same product in Stripe — monthly
// price ($6.99) and annual price ($59.99, ~$5/mo, 28% cheaper).
const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  pro_annual: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
};

export async function POST(req: NextRequest) {
  try {
    const { planId, userId, email } = await req.json();

    if (!planId || !userId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let priceId = PRICE_IDS[planId];
    if (!priceId || !process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Plan not configured' }, { status: 503 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // If a product ID was configured instead of a price ID, resolve the default price
    if (priceId.startsWith('prod_')) {
      const product = await stripe.products.retrieve(priceId);
      if (!product.default_price) {
        return NextResponse.json({ error: 'No default price on product' }, { status: 503 });
      }
      priceId = typeof product.default_price === 'string' ? product.default_price : product.default_price.id;
    }

    const origin = req.headers.get('origin') || 'https://matfinder.io';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: userId, plan_id: planId },
      subscription_data: { metadata: { user_id: userId, plan_id: planId } },
      success_url: `${origin}/account?upgraded=1`,
      cancel_url: `${origin}/account/upgrade`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Surface the underlying Stripe error in the response so we can
    // diagnose mode mismatches, archived products, missing default
    // prices, etc. without needing log-stream access. No secrets are
    // exposed — Stripe error.message contains only the actionable
    // description.
    console.error('Stripe subscribe error:', err);
    const e = err as { message?: string; code?: string; type?: string; raw?: { message?: string; code?: string } };
    const detail = e?.raw?.message || e?.message || 'Unknown Stripe error';
    const code = e?.raw?.code || e?.code || e?.type || 'unknown';
    return NextResponse.json({
      error: `Failed to create session: ${detail} (${code})`,
    }, { status: 500 });
  }
}
