export type Category =
  | 'museum_gallery' | 'historical' | 'religious_site' | 'nature_landscape'
  | 'park_garden' | 'neighbourhood_walks' | 'beach_water' | 'active'
  | 'food_drink' | 'nightlife' | 'theatre_concert' | 'amusement_park'
  | 'entertainment' | 'zoo_aquarium' | 'wellness' | 'shopping' | 'other';

export type Setting = 'indoor' | 'outdoor' | 'mixed';
export type WeatherSuitability = 'any' | 'good_weather' | 'bad_weather_ideal';
export type DurationEstimate = 'under_1h' | '1_2h' | '2_3h' | 'half_day' | 'full_day';
export type CostLevel = 'free' | 'cheap' | 'moderate' | 'expensive';
export type Season = 'any' | 'spring' | 'summer' | 'autumn' | 'winter';
export type TimeOfDay = 'any' | 'morning' | 'afternoon' | 'evening';
/** `family` was removed in the 2026-06-24 recommend-flow pass — the "With kids" chip
 *  carries that intent now; storage.ts strips `family` from legacy items on read. */
export type GroupType = 'solo' | 'couple' | 'friends' | 'kids';
export type TransportMode = 'car' | 'bike' | 'transit' | 'walk';
export type Priority = 'low' | 'medium' | 'high';
/** `surprise_me` was removed in the 2026-06-24 pass — the dedicated "Or just surprise me"
 *  button on the recommend form sets `surpriseMe: true` on constraints instead. */
export type EnergyLevel = 'up_for_anything' | 'got_some_energy' | 'keep_it_easy';
export type Vibe = 'flexible' | 'foodie' | 'curious' | 'active' | 'outdoorsy' | 'playful' | 'unwind' | 'explore';
export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy';

/** Editorial "what's special about this place" tags. User-driven only — never
 *  inferred from HERE/Google data. The engine reads them for scoring (vibe boosts,
 *  weather/season overrides, keep_it_easy hiking penalty). Defined as a closed
 *  enum so the recommend engine can treat them as a controlled vocabulary. */
export type Tag =
  | 'viewpoint' | 'hiking' | 'cycling' | 'water_sports' | 'winter_sports'
  | 'picnicking' | 'market' | 'outdoor_seating' | 'live_music' | 'late_night'
  | 'sauna' | 'class' | 'tour';

/** User's default transport mode for display defaults (item detail mode shown,
 *  recommend-flow toggle initial value, Navigate button URL). Walking is NOT
 *  an option — it's auto-derived on the detail page when walkMinutes ≤ 15.
 *  Distinct from the dropped UserProfile.preferredTransport in v5: that field
 *  stored a single per-item mode at save time, which forced the same mode
 *  everywhere. This is display-only — all four travel-time fields stay on
 *  each item, and the recommend flow toggle is still overridable per outing. */
export type PreferredTransport = 'car' | 'transit' | 'bike';

export interface UserProfile {
  id: string;
  displayName: string;
  homeLatitude: number;
  homeLongitude: number;
  homeAddress: string;
  hasDog: boolean;
  hasKids: boolean;
  needsAccessibility: boolean;
  onboardingComplete: boolean;
  /** Community layer opt-out: when true (default) the user's saves feed the
   *  anonymous discover aggregate ("Saved by N people" — never who). */
  shareSaves?: boolean;
  /** Default transport mode for the item detail page, the recommend-flow
   *  toggle's initial value, and the Navigate button. Defaults to 'car' when
   *  unset; no onboarding prompt. */
  preferredTransport?: PreferredTransport;
}

export interface BucketListItem {
  id: string;
  status: 'want_to_do' | 'done';
  createdAt: string;
  completedAt?: string;

  // Source data
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  osmId?: string;   // HERE place ID (legacy field name; DB column osm_id retained)
  googlePlaceId?: string;   // Google place_id — the ONLY Google data we persist (ToS); photos fetched fresh at display time
  osmTags?: Record<string, string>;   // HERE-derived tags (legacy field name; DB column osm_tags retained)
  photoUrl?: string;
  address: string;
  country?: string;
  region?: string;
  city?: string;
  openingHours?: string;
  /** ISO timestamp of the last successful Google opening-hours refresh.
   *  Read on the detail page: if older than 30 days (or null), trigger a
   *  background refresh. Bounds the Google Pro-tier `regularOpeningHours`
   *  call to viewed items only (1,000 free/month). */
  openingHoursLastRefreshedAt?: string;

