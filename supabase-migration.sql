-- WanderMind Supabase Migration
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null default '',
  home_latitude double precision not null default 0,
  home_longitude double precision not null default 0,
  home_address text not null default '',
  preferred_transport text not null default 'car',
  has_dog boolean not null default false,
  has_kids boolean not null default false,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bucket list items
create table public.bucket_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'want_to_do',
  created_at timestamptz not null default now(),
  completed_at timestamptz,

  -- Place data
  name text not null,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  osm_id text,
  osm_tags jsonb default '{}',
  photo_url text,
  address text not null default '',
  country text,
  region text,
  city text,
  opening_hours text,

  -- Travel data
  travel_time_minutes integer not null default 0,
  travel_distance_km double precision not null default 0,
  transport_mode text not null default 'car',

  -- Smart defaults
  category text not null default 'other',
  setting text not null default 'mixed',
  weather_suitability text not null default 'any',
  duration_estimate text not null default '1_2h',
  cost_level text not null default 'moderate',
  specific_cost double precision,
  best_season text not null default 'any',
  best_time_of_day text not null default 'any',
  group_suitability text[] not null default '{}',
  dog_friendly boolean,
  wheelchair_accessible boolean,
  stroller_friendly boolean,

  -- User additions
  personal_notes text,
  priority text not null default 'medium',
  tags text[] default '{}',
  url text,
  completion_rating integer,
  completion_photo_url text,
  completion_notes text
);

-- Row Level Security: users can only see/edit their own data
alter table public.profiles enable row level security;
alter table public.bucket_list_items enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can view own items"
  on public.bucket_list_items for select using (auth.uid() = user_id);

create policy "Users can insert own items"
  on public.bucket_list_items for insert with check (auth.uid() = user_id);

create policy "Users can update own items"
  on public.bucket_list_items for update using (auth.uid() = user_id);

create policy "Users can delete own items"
  on public.bucket_list_items for delete using (auth.uid() = user_id);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Index for faster queries
create index idx_items_user_id on public.bucket_list_items(user_id);
create index idx_items_status on public.bucket_list_items(user_id, status);
