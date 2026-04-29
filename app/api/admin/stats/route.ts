// Admin stats endpoint.
//
// Returns:
//   total_accounts        — total rows in auth.users
//   active_users_30d      — auth.users with last_sign_in_at within 30 days
//   subscriptions_total   — active Stripe subscriptions on the Pro product
//   subscriptions_monthly — active subs on the $6.99/mo price
//   subscriptions_annual  — active subs on the $59.99/yr price
//   monthly_revenue_cents — MRR (cents)
//   annual_revenue_cents  — ARR (cents) — equals MRR × 12
//   subscribers[]         — { email, interval, amount_cents, started_at, status }
//   users[]               — { email, created_at, last_sign_in_at }  (capped 1000)
//
// Admin gate: caller must be present in public.admins. We verify via the
// caller's bearer token, then switch to the service-role key to read
// auth.users. Stripe data comes from the Stripe API using STRIPE_SECRET_KEY.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

async function isAdmin(req: NextRequest): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const supa = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await supa.auth.getUser();
  if (!u.user) return false;
  const { data, error } = await supa
    .from('admins')
    .select('user_id')
    .eq('user_id', u.user.id)
    .maybeSingle();
  return !error && !!data;
}

interface UserRow { email: string; created_at: string; last_sign_in_at: string | null; }
interface SubscriberRow {
  email: string;
  interval: 'month' | 'year' | 'unknown';
  amount_cents: number;
  started_at: string;
  status: string;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  const proAnnualPriceId = process.env.STRIPE_PRO_YEARLY_PRICE_ID;

  // ── Supabase users ──────────────────────────────────────────────────
  let totalAccounts = 0;
  let active30d = 0;
  const users: UserRow[] = [];
  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let page = 1;
    const pageSize = 200;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
      if (error) break;
      const list = data?.users ?? [];
      for (const u of list) {
        totalAccounts++;
        const last = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
        if (last && last >= cutoff) active30d++;
        if (users.length < 1000) {
          users.push({
            email: u.email ?? '',
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at ?? null,
          });
        }
      }
      if (list.length < pageSize) break;
      page++;
      if (page > 100) break;
    }
    // Sort: most recently active first
    users.sort((a, b) => {
      const aT = a.last_sign_in_at ? Date.parse(a.last_sign_in_at) : 0;
      const bT = b.last_sign_in_at ? Date.parse(b.last_sign_in_at) : 0;
      return bT - aT;
    });
  }

  // ── Stripe subscriptions ────────────────────────────────────────────
  let subsTotal = 0;
  let subsMonthly = 0;
  let subsAnnual = 0;
  let mrrCents = 0;
  const subscribers: SubscriberRow[] = [];
  if (stripeKey) {
    const stripe = new Stripe(stripeKey);
    let starting_after: string | undefined;
    while (true) {
      const page = await stripe.subscriptions.list({
        status: 'active',
        limit: 100,
        starting_after,
        expand: ['data.customer'],
      });
      for (const sub of page.data) {
        const item = sub.items.data[0];
        const price = item?.price;
        const priceId = price?.id;
        const interval = price?.recurring?.interval;
        const amount = price?.unit_amount ?? 0;

        let bucket: 'month' | 'year' | 'unknown' = 'unknown';
        if (priceId === proPriceId || interval === 'month') bucket = 'month';
        else if (priceId === proAnnualPriceId || interval === 'year') bucket = 'year';

        if (bucket === 'month') {
          subsMonthly++;
          subsTotal++;
          mrrCents += amount;
        } else if (bucket === 'year') {
          subsAnnual++;
          subsTotal++;
          mrrCents += Math.round(amount / 12);
        }

        // Customer email (expanded)
        let email = '';
        const cust = sub.customer;
        if (cust && typeof cust === 'object' && 'email' in cust && cust.email) {
          email = cust.email;
        }

        subscribers.push({
          email,
          interval: bucket,
          amount_cents: amount,
          started_at: new Date(sub.start_date * 1000).toISOString(),
          status: sub.status,
        });
      }
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
      if (!starting_after) break;
    }
    // Sort subscribers: most recent first
    subscribers.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  }

  return NextResponse.json({
    total_accounts: totalAccounts,
    active_users_30d: active30d,
    subscriptions_total: subsTotal,
    subscriptions_monthly: subsMonthly,
    subscriptions_annual: subsAnnual,
    monthly_revenue_cents: mrrCents,
    annual_revenue_cents: mrrCents * 12,
    subscribers,
    users,
  });
}
