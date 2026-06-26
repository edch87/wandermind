import { supabase } from './supabase';
import type { UserProfile, BucketListItem, PreferredTransport } from '../types';

// ── Legacy category migration map ──
// Lazy read-side migration. Older categories from before the 2026-06-24 recommend-flow pass
// get rewritten here so existing items continue to score correctly. New saves go in
// with the current taxonomy and skip this map entirely.
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  // Pre-2026 first-pass legacy
  mountain_hiking: 'nature_landscape',
  sport_adventure: 'active',
  religious_spiritual: 'religious_site',
  city_exploration: 'neighbourhood_walks',
  // 2026-06-24 pass: category taxonomy rationalisation
  active_adventure: 'active',
  hiking_trails: 'nature_landscape',  // paired with a 'hiking' tag injection — see itemFromDb
  event_festival: 'other',             // no items affected per audit; safety map only
};

function migrateCategory(raw: string): string {
  return LEGACY_CATEGORY_MAP[raw] || raw;
}

/** Strip the dropped `family` group value from legacy items (2026-06-24 pass).
 *  Per-outing context — the "With kids" chip in the recommend flow now carries
 *  the family-outing intent. */
function migrateGroupSuitability(raw: unknown): import('../types').GroupType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((g): g is import('../types').GroupType =>
    g === 'solo' || g === 'couple' || g === 'friends' || g === 'kids'
  );
}

/** Inject a `hiking` tag when the legacy category was hiking_trails so that the
 *  engine's tag-based hiking signal (effort, keep_it_easy penalty, active vibe boost)
 *  still fires for those items after the category rewrite. */
function migrateTags(raw: unknown, legacyCategory: string): string[] {
  const arr = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [];
  if (legacyCategory === 'hiking_trails' && !arr.includes('hiking')) arr.push('hiking');
  return arr;
}

/**
 * Round home coordinates to 3 decimal places before persisting. At Munich's
 * latitude (~48°N) this is roughly a 111m × 74m grid cell with ~65m worst-case
 * displacement from the true location — enough to obscure an exact address
 * while keeping travel-time and "close to home" calculations accurate.
 *
 * The in-session value used for map rendering is *not* rounded; only what we
 * write to the database is.
 */
function roundForPrivacy(coord: number): number {
  return Math.round(coord * 1000) / 1000;
}

/** See itemFromDb — coerces stale 0 transit_minutes to null. */
function normalizeTransit(v: number | null): number | null {
  return v === 0 ? null : v;
}

// ── Helpers: convert between camelCase (app) and snake_case (database) ──

/** Coerce a raw value to a valid PreferredTransport, falling back to 'car'.
 *  Walking is intentionally excluded — the detail page auto-overrides to walking
 *  when walkMinutes ≤ 15, so it's never a stored default. */
function readPreferredTransport(raw: unknown): PreferredTransport {
  return raw === 'transit' || raw === 'bike' ? raw : 'car';
}

function profileFromDb(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    displayName: (row.display_name as string) || '',
    homeLatitude: (row.home_latitude as number) || 0,
    homeLongitude: (row.home_longitude as number) || 0,
    homeAddress: (row.home_address as string) || '',
    hasDog: (row.has_dog as boolean) || false,
    hasKids: (row.has_kids as boolean) || false,
    needsAccessibility: (row.needs_accessibility as boolean) || false,
    onboardingComplete: (row.onboarding_complete as boolean) || false,
    shareSaves: row.share_saves !== false, // default true (opt-out)
    preferredTransport: readPreferredTransport(row.preferred_transport),
  };
}

function profileToDb(profile: UserProfile) {
  return {
    id: profile.id,
    display_name: profile.displayName,
    home_latitude: roundForPrivacy(profile.homeLatitude),
    home_longitude: roundForPrivacy(profile.homeLongitude),
    home_address: profile.homeAddress,
    has_dog: profile.hasDog,
    has_kids: profile.hasKids,
    needs_accessibility: profile.needsAccessibility,
    onboarding_complete: profile.onboardingComplete,
    share_saves: profile.shareSaves !== false,
    preferred_transport: profile.preferredTransport || 'car',
    updated_at: new Date().toISOString(),
  };
}

