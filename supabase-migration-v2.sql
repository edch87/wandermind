-- Migration v2: Add accessibility, multi-select seasons & times of day
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/ihizwxytvlfsvakzrqck/sql)

-- 1. Add needs_accessibility to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS needs_accessibility boolean DEFAULT false;

-- 2. Add best_seasons array column to bucket_list_items
ALTER TABLE bucket_list_items
ADD COLUMN IF NOT EXISTS best_seasons text[] DEFAULT '{}';

-- 3. Add best_times_of_day array column to bucket_list_items
ALTER TABLE bucket_list_items
ADD COLUMN IF NOT EXISTS best_times_of_day text[] DEFAULT '{}';

-- 4. Migrate existing single-value data into the new array columns
-- (only runs if you had the old best_season / best_time_of_day columns)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bucket_list_items' AND column_name = 'best_season'
  ) THEN
    UPDATE bucket_list_items
    SET best_seasons = ARRAY[best_season]
    WHERE best_season IS NOT NULL AND best_season != ''
      AND (best_seasons IS NULL OR best_seasons = '{}');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bucket_list_items' AND column_name = 'best_time_of_day'
  ) THEN
    UPDATE bucket_list_items
    SET best_times_of_day = ARRAY[best_time_of_day]
    WHERE best_time_of_day IS NOT NULL AND best_time_of_day != ''
      AND (best_times_of_day IS NULL OR best_times_of_day = '{}');
  END IF;
END $$;
