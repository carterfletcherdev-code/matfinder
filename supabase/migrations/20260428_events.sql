-- Events table — anonymous aggregate analytics for gym cards.
--
-- Captured event types:
--   card_open        — gym card was expanded (selected) in a list / overlay
--   pin_tap          — gym pin was clicked on the map
--   ig_click         — Instagram pill was clicked on a gym card
--   directions_click — "Get Directions" pill was clicked on a gym card
--
-- Each row is a single fire-and-forget event. We keep user_id so we can
-- de-dupe ("same user opened the card 14 times in 60s" counts as one
-- event when aggregating); for logged-out users this is null.
--
-- Designed for inserts at scale (every card open, every pin tap), so
-- we keep the schema lean — no event payloads, no nested JSON.

create table if not exists public.events (
  id           bigserial primary key,
  event_type   text        not null,
  gym_id       text        not null,
  user_id      uuid        null references auth.users(id) on delete set null,
  occurred_at  timestamptz not null default now()
);

-- Lookups will almost always be by (gym_id, event_type, occurred_at) for
-- the eventual owner-analytics dashboard. Composite index covers it.
create index if not exists events_gym_type_time_idx
  on public.events (gym_id, event_type, occurred_at desc);

-- Row-level security:
--   * INSERT  — anyone (anonymous + authenticated). We're collecting
--               anonymous aggregate signal; gating writes would tank
--               coverage. The sensitive fields (user_id) are derived
--               server-side from the session, so users can't spoof other
--               users' actions.
--   * SELECT  — disabled at the table level. Owners read aggregates
--               through a server route that uses the service-role key.
alter table public.events enable row level security;

drop policy if exists "events_insert_anon" on public.events;
create policy "events_insert_anon"
  on public.events for insert
  to anon, authenticated
  with check (true);

-- No SELECT policy → readers without service-role key get zero rows.
-- Owner analytics will go through a route that uses SUPABASE_SERVICE_ROLE_KEY.
