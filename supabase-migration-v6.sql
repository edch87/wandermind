-- Migration v6: Detail-page redesign — preferred transport + opening hours TTL
-- Run this in the Supabase dashboard → SQL Editor → New query → paste → Run.
--
-- Two unrelated additions bundled because they ship together with the detail
-- redesign:
--
--  1. profiles.preferred_transport — default transport mode used by the item
--     detail page (one row instead of four), the recommend-flow toggle's
--     initial value, and the Navigate button URL. Walking is intentionally
--     NOT an option — the detail page auto-overrides to walking when
--     walkMinutes ≤ 15. Distinct from the v5 column we dropped: that one
--     stored a single per-item mode at save time, which forced the same mode
--     everywhere. This is display-only — all four per-mode minutes still
--     live on each item, and the recommend toggle is still per-outing.
--
--  2. bucket_list_items.opening_hours_last_refreshed_at — set when we
--     successfully refresh Google opening hours. The detail page reads this
--     on open and triggers a background refresh if older than 30 days (or
--     null). Bounds the Google Pro-tier `regularOpeningHours` call (1,000
--     free/month) to items the user actually opens.

-- ── 1. preferred_transport on profiles ──
alter table profiles
  add column if not exists preferred_transport text default 'car';

-- check constraint added separately so re-running the migration is safe
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preferred_transport_check'
  ) then
    alter table profiles
      add constraint profiles_preferred_transport_check
      check (preferred_transport in ('car', 'transit', 'bike'));
  end if;
end $$;

-- ── 2. opening_hours_last_refreshed_at on bucket_list_items ──
alter table bucket_list_items
  add column if not exists opening_hours_last_refreshed_at timestamptz;

-- Seed the timestamp for items that already have opening hours so they don't
-- all immediately trigger a refresh on first detail-page open. Treat the
-- existing data as freshly-fetched at migration time; the 30-day TTL takes
-- over from there.
update bucket_list_items
   set opening_hours_last_refreshed_at = now()
 where opening_hours is not null
   and opening_hours_last_refreshed_at is null;