  // Travel data
  travelDistanceKm: number;
  /** One-way travel time in minutes per mode. Computed at save time, refreshed
   *  when home location changes. null = no practical route (e.g. transit) or
   *  not yet computed for legacy items. */
  walkMinutes: number | null;
  bikeMinutes: number | null;
  carMinutes: number | null;
  /** Off-peak weekday (next-upcoming Tuesday 10:30am local) — see api.ts */
  transitMinutes: number | null;

  // Smart defaults (inferred, editable)
  category: Category;
  setting: Setting;
  weatherSuitability: WeatherSuitability;
  durationEstimate: DurationEstimate;
  costLevel: CostLevel;
  specificCost?: number;
  bestSeasons: Season[];
  bestTimesOfDay: TimeOfDay[];
  groupSuitability: GroupType[];
  dogFriendly?: boolean;
  wheelchairAccessible?: boolean;
  strollerFriendly?: boolean;

  // User additions
  personalNotes?: string;
  priority: Priority;
  /** Editorial tags from the controlled `Tag` vocabulary. Stored as string[] for
   *  forward-compat with the v2 personal-tags layer (free-text user tags); the
   *  engine only reads values it recognises in the `Tag` enum. */
  tags?: string[];
  url?: string;
  completionRating?: number;
  completionPhotoUrl?: string;
  completionNotes?: string;
}

export interface RecommendationConstraints {
  date: string;
  /** Time-of-day slots the user is available in. Multi-select: morning, afternoon,
   *  and/or evening. Pre-filled from getRemainingSlotsToday() for today and all
   *  three for tomorrow. Items with bestTimesOfDay must overlap (or be 'any'/empty
   *  to pass through). Replaces the old today-only auto-slot filter. */
  selectedSlots: TimeOfDay[];
  timeAvailableMinutes: number;
  /** Minimum time filter — only show activities that need at least this many minutes */
  timeMinMinutes?: number;
  groupTypes: GroupType[];
  energy: EnergyLevel;
  vibes: Vibe[];
  maxCostLevel: CostLevel;
  travelFrom: 'home' | 'current';
  currentLatitude?: number;
  currentLongitude?: number;
  /** All transport modes the user is open to. Effective travel time = min across these. */
  transportModes: TransportMode[];
  dogComing: boolean;
  needsAccessibility: boolean;
  strollerNeeded: boolean;
  /** Item IDs to soft-penalise (recently shown or in-session "show different"). */
  suppressedIds?: string[];
  /** Set true by the dedicated "Or just surprise me" button. Engine skips Q5/Q6
   *  filtering (using up_for_anything + flexible defaults) and applies the
   *  weighted-random top-of-list shuffle. */
  surpriseMe?: boolean;
}

export interface WeatherForecast {
  date: string;
  weatherCode: number;
  weatherType: WeatherType;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  description: string;
}

export interface ScoredItem {
  item: BucketListItem;
  score: number;
  reasons: string[];
}

export interface HereSearchResult {
  id: string;
  /** Set when the result came from Google Places — `categories` then holds Google place types. */
  googlePlaceId?: string;
  title: string;
  address: {
    label: string;
    city?: string;
    state?: string;
    country?: string;
    countryCode?: string;
  };
  position: {
    lat: number;
    lng: number;
  };
  categories?: { id: string; name: string }[];
  openingHours?: string;
}

/** @deprecated — kept for backward compatibility with old imports */

export const CATEGORY_INFO: Record<Category, { label: string; icon: string; color: string }> = {
  museum_gallery:      { label: 'Museum & Gallery',          icon: 'Landmark',      color: '#7c3aed' },
  historical:          { label: 'Historical',                icon: 'Castle',        color: '#92400e' },
  religious_site:      { label: 'Religious site',            icon: 'Church',        color: '#a16207' },
  nature_landscape:    { label: 'Nature & Landscape',        icon: 'Mountain',      color: '#059669' },
  park_garden:         { label: 'Park & Garden',             icon: 'TreePine',      color: '#16a34a' },
  neighbourhood_walks: { label: 'Neighbourhood & City Walks',icon: 'Building2',     color: '#64748b' },
  beach_water:         { label: 'Lakes & Water',             icon: 'Waves',         color: '#0284c7' },
  active:              { label: 'Active',                    icon: 'Flame',         color: '#dc2626' },
  food_drink:          { label: 'Food & Drink',              icon: 'UtensilsCrossed', color: '#ea580c' },
  nightlife:           { label: 'Nightlife',                 icon: 'Martini',       color: '#9d174d' },
  theatre_concert:     { label: 'Theatre & Concert',         icon: 'MicVocal',      color: '#7e22ce' },
  amusement_park:      { label: 'Amusement & Water Parks',   icon: 'FerrisWheel',   color: '#0891b2' },
  entertainment:       { label: 'Entertainment',             icon: 'Ticket',        color: '#c026d3' },
  zoo_aquarium:        { label: 'Zoo & Aquarium',            icon: 'PawPrint',      color: '#65a30d' },
  wellness:            { label: 'Wellness',                  icon: 'Heart',         color: '#0d9488' },
  shopping:            { label: 'Shopping',                  icon: 'ShoppingBag',   color: '#be185d' },
  other:               { label: 'Other',                     icon: 'DotsThree',     color: '#737373' },
};

