import type {
  BucketListItem, RecommendationConstraints, WeatherForecast,
  ScoredItem, CostLevel, DurationEstimate, Vibe, Category, Season, EnergyLevel,
  TransportMode, TimeOfDay, Tag,
} from '../types';
import { getOpeningHoursWarning } from './openingHours';

const DURATION_MINUTES: Record<DurationEstimate, number> = {
  under_1h: 45, '1_2h': 90, '2_3h': 150, half_day: 240, full_day: 480,
};

const COST_RANK: Record<CostLevel, number> = {
  free: 0, cheap: 1, moderate: 2, expensive: 3,
};

// Vibe → categories (hard filter when one or more non-flexible vibes selected).
// Sourced from docs/categories.xlsx Sheet 2 (Vibe → Categories map). 8 vibes incl. `active`.
// Exported so other surfaces (BucketList filter) can reuse the same mapping
// without redefining it — single source of truth.
export const VIBE_CATEGORIES: Record<Exclude<Vibe, 'flexible'>, Category[]> = {
  foodie:    ['food_drink'],
  curious:   ['museum_gallery', 'historical', 'religious_site', 'neighbourhood_walks'],
  outdoorsy: ['nature_landscape', 'park_garden', 'beach_water', 'neighbourhood_walks'],
  active:    ['active', 'nature_landscape', 'beach_water', 'amusement_park'],
  playful:   ['entertainment', 'nightlife', 'zoo_aquarium', 'amusement_park', 'theatre_concert'],
  unwind:    ['wellness', 'food_drink', 'park_garden'],
  explore:   ['neighbourhood_walks', 'nature_landscape'],
};

// Vibe → tags that get a score boost when present on a matched item.
// Sourced from project-recommendation-audit memory (locked 2026-06-23).
// Tags not in this map don't contribute — the engine only boosts the listed ones.
const VIBE_TAG_BOOSTS: Partial<Record<Exclude<Vibe, 'flexible'>, Tag[]>> = {
  foodie:    ['market', 'outdoor_seating', 'class'],
  curious:   ['tour'],
  outdoorsy: ['viewpoint', 'picnicking'],
  active:    ['hiking', 'cycling', 'water_sports', 'winter_sports'],
  playful:   ['live_music', 'late_night'],
  unwind:    ['sauna', 'outdoor_seating'],
  explore:   ['market', 'viewpoint', 'tour'],
};

/** Max activity duration (minutes) per energy level — soft scoring only */
const ENERGY_DURATION_CAP: Record<EnergyLevel, number> = {
  up_for_anything: Infinity,
  got_some_energy: 240,
  keep_it_easy: 120,
};

/** Max comfortable one-way travel (minutes) per energy level.
 *  keep_it_easy's 30-min cap is also enforced as a hard filter (Q3 decision). */
const ENERGY_TRAVEL_CAP: Record<EnergyLevel, number> = {
  up_for_anything: Infinity,
  got_some_energy: 60,
  keep_it_easy: 30,
};

/** Ambition tiers — match activity category to time budget shape.
 *  Sourced from docs/categories.xlsx Sheet 2 (Tier map). */
type Tier = 'quick' | 'local' | 'outing' | 'adventure';

const TIER_FAVOURED: Record<Tier, Category[]> = {
  quick:     ['food_drink', 'nightlife', 'neighbourhood_walks', 'park_garden', 'shopping', 'religious_site'],
  local:     ['museum_gallery', 'historical', 'religious_site', 'food_drink', 'nightlife', 'theatre_concert', 'park_garden', 'wellness', 'entertainment', 'shopping', 'active'],
  outing:    ['nature_landscape', 'beach_water', 'zoo_aquarium', 'historical', 'museum_gallery', 'amusement_park', 'wellness', 'active'],
  adventure: ['nature_landscape', 'beach_water', 'amusement_park', 'active'],
};

