-- Migration v5: Per-mode travel times
-- Run this in the Supabase dashboard → SQL Editor → New query → paste → Run.
--
-- Replaces the single (travel_time_minutes, transport_mode) pair with one
-- column per transport mode (walk, bike, car, transit), all nullable.
-- "null" carries meaning:
--   - transit_minutes IS NULL → no practical transit route (or not yet computed)
--   - walk/bike/car_minutes IS NULL → not yet computed (next save/home-change fills them)
--
-- Why the change: per-outing context (which transport you're using today)
-- moved out of profile into the recommend flow. Storing one mode at save
-- time forced the user's "preferred mode" everywhere; storing all four lets
-- the recommend flow read instantly and switch modes without API calls.
--
-- We KEEP travel_time_minutes and transport_mode for one release as a safety
-- net: storage.ts does a lazy read-side migration (copies the legacy value
-- into the matching mode column on next load). They can be dropped later
-- once all rows have at least one of the new columns populated.
--
-- Also drops profiles.preferred_transport — no longer used.

-- ── 1. Per-mode time columns ──
alter table bucket_list_items
  add column if not exists walk_minutes integer,
  add column if not exists bike_minutes integer,
  add column if not exists car_minutes integer,
  add column if not exists transit_minutes integer;

-- ── 2. One-shot backfill for existing rows ──
-- Copy the legacy travel_time_minutes into whichever new column matches the
-- old transport_mode. Other modes stay NULL until next save/home-change.
update bucket_list_items
   set walk_minutes = travel_time_minutes
 where walk_minutes is null
   and transport_mode = 'walk'
   and travel_time_minutes is not null;

update bucket_list_items
   set bike_minutes = travel_time_minutes
 where bike_minutes is null
   and transport_mode = 'bike'
   and travel_time_minutes is not null;

update bucket_list_items
   set car_minutes = travel_time_minutes
 where car_minutes is null
   and transport_mode = 'car'
   and travel_time_minutes is not null;

update bucket_list_items
   set transit_minutes = travel_time_minutes
 where transit_minutes is null
   and transport_mode = 'transit'
   and travel_time_minutes is not null;

-- ── 3. Drop preferred_transport from profiles (no longer used) ──
alter table profiles
  drop column if exists preferred_transport;

-- Note: travel_time_minutes and transport_mode columns are intentionally left
-- in place for this release. They can be dropped in a future migration once
-- you're confident every row has at least one of the new *_minutes columns.
