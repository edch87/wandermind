import type {
  BucketListItem, RecommendationConstraints, WeatherForecast,
  ScoredItem, CostLevel, DurationEstimate, Vibe, Category, Season, EnergyLevel
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

/** Max duration (minutes) per energy level — used for soft scoring, not hard filtering */
const ENERGY_DURATION_CAP: Record<EnergyLevel, number> = {
  surprise_me: Infinity,
  up_for_anything: Infinity,
  got_some_energy: 240,  // up to half day
  keep_it_easy: 120,     // up to 2 hours
};

/** Max comfortable travel time (one-way minutes) per energy level */
const ENERGY_TRAVEL_CAP: Record<EnergyLevel, number> = {
  surprise_me: Infinity,
  up_for_anything: Infinity,
  got_some_energy: 60,
  keep_it_easy: 30,
};

export function getCurrentSeason(): Season {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export function getRecommendations(
  items: BucketListItem[],
  constraints: RecommendationConstraints,
  weather: WeatherForecast | null,
): ScoredItem[] {
  // Step 1: Hard filters
  let candidates = items.filter(item => {
    if (item.status !== 'want_to_do') return false;

    // Time budget: travel there + activity + travel back
    const activityMin = DURATION_MINUTES[item.durationEstimate] || 120;
    const travelOneWay = constraints.travelTimeOverrides?.[item.id] ?? item.travelTimeMinutes;
    const totalNeeded = (travelOneWay * 2) + activityMin;
    if (totalNeeded > constraints.timeAvailableMinutes) return false;
    if (constraints.timeMinMinutes && totalNeeded < constraints.timeMinMinutes) return false;

    // Group suitability
    if (constraints.groupTypes.length > 0) {
      const hasMatch = constraints.groupTypes.some(g => item.groupSuitability.includes(g));
      if (!hasMatch) return false;
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

    // Dog
    if (constraints.dogComing && item.dogFriendly === false) return false;

    // Accessibility
    if (constraints.needsAccessibility && item.wheelchairAccessible === false) return false;

    // Stroller
    if (constraints.strollerNeeded && item.strollerFriendly === false) return false;

    return true;
  });

  // Step 2: Soft scoring
  const scored: ScoredItem[] = candidates.map(item => {
    let score = 0;
    const reasons: string[] = [];

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

    // Travel efficiency
    const travelOneWay = constraints.travelTimeOverrides?.[item.id] ?? item.travelTimeMinutes;
    const travelRatio = (travelOneWay * 2) / constraints.timeAvailableMinutes;
    if (travelRatio < 0.3) { score += 15; reasons.push(`Only ${travelOneWay} min away`); }
    else if (travelRatio < 0.5) score += 10;
    else score += 5;

    // Duration fit
    const activityMin = DURATION_MINUTES[item.durationEstimate] || 120;
    const availableAfterTravel = constraints.timeAvailableMinutes - (travelOneWay * 2);
    if (availableAfterTravel > 0) {
      const fillRatio = activityMin / availableAfterTravel;
      if (fillRatio >= 0.6 && fillRatio <= 1.0) {
        score += 15;
        reasons.push('Fits perfectly in your available time');
      } else if (fillRatio >= 0.4) score += 10;
      else score += 5;
    }

    // Season bonus
    const itemSeasons = item.bestSeasons || [];
    if (itemSeasons.includes(getCurrentSeason())) {
      score += 10;
      reasons.push(`Best time of year to visit`);
    }

    // Vibe match
    const activeVibes = constraints.vibes.filter(v => v !== 'flexible');
    if (activeVibes.length > 0) {
      const vibeCategories = activeVibes.flatMap(v => VIBE_CATEGORIES[v as Exclude<Vibe, 'flexible'>]);
      if (vibeCategories.includes(item.category)) {
        score += 10;
        reasons.push('Matches your vibe');
      }
    }

    // Energy level fit
    const activityDuration = DURATION_MINUTES[item.durationEstimate] || 120;
    const durationCap = ENERGY_DURATION_CAP[constraints.energy];
    const travelCap = ENERGY_TRAVEL_CAP[constraints.energy];
    if (activityDuration <= durationCap && travelOneWay <= travelCap) {
      score += 10;
      if (constraints.energy === 'keep_it_easy') reasons.push('Easy, low-effort outing');
      else if (constraints.energy === 'up_for_anything') reasons.push('Great for a big day out');
    } else if (constraints.energy === 'keep_it_easy' || constraints.energy === 'got_some_energy') {
      // Penalise items that exceed energy comfort zone
      score -= 10;
    }

    // Cost bonus
    if (item.costLevel === 'free') { score += 5; reasons.push('Free!'); }
    else if (item.costLevel === 'cheap') score += 3;

    // Opening hours warning
    const hoursWarning = getOpeningHoursWarning(item.openingHours, constraints.date);
    if (hoursWarning) {
      // If closed on this day, penalise heavily
      if (hoursWarning.startsWith('Closed') || hoursWarning.startsWith('May be closed')) {
        score -= 50;
        reasons.push(hoursWarning);
      } else {
        // Time-based warnings (early close, late open, etc.) — still show but lighter penalty
        reasons.push(hoursWarning);
      }
    }

    return { item, score, reasons };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// Combo detection: find pairs of top items within 2km of each other
export function findCombos(
  scored: ScoredItem[],
  timeAvailable: number
): { itemA: BucketListItem; itemB: BucketListItem; walkingMinutes: number }[] {
  const top = scored.slice(0, 10);
  const combos: { itemA: BucketListItem; itemB: BucketListItem; walkingMinutes: number }[] = [];

  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i].item;
      const b = top[j].item;
      const dist = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);

      if (dist < 2) {
        const walkMin = Math.round(dist * 15); // ~15 min per km walking
        const durA = DURATION_MINUTES[a.durationEstimate] || 120;
        const durB = DURATION_MINUTES[b.durationEstimate] || 120;
        const totalNeeded = Math.max(a.travelTimeMinutes, b.travelTimeMinutes) * 2 + durA + durB + walkMin;

        if (totalNeeded <= timeAvailable) {
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
