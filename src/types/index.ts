export type Category =
  | 'museum_gallery' | 'historical' | 'nature_landscape' | 'park_garden'
  | 'hiking_trails' | 'beach_water' | 'active_adventure' | 'food_drink'
  | 'entertainment' | 'wellness' | 'zoo_aquarium' | 'event_festival'
  | 'neighbourhood_walks';

export type Setting = 'indoor' | 'outdoor' | 'mixed';
export type WeatherSuitability = 'any' | 'good_weather' | 'bad_weather_ideal';
export type DurationEstimate = 'under_1h' | '1_2h' | '2_3h' | 'half_day' | 'full_day';
export type CostLevel = 'free' | 'cheap' | 'moderate' | 'expensive';
export type Season = 'any' | 'spring' | 'summer' | 'autumn' | 'winter';
export type TimeOfDay = 'any' | 'morning' | 'afternoon' | 'evening';
export type GroupType = 'solo' | 'couple' | 'friends' | 'family' | 'kids';
export type TransportMode = 'car' | 'bike' | 'transit' | 'walk';
export type Priority = 'low' | 'medium' | 'high';
export type EnergyLevel = 'surprise_me' | 'up_for_anything' | 'got_some_energy' | 'keep_it_easy';
export type Vibe = 'flexible' | 'foodie' | 'curious' | 'outdoorsy' | 'playful' | 'unwind' | 'explore';
export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy';

export interface UserProfile {
  id: string;
  displayName: string;
  homeLatitude: number;
  homeLongitude: number;
  homeAddress: string;
  preferredTransport: TransportMode;
  hasDog: boolean;
  hasKids: boolean;
  needsAccessibility: boolean;
  onboardingComplete: boolean;
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
  osmId?: string;
  osmTags?: Record<string, string>;
  photoUrl?: string;
  address: string;
  country?: string;
  region?: string;
  city?: string;
  openingHours?: string;

  // Travel data
  travelTimeMinutes: number;
  travelDistanceKm: number;
  transportMode: TransportMode;

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
  tags?: string[];
  url?: string;
  completionRating?: number;
  completionPhotoUrl?: string;
  completionNotes?: string;
}

export interface RecommendationConstraints {
  date: string;
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
  transportMode: TransportMode;
  dogComing: boolean;
  needsAccessibility: boolean;
  strollerNeeded: boolean;
  /** Override travel times per item (itemId → minutes one-way). Used for dynamic OSRM calculation. */
  travelTimeOverrides?: Record<string, number>;
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
export type NominatimResult = HereSearchResult;

export const CATEGORY_INFO: Record<Category, { label: string; icon: string; color: string }> = {
  museum_gallery: { label: 'Museum & Gallery', icon: 'Landmark', color: '#7c3aed' },
  historical: { label: 'Historical', icon: 'Castle', color: '#92400e' },
  nature_landscape: { label: 'Nature & Landscape', icon: 'Mountain', color: '#059669' },
  park_garden: { label: 'Park & Garden', icon: 'TreePine', color: '#16a34a' },
  hiking_trails: { label: 'Hiking & Trails', icon: 'MountainSnow', color: '#475569' },
  beach_water: { label: 'Beach & Water', icon: 'Waves', color: '#0284c7' },
  active_adventure: { label: 'Active & Adventure', icon: 'Flame', color: '#dc2626' },
  food_drink: { label: 'Food & Drink', icon: 'UtensilsCrossed', color: '#ea580c' },
  entertainment: { label: 'Entertainment', icon: 'Ticket', color: '#c026d3' },
  wellness: { label: 'Wellness', icon: 'Heart', color: '#0d9488' },
  zoo_aquarium: { label: 'Zoo & Aquarium', icon: 'PawPrint', color: '#65a30d' },
  event_festival: { label: 'Event & Festival', icon: 'PartyPopper', color: '#d97706' },
  neighbourhood_walks: { label: 'Neighbourhood & City Walks', icon: 'Building2', color: '#64748b' },
};

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

// Format travel duration nicely: 45 min, 1hr 30mins, 2hrs 15mins
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs}hr${hrs > 1 ? 's' : ''}`;
  return `${hrs}hr${hrs > 1 ? 's' : ''} ${mins}min${mins > 1 ? 's' : ''}`;
}