/** Tag metadata. `eligibleCategories` is a UI-scoping rule — the AddPlace/ItemDetail
 *  chip pickers only show tags whose eligibility includes the item's category (the
 *  `other` category is treated as eligible for everything via `isTagEligible`).
 *  The engine reads tags regardless of eligibility. Text-only UI at v1 (no icons). */
export const TAG_INFO: Record<Tag, { label: string; eligibleCategories: Category[] }> = {
  viewpoint:       { label: 'Viewpoint',       eligibleCategories: ['nature_landscape', 'historical', 'religious_site', 'neighbourhood_walks'] },
  hiking:          { label: 'Hiking',          eligibleCategories: ['nature_landscape', 'park_garden'] },
  cycling:         { label: 'Cycling',         eligibleCategories: ['nature_landscape', 'park_garden', 'beach_water', 'neighbourhood_walks'] },
  water_sports:    { label: 'Water sports',    eligibleCategories: ['beach_water', 'nature_landscape', 'park_garden'] },
  winter_sports:   { label: 'Winter sports',   eligibleCategories: ['nature_landscape', 'active'] },
  picnicking:      { label: 'Picnicking',      eligibleCategories: ['park_garden', 'nature_landscape', 'beach_water'] },
  market:          { label: 'Market',          eligibleCategories: ['food_drink', 'neighbourhood_walks', 'shopping'] },
  outdoor_seating: { label: 'Outdoor seating', eligibleCategories: ['food_drink', 'nightlife'] },
  live_music:      { label: 'Live music',      eligibleCategories: ['nightlife', 'food_drink', 'theatre_concert'] },
  late_night:      { label: 'Late night',      eligibleCategories: ['food_drink', 'nightlife', 'entertainment'] },
  sauna:           { label: 'Sauna',           eligibleCategories: ['wellness'] },
  class:           { label: 'Class',           eligibleCategories: ['food_drink', 'wellness', 'active', 'entertainment'] },
  tour:            { label: 'Tour',            eligibleCategories: ['food_drink', 'historical', 'neighbourhood_walks', 'museum_gallery', 'nature_landscape', 'religious_site'] },
};

export const TAGS: Tag[] = Object.keys(TAG_INFO) as Tag[];

/** Which tags can be shown for a given category. `other` is the catch-all
 *  — all tags are eligible there since the category itself signals nothing. */
export function tagsEligibleForCategory(category: Category): Tag[] {
  if (category === 'other') return TAGS;
  return TAGS.filter(t => TAG_INFO[t].eligibleCategories.includes(category));
}

/** Max tags per item — soft cap enforced in the UI, not the type system. */
export const TAG_SOFT_CAP = 5;

export const DURATION_LABELS: Record<DurationEstimate, string> = {
  under_1h: '< 1 hour',
  '1_2h': '1-2 hours',
  '2_3h': '2-3 hours',
  half_day: 'Half day',
  full_day: 'Full day',
};

export const COST_LABELS: Record<CostLevel, string> = {
  free: 'Free',
  cheap: 'Cheap',
  moderate: 'Moderate',
  expensive: 'Expensive',
};

export const SEASON_LABELS: Record<Season, string> = {
  any: 'Any season',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  any: 'Any time',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** Display labels for the vibe vocabulary. RecommendationFlow currently inlines
 *  its own labels alongside icons; this map is the canonical source for surfaces
 *  (like BucketList filters) that only need the text. */
export const VIBE_LABELS: Record<Vibe, string> = {
  flexible: 'Open to anything',
  foodie: 'Foodie',
  curious: 'Curious',
  active: 'Active',
  outdoorsy: 'Outdoorsy',
  playful: 'Playful',
  unwind: 'Unwind',
  explore: 'Explore',
};

// Format travel duration nicely: 45 min, 1hr 30mins, 2hrs 15mins
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs}hr${hrs > 1 ? 's' : ''}`;
  return `${hrs}hr${hrs > 1 ? 's' : ''} ${mins}min${mins > 1 ? 's' : ''}`;
}
