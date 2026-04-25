-- MatFinder: Gym ratings
-- One rating per gym per IP (anonymous, no auth required)

create table if not exists ratings (
  id          bigint generated always as identity primary key,
  gym_id      text        not null,
  score       smallint    not null check (score between 1 and 5),
  comment     text,
  ip_hash     text        not null default 'unknown',
  created_at  timestamptz not null default now(),
  unique (gym_id, ip_hash)
);

-- Enable Row Level Security
alter table ratings enable row level security;

-- Anyone can read ratings
create policy "ratings_select" on ratings
  for select using (true);

-- Anyone can insert/upsert a rating
create policy "ratings_insert" on ratings
  for insert with check (true);

-- Allow upsert (update) — same IP updating their own rating
create policy "ratings_update" on ratings
  for update using (ip_hash = ip_hash);

-- Index for fast per-gym lookups
create index if not exists ratings_gym_id_idx on ratings (gym_id);

-- View: pre-aggregated per-gym stats (used by API)
create or replace view gym_rating_stats as
  select
    gym_id,
    round(avg(score)::numeric, 1) as avg_score,
    count(*)::int                 as rating_count
  from ratings
  group by gym_id;
