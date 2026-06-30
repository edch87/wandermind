import type { BucketListItem, PreferredTransport } from '../types';
import { formatDuration } from '../types';

/** Walking auto-override threshold: at ≤15 min the place is essentially next
 *  door — surface walking instead of the user's preferred mode regardless of
 *  the profile preference. Mirrors the detail-page rule so rail cards, detail
 *  page and Navigate handoff all agree. */
export const WALK_OVERRIDE_MAX_MIN = 15;

/** Travel block is hidden below this — the place is essentially at home. */
export const TRAVEL_HIDE_MIN_KM = 0.1;

/** Fallback average speeds (km/h) for the discover rail, where we only have
 *  straight-line distance (no stored per-mode minutes). Matches the values in
 *  recommendation.ts so estimates feel consistent across surfaces. */
const FALLBACK_SPEED_KMH: Record<'walk' | 'bike' | 'car', number> = {
  walk: 4.5,
  bike: 15,
  car: 60,
};

export type DisplayMode = 'car' | 'transit' | 'bike' | 'walk';

export interface TravelDisplay {
  mode: DisplayMode;
  minutes: number | null;
  walkOverride: boolean;
}

export const TRANSPORT_META: Record<DisplayMode, {
  label: string;
  shortLabel: string;
  googleTravelMode: string;
}> = {
  car:     { label: 'By car',     shortLabel: 'by car',     googleTravelMode: 'driving' },
  transit: { label: 'By transit', shortLabel: 'by transit', googleTravelMode: 'transit' },
  bike:    { label: 'By bike',    shortLabel: 'by bike',    googleTravelMode: 'bicycling' },
  walk:    { label: 'On foot',    shortLabel: 'walk',       googleTravelMode: 'walking' },
};

/** Pick the mode that should surface for an item given the user's profile
 *  preference + the item's stored per-mode minutes.
 *  - Walking auto-override when walkMinutes ≤ 15 (place is essentially next door).
 *  - Otherwise the user's preferredTransport, even when that mode's minutes are
 *    null (e.g. no practical transit) — the caller can render a fallback line. */
export function pickDisplayMode(
  item: BucketListItem,
  preferred: PreferredTransport,
): TravelDisplay {
  if (item.walkMinutes != null && item.walkMinutes <= WALK_OVERRIDE_MAX_MIN) {
    return { mode: 'walk', minutes: item.walkMinutes, walkOverride: true };
  }
  const minutes = preferred === 'car' ? item.carMinutes
    : preferred === 'transit' ? item.transitMinutes
    : item.bikeMinutes;
  return { mode: preferred, minutes, walkOverride: false };
}

/** Compact label for rail and surprise cards: "12 min walk" or "1hr 30min by car".
 *  Uses `formatDuration` from types/index.ts so the time portion reads the same
 *  here as on the detail page and recommend flow. Falls back to "X km" when
 *  minutes are unknown (legacy item with no stored per-mode times). */
export function formatTravelShort(
  item: BucketListItem,
  preferred: PreferredTransport,
): string {
  const display = pickDisplayMode(item, preferred);
  if (display.minutes != null) {
    return `${formatDuration(display.minutes)} ${TRANSPORT_META[display.mode].shortLabel}`;
  }
  return `${item.travelDistanceKm} km`;
}

/** Estimate "X min by [mode]" for discover places, which only carry
 *  straight-line distance (no stored per-mode minutes). Uses the same walking
 *  override threshold as saved items so the dashboard reads consistently. */
export function estimateTravelShortFromDistance(
  distanceKm: number,
  preferred: PreferredTransport,
): string {
  const walkMin = Math.round((distanceKm / FALLBACK_SPEED_KMH.walk) * 60);
  if (walkMin <= WALK_OVERRIDE_MAX_MIN) {
    return `${formatDuration(walkMin)} ${TRANSPORT_META.walk.shortLabel}`;
  }
  // Transit has no fallback speed (varies wildly); estimate using car for the
  // discover rail when transit is preferred — it's still a sense-of-distance
  // proxy and the user can refine after saving.
  const speedMode: 'walk' | 'bike' | 'car' = preferred === 'bike' ? 'bike' : 'car';
  const minutes = Math.round((distanceKm / FALLBACK_SPEED_KMH[speedMode]) * 60);
  const labelMode = preferred === 'bike' ? 'bike' : preferred === 'transit' ? 'transit' : 'car';
  return `${formatDuration(minutes)} ${TRANSPORT_META[labelMode].shortLabel}`;
}
