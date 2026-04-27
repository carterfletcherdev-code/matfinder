-- Featured gym listings — created when a gym owner completes Stripe checkout
create table if not exists gym_claims (
  gym_id                text primary key,
  owner_name            text not null,
  owner_email           text not null,
  stripe_session_id     text,
  stripe_customer_id    text,
  stripe_subscription_id text,
  status                text not null default 'pending'
    check (status in ('pending', 'active', 'cancelled')),
  claimed_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Auto-update updated_at on any change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger gym_claims_updated_at
  before update on gym_claims
  for each row execute function update_updated_at();

-- Public read: the /api/featured route fetches active claims with the anon key
alter table gym_claims enable row level security;

create policy "Anyone can read active claims"
  on gym_claims for select
  using (status = 'active');

-- Only the service role (webhooks) can insert/update
create policy "Service role can write"
  on gym_claims for all
  using (auth.role() = 'service_role');
