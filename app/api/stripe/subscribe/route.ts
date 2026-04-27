import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const PRICE_IDS: Record<string, string | undefined> = {
  standard: process.env.STRIPE_STANDARD_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
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
    console.error('Stripe subscribe error:', err);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
