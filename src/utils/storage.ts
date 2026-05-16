import { supabase } from './supabase';
import type { UserProfile, BucketListItem } from '../types';

// ── Legacy category migration map ──
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  mountain_hiking: 'hiking_trails',
  sport_adventure: 'active_adventure',
  religious_spiritual: 'historical',
  city_exploration: 'neighbourhood_walks',
  shopping: 'food_drink',   // markets → food_drink; malls → entertainment would also work
  other: 'neighbourhood_walks',
};

function migrateCategory(raw: string): string {
  return LEGACY_CATEGORY_MAP[raw] || raw;
}

// ── Helpers: convert between camelCase (app) and snake_case (database) ──

function profileFromDb(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    displayName: (row.display_name as string) || '',
    homeLatitude: (row.home_latitude as number) || 0,
    homeLongitude: (row.home_longitude as number) || 0,
    homeAddress: (row.home_address as string) || '',
    preferredTransport: (row.preferred_transport as UserProfile['preferredTransport']) || 'car',
    hasDog: (row.has_dog as boolean) || false,
    hasKids: (row.has_kids as boolean) || false,
    needsAccessibility: (row.needs_accessibility as boolean) || false,
    onboardingComplete: (row.onboarding_complete as boolean) || false,
  };
}

function profileToDb(profile: UserProfile) {
  return {
    id: profile.id,
    display_name: profile.displayName,
    home_latitude: profile.homeLatitude,
    home_longitude: profile.homeLongitude,
    home_address: profile.homeAddress,
    preferred_transport: profile.preferredTransport,
    has_dog: profile.hasDog,
    has_kids: profile.hasKids,
    needs_accessibility: profile.needsAccessibility,
    onboarding_complete: profile.onboardingComplete,
    updated_at: new Date().toISOString(),
  };
}

function itemFromDb(row: Record<string, unknown>): BucketListItem {
  return {
    id: row.id as string,
    status: (row.status as BucketListItem['status']) || 'want_to_do',
    createdAt: (row.created_at as string) || new Date().toISOString(),
    completedAt: row.completed_at as string | undefined,
    name: (row.name as string) || '',
    description: row.description as string | undefined,
    latitude: (row.latitude as number) || 0,
    longitude: (row.longitude as number) || 0,
    osmId: row.osm_id as string | undefined,
    osmTags: (row.osm_tags as Record<string, string>) || {},
    photoUrl: row.photo_url as string | undefined,
    address: (row.address as string) || '',
    country: row.country as string | undefined,
    region: row.region as string | undefined,
    city: row.city as string | undefined,
    openingHours: row.opening_hours as string | undefined,
    travelTimeMinutes: (row.travel_time_minutes as number) || 0,
    travelDistanceKm: (row.travel_distance_km as number) || 0,
    transportMode: (row.transport_mode as BucketListItem['transportMode']) || 'car',
    category: migrateCategory((row.category as string) || 'neighbourhood_walks') as BucketListItem['category'],
    setting: (row.setting as BucketListItem['setting']) || 'mixed',
    weatherSuitability: (row.weather_suitability as BucketListItem['weatherSuitability']) || 'any',
    durationEstimate: (row.duration_estimate as BucketListItem['durationEstimate']) || '1_2h',
    costLevel: (row.cost_level as BucketListItem['costLevel']) || 'moderate',
    specificCost: row.specific_cost as number | undefined,
    bestSeasons: (row.best_seasons as BucketListItem['bestSeasons']) || (row.best_season ? [row.best_season as string] : ['any']),
    bestTimesOfDay: (row.best_times_of_day as BucketListItem['bestTimesOfDay']) || (row.best_time_of_day ? [row.best_time_of_day as string] : ['any']),
    groupSuitability: (row.group_suitability as BucketListItem['groupSuitability']) || [],
    dogFriendly: row.dog_friendly as boolean | undefined,
    wheelchairAccessible: row.wheelchair_accessible as boolean | undefined,
    strollerFriendly: row.stroller_friendly as boolean | undefined,
    personalNotes: row.personal_notes as string | undefined,
    priority: (row.priority as BucketListItem['priority']) || 'medium',
    tags: (row.tags as string[]) || [],
    url: row.url as string | undefined,
    completionRating: row.completion_rating as number | undefined,
    completionPhotoUrl: row.completion_photo_url as string | undefined,
    completionNotes: row.completion_notes as string | undefined,
  };
}

function itemToDb(item: BucketListItem, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    status: item.status,
    created_at: item.createdAt,
    completed_at: item.completedAt || null,
    name: item.name,
    description: item.description || null,
    latitude: item.latitude,
    longitude: item.longitude,
    osm_id: item.osmId || null,
    osm_tags: item.osmTags || {},
    photo_url: item.photoUrl || null,
    address: item.address,
    country: item.country || null,
    region: item.region || null,
    city: item.city || null,
    opening_hours: item.openingHours || null,
    travel_time_minutes: item.travelTimeMinutes,
    travel_distance_km: item.travelDistanceKm,
    transport_mode: item.transportMode,
    category: item.category,
    setting: item.setting,
    weather_suitability: item.weatherSuitability,
    duration_estimate: item.durationEstimate,
    cost_level: item.costLevel,
    specific_cost: item.specificCost ?? null,
    best_seasons: item.bestSeasons,
    best_times_of_day: item.bestTimesOfDay,
    group_suitability: item.groupSuitability,
    dog_friendly: item.dogFriendly ?? null,
    wheelchair_accessible: item.wheelchairAccessible ?? null,
    stroller_friendly: item.strollerFriendly ?? null,
    personal_notes: item.personalNotes || null,
    priority: item.priority,
    tags: item.tags || [],
    url: item.url || null,
    completion_rating: item.completionRating ?? null,
    completion_photo_url: item.completionPhotoUrl || null,
    completion_notes: item.completionNotes || null,
  };
}

// ── Profile operations ──

export async function getProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  return profileFromDb(data);
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const dbProfile = profileToDb({ ...profile, id: user.id });
  await supabase.from('profiles').upsert(dbProfile);
}

// ── Item operations ──

export async function getItems(): Promise<BucketListItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('bucket_list_items')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map((row: Record<string, unknown>) => itemFromDb(row));
}

export async function saveItem(item: BucketListItem): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const dbItem = itemToDb(item, user.id);
  await supabase.from('bucket_list_items').upsert(dbItem);
}

export async function deleteItem(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('bucket_list_items').delete().eq('id', id).eq('user_id', user.id);
}

export function generateId(): string {
  return crypto.randomUUID();
}