const TIER_PENALISED: Record<Tier, Category[]> = {
  quick:     ['active', 'nature_landscape', 'amusement_park', 'zoo_aquarium', 'beach_water'],
  local:     [],
  outing:    [],
  adventure: ['food_drink', 'nightlife', 'neighbourhood_walks', 'shopping'],
};

/** Tag-boost magnitudes — +8 per vibe→tag match, capped at +24 (3 tags max contribute). */
const TAG_BOOST_PER_MATCH = 8;
const TAG_BOOST_CAP = 24;

function tierForBudget(totalMinutes: number): Tier {
  if (totalMinutes <= 90) return 'quick';
  if (totalMinutes <= 240) return 'local';
  if (totalMinutes <= 480) return 'outing';
  return 'adventure';
}

/** Walk auto-include cutoff: if a place is closer than this, walking is always considered */
const WALK_AUTO_CUTOFF_KM = 1.5;

/** Fallback average speeds (km/h) for legacy items missing a per-mode time.
 *  Transit deliberately omitted — when transit_minutes is null we treat it as
 *  "not practical by transit" for that item, not "estimate it". */
const FALLBACK_SPEED_KMH: Record<'walk' | 'bike' | 'car', number> = {
  walk: 4.5,
  bike: 15,
  car: 60,
};

function storedMinutes(item: BucketListItem, mode: TransportMode): number | null {
  switch (mode) {
    case 'walk':    return item.walkMinutes;
    case 'bike':    return item.bikeMinutes;
    case 'car':     return item.carMinutes;
    case 'transit': return item.transitMinutes;
  }
}

/** Resolve a mode's minutes for an item. Returns null when the mode is not
 *  viable (e.g. transit with no practical route). */
function minutesForMode(item: BucketListItem, mode: TransportMode): number | null {
  const stored = storedMinutes(item, mode);
  if (stored != null) return stored;
  // Legacy item without this mode populated yet. Transit gets no estimate
  // (null = not viable); the others fall back to a rough straight-line guess.
  if (mode === 'transit') return null;
  const km = item.travelDistanceKm || 0;
  return Math.round((km / FALLBACK_SPEED_KMH[mode]) * 60);
}

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
 * Returns the minimum, plus the mode that produced it. Reads pre-computed
 * per-mode times from the item (stored at save time / on home-change).
 * Walk is auto-considered for places under 1.5 km even if not selected.
 * Returns null when no selected mode is viable for this item (e.g. transit
 * only, but transitMinutes is null).
 */
export function effectiveTravel(
  item: BucketListItem,
  constraints: RecommendationConstraints,
): { minutes: number; mode: TransportMode } | null {
  const modesToConsider: TransportMode[] = [...constraints.transportModes];

  // Auto-include walk when item is close (using the item's stored straight-line km as a proxy).
  if (!modesToConsider.includes('walk') && item.travelDistanceKm <= WALK_AUTO_CUTOFF_KM) {
    modesToConsider.push('walk');
  }

  if (modesToConsider.length === 0) return null;

  let best: { minutes: number; mode: TransportMode } | null = null;
  for (const mode of modesToConsider) {
    const minutes = minutesForMode(item, mode);
    if (minutes == null) continue; // not viable (e.g. no transit route)
    if (best === null || minutes < best.minutes) best = { minutes, mode };
  }
  return best;
}

/** All viable modes with their travel times — for display in results. Modes
 *  that aren't viable for this item (e.g. transit when transitMinutes is null)
 *  are filtered out, so the result cards never show "Not practical" lines. */
export function viableModes(
  item: BucketListItem,
  constraints: RecommendationConstraints,
): { mode: TransportMode; minutes: number }[] {
  const modes: TransportMode[] = [...constraints.transportModes];
  if (!modes.includes('walk') && item.travelDistanceKm <= WALK_AUTO_CUTOFF_KM) {
    modes.push('walk');
  }
  return modes
    .map(mode => {
      const minutes = minutesForMode(item, mode);
      return minutes == null ? null : { mode, minutes };
    })
    .filter((m): m is { mode: TransportMode; minutes: number } => m != null)
    .sort((a, b) => a.minutes - b.minutes);
}