function itemFromDb(row: Record<string, unknown>): BucketListItem {
  // Lazy migration: rows saved before the per-mode split have travel_time_minutes
  // populated and transport_mode set. Copy the legacy value into the matching
  // new field so existing items don't show as "unknown" for their original mode.
  // The other 3 modes stay null until the next save / home-change / refresh.
  const legacyMinutes = row.travel_time_minutes as number | null | undefined;
  const legacyMode = row.transport_mode as string | undefined;
  const seedLegacy = (mode: string) =>
    legacyMode === mode && legacyMinutes != null ? legacyMinutes : null;

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
    googlePlaceId: row.google_place_id as string | undefined,
    osmTags: (row.osm_tags as Record<string, string>) || {},
    photoUrl: row.photo_url as string | undefined,
    address: (row.address as string) || '',
    country: row.country as string | undefined,
    region: row.region as string | undefined,
    city: row.city as string | undefined,
    openingHours: row.opening_hours as string | undefined,
    openingHoursLastRefreshedAt: row.opening_hours_last_refreshed_at as string | undefined,
    travelDistanceKm: (row.travel_distance_km as number) || 0,
    walkMinutes: (row.walk_minutes as number | null) ?? seedLegacy('walk'),
    bikeMinutes: (row.bike_minutes as number | null) ?? seedLegacy('bike'),
    carMinutes: (row.car_minutes as number | null) ?? seedLegacy('car'),
    // Stale 0 values from the original broken refresh (before HERE Transit's
    // return=travelSummary fix landed) are coerced to null on read so the UI
    // shows "Not practical by transit" instead of a misleading "0 min".
    // Real transit between distinct points is never 0 — see api.ts.
    transitMinutes: normalizeTransit((row.transit_minutes as number | null) ?? seedLegacy('transit')),
    category: migrateCategory((row.category as string) || 'neighbourhood_walks') as BucketListItem['category'],
    // Hold the raw value so the tags-migration can inject `hiking` for ex-hiking_trails items.
    setting: (row.setting as BucketListItem['setting']) || 'mixed',
    weatherSuitability: (row.weather_suitability as BucketListItem['weatherSuitability']) || 'any',
    durationEstimate: (row.duration_estimate as BucketListItem['durationEstimate']) || '1_2h',
    costLevel: (row.cost_level as BucketListItem['costLevel']) || 'moderate',
    specificCost: row.specific_cost as number | undefined,
    bestSeasons: (row.best_seasons as BucketListItem['bestSeasons']) || (row.best_season ? [row.best_season as string] : ['any']),
    bestTimesOfDay: (row.best_times_of_day as BucketListItem['bestTimesOfDay']) || (row.best_time_of_day ? [row.best_time_of_day as string] : ['any']),
    groupSuitability: migrateGroupSuitability(row.group_suitability),
    dogFriendly: row.dog_friendly as boolean | undefined,
    wheelchairAccessible: row.wheelchair_accessible as boolean | undefined,
    strollerFriendly: row.stroller_friendly as boolean | undefined,
    personalNotes: row.personal_notes as string | undefined,
    priority: (row.priority as BucketListItem['priority']) || 'medium',
    tags: migrateTags(row.tags, (row.category as string) || ''),
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
    google_place_id: item.googlePlaceId || null,
    osm_tags: item.osmTags || {},
    photo_url: item.photoUrl || null,
    address: item.address,
    country: item.country || null,
    region: item.region || null,
    city: item.city || null,
    opening_hours: item.openingHours || null,
    opening_hours_last_refreshed_at: item.openingHoursLastRefreshedAt || null,
    travel_distance_km: item.travelDistanceKm,
    walk_minutes: item.walkMinutes,
    bike_minutes: item.bikeMinutes,
    car_minutes: item.carMinutes,
    transit_minutes: item.transitMinutes,
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

/** Returns true when the item was actually written to the database. */
export async function saveItem(item: BucketListItem): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const dbItem = itemToDb(item, user.id);
  const { error } = await supabase.from('bucket_list_items').upsert(dbItem);
  if (error) console.error('saveItem failed:', error.message);
  return !error;
}

/**
 * Batch upsert. Used by onboarding's seed-from-discover step so a user can
 * land on the dashboard with a list already populated. Returns the count
 * actually written.
 */
export async function saveItems(items: BucketListItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const dbItems = items.map(item => itemToDb(item, user.id));
  const { error } = await supabase.from('bucket_list_items').upsert(dbItems);
  if (error) {
    console.error('saveItems failed:', error.message);
    return 0;
  }
  return items.length;
}

export async function deleteItem(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('bucket_list_items').delete().eq('id', id).eq('user_id', user.id);
}

export function generateId(): string {
  return crypto.randomUUID();
}
