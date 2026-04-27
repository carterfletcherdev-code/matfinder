-- Favorites
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  created_at timestamptz default now(),
  unique(user_id, gym_id)
);
alter table favorites enable row level security;
create policy "users manage own favorites" on favorites
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User subscriptions
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text not null default 'free' check (tier in ('free', 'standard', 'pro')),
  status text not null default 'inactive' check (status in ('active', 'inactive', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "users read own subscription" on subscriptions
  for select using (auth.uid() = user_id);
create policy "service role manages subscriptions" on subscriptions
  using (true) with check (true);

-- Check-ins
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  checked_in_at timestamptz default now(),
  note text
);
alter table checkins enable row level security;
create policy "users manage own checkins" on checkins
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast lookups
create index if not exists favorites_user_id_idx on favorites(user_id);
create index if not exists checkins_user_id_idx on checkins(user_id);
create index if not exists checkins_gym_id_idx on checkins(gym_id);
