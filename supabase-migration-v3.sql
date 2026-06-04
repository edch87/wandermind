-- Migration v3: Google Places hybrid integration
-- Run this in the Supabase dashboard → SQL Editor → New query → paste → Run.
--
-- Adds the google_place_id column. Per Google's Terms of Service this is the
-- ONLY Google data we persist: photo references and photo URLs expire and must
-- be fetched fresh at display time, never stored.

alter table bucket_list_items
  add column if not exists google_place_id text;
