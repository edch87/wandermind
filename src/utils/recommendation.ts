import type {
  BucketListItem, RecommendationConstraints, WeatherForecast,
  ScoredItem, CostLevel, DurationEstimate, Vibe, Category, Season, EnergyLevel,
  TransportMode, TimeOfDay,
} from '../types';
import { getOpeningHoursWarning } from './openingHours';

const DURATION_MINUTES: Record<DurationEstimate, number> = {
  under_1h: 45, '1_2h': 90, '2_3h': 150, half_day: 240, full_day: 480,
};

const COST_RANK: Record<CostLevel, number> = {
  free: 0, cheap: 1, moderate: 2, expensive: 3,
};

const VIBE_CATEGORIES: Record<Exclude<Vibe, 'flexible'>, Category[]> = {
  foodie: ['food_drink'],
  curious: ['museum_gallery', 'historical', 'neighbourhood_walks'],
  outdoorsy: ['hiking_trails', 'nature_landscape', 'park_garden', 'beach_water'],
  playful: ['entertainment', 'zoo_aquarium', 'event_festival', 'active_adventure', 'beach_water'],
  unwind: ['wellness', 'food_drink', 'park_garden'],
  explore: ['neighbourhood_walks', 'nature_landscape', 'hiking_trails'],
};

/** Max activity duration (minutes) per energy level — soft scoring only */
const ENERGY_DURATION_CAP: Record<EnergyLevel, number> = {
  surprise_me: Infinity,
  up_for_anything: Infinity,
  got_some_energy: 240,
  keep_it_easy: 120,
};

/** Max comfortable one-way travel (minutes) per energy level */
const ENERGY_TRAVEL_CAP: Record<EnergyLevel, number> = {
  surprise_me: Infinity,
  up_for_anything: Infinity,
  got_some_energy: 60,
  keep_it_easy: 30,
};

/** Ambition tiers — match activity category to time budget shape */
type Tier = 'quick' | 'local' | 'outing' | 'adventure';

const TIER_FAVOURED: Record<Tier, Category[]> = {
  quick:     ['food_drink', 'neighbourhood_walks', 'park_garden'],
  local:     ['museum_gallery', 'food_drink', 'park_garden', 'wellness', 'entertainment', 'historical'],
  outing:    ['hiking_trails', 'nature_landscape', 'zoo_aquarium', 'beach_water', 'historical', 'museum_gallery'],
  adventure: ['active_adventure', 'hiking_trails', 'nature_landscape', 'beach_water', 'zoo_aquarium'],
};

const TIER_PENALISED: Record<Tier, Category[]> = {
  quick:     ['active_adventure', 'hiking_trails', 'zoo_aquarium', 'nature_landscape'],
  local:     [],
  outing:    [],
  adventure: ['food_drink', 'neighbourhood_walks'],
};

function tierForBudget(totalMinutes: number): Tier {
  if (totalMinutes <= 90) return 'quick';
  if (totalMinutes <= 240) return 'local';
  if (totalMinutes <= 480) return 'outing';
  return 'adventure';
}

/** Walk auto-include cutoff: if a place is closer than this, walking is always considered */
const WALK_AUTO_CUTOFF_KM = 1.5;

/** Fallback walking speed (km/h) when no HERE walk override exists */
const WALK_SPEED_KMH = 4.5;