export function getRecommendations(
  items: BucketListItem[],
  constraints: RecommendationConstraints,
  weather: WeatherForecast | null,
  now: Date = new Date(),
): ScoredItem[] {
  // Surprise-me mode: skip Q5 (energy) and Q6 (vibe) filtering, use permissive defaults,
  // then apply the weighted-random shuffle at the end. Q1-Q4 + Q7-Q8 still apply.
  const surprise = !!constraints.surpriseMe;
  const effectiveEnergy: EnergyLevel = surprise ? 'up_for_anything' : constraints.energy;
  const effectiveVibes: Vibe[] = surprise ? ['flexible'] : constraints.vibes;

  // Resolve effective time budget. If max is Infinity, full-day mode.
  const isFullDay = !isFinite(constraints.timeAvailableMinutes);
  const isToday = constraints.date === toISODate(now);

  // For today, soft-cap by hours-until-23:00 so "Full day at 7pm" doesn't suggest 8hr hikes.
  let effectiveMax = constraints.timeAvailableMinutes;
  if (isToday) {
    const cap = minutesUntilDayEnd(now);
    if (cap > 0) effectiveMax = Math.min(effectiveMax, cap);
  }

  // User-picked slots (multi-select). Empty array = treat as no filter (engine
  // back-compat: callers that don't set selectedSlots get the old "anything goes"
  // behaviour). For today the form pre-fills only remaining slots, so a 7pm
  // request still excludes morning-only items.
  const userSlots = constraints.selectedSlots && constraints.selectedSlots.length > 0
    ? constraints.selectedSlots
    : null;

  // Build allowed categories from selected vibes (hard filter).
  // 'flexible' = no restriction. If only flexible (or empty), all categories pass.
  const activeVibes = effectiveVibes.filter(v => v !== 'flexible');
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

    // keep_it_easy hard filter (Q3 decision): 30-min one-way travel cap, exclude `active` category.
    // hiking-tagged items aren't excluded but get a score penalty further down.
    if (effectiveEnergy === 'keep_it_easy') {
      if (travel.minutes > 30) return false;
      if (item.category === 'active') return false;
    }

    // Minimum total — user wants at least this much
    if (constraints.timeMinMinutes && totalNeeded < constraints.timeMinMinutes) return false;

    // Time of day — driven by the user's slot picker (applies to today AND tomorrow).
    // Items tagged with specific slots must overlap with at least one selected slot;
    // items with no slot data (or tagged 'any') always pass.
    if (userSlots) {
      const itemSlots = item.bestTimesOfDay || [];
      const anyOk = itemSlots.length === 0 || itemSlots.includes('any');
      if (!anyOk) {
        const overlap = itemSlots.some(s => userSlots.includes(s));
        if (!overlap) return false;
      }
    }

    // Group — AND semantics (2026-06-24 Q4 decision). "Partner + With kids" means the item
    // must be suitable for couples AND kids, not either-or. Empty selection = no filter.
    if (constraints.groupTypes.length > 0) {
      if (!constraints.groupTypes.every(g => item.groupSuitability.includes(g))) return false;
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

    // Vibe is a hard filter (see step 1). The soft boost is the per-vibe tag map:
    // matched tags on the item add +TAG_BOOST_PER_MATCH each, capped at TAG_BOOST_CAP.
    if (allowedCategories) {
      reasons.push('Matches your vibe');
      const itemTags = (item.tags || []) as Tag[];
      let tagBoost = 0;
      let tagsHit: Tag[] = [];
      for (const vibe of activeVibes) {
        const boosters = VIBE_TAG_BOOSTS[vibe as Exclude<Vibe, 'flexible'>] || [];
        for (const tag of itemTags) {
          if (boosters.includes(tag) && !tagsHit.includes(tag)) {
            tagsHit.push(tag);
            tagBoost += TAG_BOOST_PER_MATCH;
          }
        }
      }
      tagBoost = Math.min(tagBoost, TAG_BOOST_CAP);
      if (tagBoost > 0) {
        score += tagBoost;
        reasons.push(`Has ${tagsHit.join(' + ')}`);
      }
    }

    // Energy fit (soft). keep_it_easy already enforced the hard cap above; this
    // adds a hiking-tag penalty so hike-tagged park/nature items rank below
    // gentler alternatives without being excluded outright.
    const durationCap = ENERGY_DURATION_CAP[effectiveEnergy];
    const travelCap = ENERGY_TRAVEL_CAP[effectiveEnergy];
    if (activityMin <= durationCap && travel.minutes <= travelCap) {
      score += 10;
      if (effectiveEnergy === 'keep_it_easy') reasons.push('Easy, low-effort outing');
      else if (effectiveEnergy === 'up_for_anything') reasons.push('Great for a big day out');
    } else if (effectiveEnergy === 'keep_it_easy' || effectiveEnergy === 'got_some_energy') {
      score -= 10;
    }
    if (effectiveEnergy === 'keep_it_easy' && (item.tags || []).includes('hiking')) {
      score -= 12;
    }

    // Cost bonus
    if (item.costLevel === 'free') { score += 5; reasons.push('Free!'); }
    else if (item.costLevel === 'cheap') score += 3;

    // Recently-shown soft penalty — keeps top-of-list rotating across sessions.
    if (constraints.suppressedIds?.includes(item.id)) {
      score -= 10;
    }

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

  // "Surprise me" — weighted random pick from the top 20 placed at the top of
  // the list. Higher-scoring items are still more likely to be picked, but
  // the user gets a different mix every time. Triggered by the dedicated button
  // (constraints.surpriseMe), not the energy enum (surprise_me removed 2026-06-24).
  if (surprise && scored.length > 1) {
    const poolSize = Math.min(20, scored.length);
    const pool = scored.slice(0, poolSize);
    const rest = scored.slice(poolSize);
    const pickCount = Math.min(5, pool.length);
    const picked: ScoredItem[] = [];
    const remaining = [...pool];
    while (picked.length < pickCount && remaining.length > 0) {
      // Weight by score, with a floor of 1 so negative-scoring items can still appear.
      const totalWeight = remaining.reduce((sum, s) => sum + Math.max(s.score, 1), 0);
      let r = Math.random() * totalWeight;
      let idx = 0;
      for (let i = 0; i < remaining.length; i++) {
        r -= Math.max(remaining[i].score, 1);
        if (r <= 0) { idx = i; break; }
      }
      picked.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
    return [...picked, ...remaining, ...rest];
  }

  return scored;
}

// Combo classes (6 buckets — docs/categories.xlsx Sheet 2 "Combo classes").
// `filler` pairs with anything; `cultural` pairs with cultural + filler; `outdoor`
// pairs with outdoor + filler; `evening` pairs with filler only AND only when the
// filler has evening availability; `solo` pairs with filler only; `destination`
// never pairs.
const COMBO_FILLERS: Category[] = ['food_drink', 'park_garden', 'neighbourhood_walks', 'shopping'];
const COMBO_CULTURAL: Category[] = ['museum_gallery', 'historical', 'religious_site'];
const COMBO_OUTDOOR: Category[] = ['nature_landscape', 'beach_water'];
const COMBO_EVENING: Category[] = ['nightlife', 'theatre_concert'];
const COMBO_SOLO: Category[] = ['active', 'entertainment', 'zoo_aquarium', 'wellness', 'other'];
const COMBO_DESTINATION: Category[] = ['amusement_park'];

function comboClass(c: Category): 'filler' | 'cultural' | 'outdoor' | 'evening' | 'solo' | 'destination' {
  if (COMBO_FILLERS.includes(c)) return 'filler';
  if (COMBO_CULTURAL.includes(c)) return 'cultural';
  if (COMBO_OUTDOOR.includes(c)) return 'outdoor';
  if (COMBO_EVENING.includes(c)) return 'evening';
  if (COMBO_DESTINATION.includes(c)) return 'destination';
  if (COMBO_SOLO.includes(c)) return 'solo';
  // Any future category not listed above defaults to solo (safest: pair only with filler).
  return 'solo';
}

/** A filler is "evening-compatible" when its bestTimesOfDay slot includes
 *  evening or any — used for pairing nightlife/theatre with a dinner spot. */
function isEveningCompatibleFiller(item: BucketListItem): boolean {
  if (comboClass(item.category) !== 'filler') return false;
  const slots = item.bestTimesOfDay || [];
  return slots.length === 0 || slots.includes('any') || slots.includes('evening');
}

/**
 * Whether two items form a sensible "do both in one outing" combo.
 * Rules per docs/categories.xlsx Sheet 2:
 *  1. Same category never combines.
 *  2. destination (amusement_park) never combines.
 *  3. filler pairs with anything non-same-category.
 *  4. cultural pairs with cultural + filler.
 *  5. outdoor pairs with outdoor + filler.
 *  6. evening pairs with filler only, and only when the filler is evening-compatible.
 *  7. solo (active/entertainment/zoo/wellness/other) pairs with filler only.
 */
function combosAreCompatible(a: BucketListItem, b: BucketListItem): boolean {
  if (a.category === b.category) return false;
  const ca = comboClass(a.category);
  const cb = comboClass(b.category);
  if (ca === 'destination' || cb === 'destination') return false;

  // Filler on either side handles its own pairing rule below depending on the other's class.
  const isFiller = (c: typeof ca) => c === 'filler';

  // evening + filler — filler must be evening-compatible.
  if (ca === 'evening' && isFiller(cb)) return isEveningCompatibleFiller(b);
  if (cb === 'evening' && isFiller(ca)) return isEveningCompatibleFiller(a);
  if (ca === 'evening' || cb === 'evening') return false; // evening + anything-non-filler

  // solo + filler — solo never pairs with anything else.
  if (ca === 'solo' && isFiller(cb)) return true;
  if (cb === 'solo' && isFiller(ca)) return true;
  if (ca === 'solo' || cb === 'solo') return false;

  // cultural pair with cultural or filler.
  if (ca === 'cultural' && (cb === 'cultural' || isFiller(cb))) return true;
  if (cb === 'cultural' && (ca === 'cultural' || isFiller(ca))) return true;
  if (ca === 'cultural' || cb === 'cultural') return false;

  // outdoor pair with outdoor or filler.
  if (ca === 'outdoor' && (cb === 'outdoor' || isFiller(cb))) return true;
  if (cb === 'outdoor' && (ca === 'outdoor' || isFiller(ca))) return true;
  if (ca === 'outdoor' || cb === 'outdoor') return false;

  // Two fillers — different categories already checked at the top, so they pair.
  if (isFiller(ca) && isFiller(cb)) return true;

  return false;
}

// Combo detection: find pairs of top items within 2km of each other AND
// in compatible categories (see combosAreCompatible).
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

      // Category compatibility — skip nonsense pairs (two restaurants, museum + hike, etc.)
      if (!combosAreCompatible(a, b)) continue;

      const dist = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);

      if (dist < 2) {
        const walkMin = Math.round(dist * 15);
        const durA = DURATION_MINUTES[a.durationEstimate] || 120;
        const durB = DURATION_MINUTES[b.durationEstimate] || 120;
        // For combos we approximate travel as the car time when no constraints
        // are passed (Dashboard preview). Falls back to a haversine guess for
        // legacy items where carMinutes is null.
        const carEstimate = (item: BucketListItem) =>
          item.carMinutes ?? Math.round(((item.travelDistanceKm || 0) / FALLBACK_SPEED_KMH.car) * 60);
        const travelA = constraints ? effectiveTravel(a, constraints)?.minutes ?? carEstimate(a) : carEstimate(a);
        const travelB = constraints ? effectiveTravel(b, constraints)?.minutes ?? carEstimate(b) : carEstimate(b);
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
