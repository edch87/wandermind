-- Migration v4: Discover feed — community layer + Wikidata cache + privacy bundle
-- Run this in the Supabase dashboard → SQL Editor → New query → paste → Run.
--
-- Three parts:
--   1. profiles.share_saves — the opt-OUT toggle for the anonymous community layer
--      (decided 2026-06-04: on by default, clearly visible toggle in Settings).
--   2. get_community_places() — security-definer function that aggregates saves
--      across users into anonymous "Saved by N people" results. RLS on
--      bucket_list_items stays fully strict; this function is the only
--      cross-user read path and it only exposes aggregate-safe fields.
--      A minimum save-count threshold (2 distinct users) prevents inferring
--      any single user's saves near their home.
--   3. discover_cache — shared cache for Wikidata (CC0) discovery results.
--      Wikidata's public-domain licence permits storing and sharing these;
--      HERE and Google data must NEVER be written to this table (ToS).

-- ── 1. Community sharing opt-out ──
alter table profiles
  add column if not exists share_saves boolean not null default true;

-- ── 2. Anonymous community aggregate ──
create or replace function get_community_places(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision default 100
)
returns table (
  place_key text,
  name text,
  latitude double precision,
  longitude double precision,
  category text,
  photo_url text,
  city text,
  country text,
  save_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(
      b.google_place_id,
      nullif(b.osm_id, ''),
      lower(b.name) || '@' || round(b.latitude::numeric, 3) || ',' || round(b.longitude::numeric, 3)
    ) as place_key,
    min(b.name) as name,
    avg(b.latitude) as latitude,
    avg(b.longitude) as longitude,
    mode() within group (order by b.category) as category,
    (array_agg(b.photo_url) filter (where b.photo_url is not null))[1] as photo_url,
    mode() within group (order by b.city) as city,
    mode() within group (order by b.country) as country,
    count(distinct b.user_id) as save_count
  from bucket_list_items b
  join profiles p on p.id = b.user_id
  where coalesce(p.share_saves, true)
    -- haversine distance filter
    and 6371 * 2 * asin(sqrt(
          power(sin(radians(b.latitude - center_lat) / 2), 2) +
          cos(radians(center_lat)) * cos(radians(b.latitude)) *
          power(sin(radians(b.longitude - center_lng) / 2), 2)
        )) <= radius_km
  group by 1
  -- privacy threshold: a place only becomes public once 2+ distinct users saved it
  having count(distinct b.user_id) >= 2
  order by save_count desc
  limit 100;
$$;

-- Only signed-in users may call it (app is invite-only anyway)
revoke all on function get_community_places(double precision, double precision, double precision) from public, anon;
grant execute on function get_community_places(double precision, double precision, double precision) to authenticated;

-- ── 3. Wikidata discover cache (CC0 data only!) ──
create table if not exists discover_cache (
  cell text not null,            -- ~50 km grid cell, e.g. "48.0,11.5"
  category text not null,        -- Lark category the cached query maps to
  results jsonb not null,        -- array of places from the Wikidata query
  fetched_at timestamptz not null default now(),
  primary key (cell, category)
);

alter table discover_cache enable row level security;

-- Any signed-in user can read the shared cache and populate it on a miss.
create policy "discover_cache_select" on discover_cache
  for select to authenticated using (true);
create policy "discover_cache_insert" on discover_cache
  for insert to authenticated with check (true);
create policy "discover_cache_update" on discover_cache
  for update to authenticated using (true);