export function getCurrentSeason(): Season {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/** Slot boundaries in 24h clock */
const SLOT_BOUNDS = {
  morning:   { start: 6,  end: 12 },
  afternoon: { start: 12, end: 17 },
  evening:   { start: 17, end: 23 },
};

/** Slots still available today, given current local time. A slot counts if ≥60 min remain. */
export function getRemainingSlotsToday(now: Date = new Date()): TimeOfDay[] {
  const hour = now.getHours() + now.getMinutes() / 60;
  const out: TimeOfDay[] = [];
  for (const [slot, { start, end }] of Object.entries(SLOT_BOUNDS)) {
    const remaining = (end - Math.max(hour, start)) * 60;
    if (hour < end && remaining >= 60) out.push(slot as TimeOfDay);
  }
  return out;
}

/** Minutes until 23:00 today (the practical cutoff for "today" outings). 0 if already past. */
export function minutesUntilDayEnd(now: Date = new Date()): number {
  const hour = now.getHours() + now.getMinutes() / 60;
  return Math.max(0, Math.round((23 - hour) * 60));
}

/**
 * Effective one-way travel time across the user's selected modes.
 * Returns the minimum, plus the mode that produced it.
 * Walk is auto-considered for places under 1.5 km even if not selected.
 */
export function effectiveTravel(
  item: BucketListItem,
  constraints: RecommendationConstraints,
): { minutes: number; mode: TransportMode } | null {
  const overrides = constraints.travelTimeOverrides?.[item.id];
  const modesToConsider: TransportMode[] = [...constraints.transportModes];

  // Auto-include walk when item is close (using the item's stored straight-line km as a proxy).
  if (!modesToConsider.includes('walk') && item.travelDistanceKm <= WALK_AUTO_CUTOFF_KM) {
    modesToConsider.push('walk');
  }

  if (modesToConsider.length === 0) return null;

  let best: { minutes: number; mode: TransportMode } | null = null;
  for (const mode of modesToConsider) {
    let minutes: number | undefined = overrides?.[mode];
    if (minutes == null) {
      // Fallback: stored travel time if the mode matches what was originally calculated,
      // otherwise derive walking from distance.
      if (mode === item.transportMode) minutes = item.travelTimeMinutes;
      else if (mode === 'walk') minutes = Math.round((item.travelDistanceKm / WALK_SPEED_KMH) * 60);
      else minutes = item.travelTimeMinutes; // generic fallback
    }
    if (best === null || minutes < best.minutes) best = { minutes, mode };
  }
  return best;
}

/** All viable modes with their travel times — for display in results. */
export function viableModes(
  item: BucketListItem,
  constraints: RecommendationConstraints,
): { mode: TransportMode; minutes: number }[] {
  const overrides = constraints.travelTimeOverrides?.[item.id];
  const modes: TransportMode[] = [...constraints.transportModes];
  if (!modes.includes('walk') && item.travelDistanceKm <= WALK_AUTO_CUTOFF_KM) {
    modes.push('walk');
  }
  return modes.map(mode => {
    let minutes = overrides?.[mode];
    if (minutes == null) {
      if (mode === item.transportMode) minutes = item.travelTimeMinutes;
      else if (mode === 'walk') minutes = Math.round((item.travelDistanceKm / WALK_SPEED_KMH) * 60);
      else minutes = item.travelTimeMinutes;
    }
    return { mode, minutes };
  }).sort((a, b) => a.minutes - b.minutes);
}

export function getRecommendations(
  items: BucketListItem[],
  constraints: RecommendationConstraints,
  weather: WeatherForecast | null,
  now: Date = new Date(),
): ScoredItem[] {
  // Resolve effective time budget. If max is Infinity, full-day mode.
  const isFullDay = !isFinite(constraints.timeAvailableMinutes);
  const isToday = constraints.date === toISODate(now);

  // For today, soft-cap by hours-until-23:00 so "Full day at 7pm" doesn't suggest 8hr hikes.
  let effectiveMax = constraints.timeAvailableMinutes;
  if (isToday) {
    const cap = minutesUntilDayEnd(now);
    if (cap > 0) effectiveMax = Math.min(effectiveMax, cap);
  }

  const remainingSlots = isToday ? getRemainingSlotsToday(now) : null;

  // Build allowed categories from selected vibes (hard filter).
  // 'flexible' = no restriction. If only flexible (or empty), all categories pass.
  const activeVibes = constraints.vibes.filter(v => v !== 'flexible');
  const allowedCategories: Set<Category> | null = activeVibes.length > 0
    ? new Set(activeVibes.flatMap(v => VIBE_CATEGORIES[v as Exclude<Vibe, 'flexible'>]))
    : null;

  // Step 1: Hard filters
  const candidates = items.filter(item => {
    if (item.status !== 'want_to_do') return false;

    // Vibe filter — if user picked specific vibes, item category must match one of them
    if (allowedCategories && !allowedCategories.has(item.category)) return false;

    // Travel + activity must fit within the (possibly capped) max
    const travel = effectiveTravel(item, constraints);
    if (!travel) return false;
    const activityMin = DURATION_MINUTES[item.durationEstimate] || 120;
    const totalNeeded = (travel.minutes * 2) + activityMin;
    if (totalNeeded > effectiveMax) return false;

    // Minimum total — user wants at least this much
    if (constraints.timeMinMinutes && totalNeeded < constraints.timeMinMinutes) return false;

    // Time of day (today only)
    if (remainingSlots) {
      const itemSlots = item.bestTimesOfDay || [];
      const anyOk = itemSlots.length === 0 || itemSlots.includes('any');
      if (!anyOk) {
        const overlap = itemSlots.some(s => remainingSlots.includes(s));
        if (!overlap) return false;
      }
    }

    // Group
    if (constraints.groupTypes.length > 0) {
      if (!constraints.groupTypes.some(g => item.groupSuitability.includes(g))) return false;
    }

    // Budget
    if (COST_RANK[item.costLevel] > COST_RANK[constraints.maxCostLevel]) return false;

    // Weather
    if (weather) {
      const isBadWeather = ['rainy', 'snowy', 'foggy'].includes(weather.weatherType);
      if (isBadWeather && item.weatherSuitability === 'good_weather') return false;
    }

    // Season
    const season = getCurrentSeason();
    const seasons = item.bestSeasons || [];
    if (seasons.length > 0 && !seasons.includes('any') && !seasons.includes(season)) return false;

    if (constraints.dogComing && item.dogFriendly === false) return false;
    if (constraints.needsAccessibility && item.wheelchairAccessible === false) return false;
    if (constraints.strollerNeeded && item.strollerFriendly === false) return false;

    return true;
  });

  // Step 2: Soft scoring
  const scored: ScoredItem[] = candidates.map(item => {
    let score = 0;
    const reasons: string[] = [];
    const travel = effectiveTravel(item, constraints)!;
    const activityMin = DURATION_MINUTES[item.durationEstimate] || 120;
    const totalNeeded = (travel.minutes * 2) + activityMin;

    // Priority
    if (item.priority === 'high') { score += 30; reasons.push('High priority on your list'); }
    else if (item.priority === 'medium') score += 20;
    else score += 10;

    // Weather match
    if (weather) {
      const isBadWeather = ['rainy', 'snowy', 'foggy'].includes(weather.weatherType);
      if (isBadWeather && item.weatherSuitability === 'bad_weather_ideal') {
        score += 25;
        reasons.push(`Perfect for today's ${weather.description.toLowerCase()} weather`);
      } else if (isBadWeather && item.setting === 'indoor') {
        score += 20;
        reasons.push('Indoor activity, ideal for the weather');
      } else if (!isBadWeather && item.setting === 'outdoor') {
        score += 20;
        reasons.push('Great outdoor activity for a nice day');
      } else if (item.weatherSuitability === 'any') {
        score += 10;
      }
    }

    // Travel efficiency — relative to the (capped) budget
    if (isFinite(effectiveMax)) {
      const travelRatio = (travel.minutes * 2) / effectiveMax;
      if (travelRatio < 0.3) { score += 15; reasons.push(`Only ${travel.minutes} min away by ${travel.mode}`); }
      else if (travelRatio < 0.5) score += 10;
      else score += 5;
    } else {
      // Full-day mode: no penalty for travel distance, mild bonus for nearby anyway
      if (travel.minutes < 30) score += 10;
      else score += 5;
    }

    // Duration fit
    if (isFinite(effectiveMax)) {
      const availableAfterTravel = effectiveMax - (travel.minutes * 2);
      if (availableAfterTravel > 0) {
        const fillRatio = activityMin / availableAfterTravel;
        if (fillRatio >= 0.6 && fillRatio <= 1.0) {
          score += 15;
          reasons.push('Fits perfectly in your available time');
        } else if (fillRatio >= 0.4) score += 10;
        else score += 5;
      }
    }

    // Ambition-tier match
    const tier = tierForBudget(isFinite(effectiveMax) ? effectiveMax : 600);
    if (TIER_FAVOURED[tier].includes(item.category)) {
      score += 15;
      if (tier === 'quick') reasons.push('Great quick option');
      else if (tier === 'adventure') reasons.push('Perfect for a big day out');
    } else if (TIER_PENALISED[tier].includes(item.category)) {
      score -= 15;
    }

    // Full-day extra preference for ambitious activities
    if (isFullDay && (item.durationEstimate === 'full_day' || item.durationEstimate === 'half_day')) {
      score += 10;
      reasons.push('A proper day out');
    }

    // Season bonus
    const itemSeasons = item.bestSeasons || [];
    if (itemSeasons.includes(getCurrentSeason())) {
      score += 10;
      reasons.push(`Best time of year to visit`);
    }

    // Vibe is now a hard filter (see step 1) — no score adjustment needed here.
    // Surface that the match was intentional in the reasons list.
    if (allowedCategories) {
      reasons.push('Matches your vibe');
    }

    // Energy fit (soft)
    const durationCap = ENERGY_DURATION_CAP[constraints.energy];
    const travelCap = ENERGY_TRAVEL_CAP[constraints.energy];
    if (activityMin <= durationCap && travel.minutes <= travelCap) {
      score += 10;
      if (constraints.energy === 'keep_it_easy') reasons.push('Easy, low-effort outing');
      else if (constraints.energy === 'up_for_anything') reasons.push('Great for a big day out');
    } else if (constraints.energy === 'keep_it_easy' || constraints.energy === 'got_some_energy') {
      score -= 10;
    }

    // Cost bonus
    if (item.costLevel === 'free') { score += 5; reasons.push('Free!'); }
    else if (item.costLevel === 'cheap') score += 3;

    // Opening hours warning
    const hoursWarning = getOpeningHoursWarning(item.openingHours, constraints.date);
    if (hoursWarning) {
      if (hoursWarning.startsWith('Closed') || hoursWarning.startsWith('May be closed')) {
        score -= 50;
        reasons.push(hoursWarning);
      } else {
        reasons.push(hoursWarning);
      }
    }

    // Suppress unused-var warning for totalNeeded — it's only here for future tracing
    void totalNeeded;

    return { item, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// Combo detection: find pairs of top items within 2km of each other
export function findCombos(
  scored: ScoredItem[],
  timeAvailable: number,
  constraints?: RecommendationConstraints,
): { itemA: BucketListItem; itemB: BucketListItem; walkingMinutes: number }[] {
  const top = scored.slice(0, 10);
  const combos: { itemA: BucketListItem; itemB: BucketListItem; walkingMinutes: number }[] = [];
  const budget = isFinite(timeAvailable) ? timeAvailable : Infinity;

  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i].item;
      const b = top[j].item;
      const dist = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);

      if (dist < 2) {
        const walkMin = Math.round(dist * 15);
        const durA = DURATION_MINUTES[a.durationEstimate] || 120;
        const durB = DURATION_MINUTES[b.durationEstimate] || 120;
        const travelA = constraints ? effectiveTravel(a, constraints)?.minutes ?? a.travelTimeMinutes : a.travelTimeMinutes;
        const travelB = constraints ? effectiveTravel(b, constraints)?.minutes ?? b.travelTimeMinutes : b.travelTimeMinutes;
        const totalNeeded = Math.max(travelA, travelB) * 2 + durA + durB + walkMin;

        if (totalNeeded <= budget) {
          combos.push({ itemA: a, itemB: b, walkingMinutes: walkMin });
        }
      }
    }
  }

  return combos;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}
