import type { HereSearchResult, TransportMode, WeatherForecast, WeatherType } from '../types';

const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY || '';
const HERE_DISCOVER = 'https://discover.search.hereapi.com/v1/discover';
const HERE_GEOCODE = 'https://geocode.search.hereapi.com/v1/geocode';
const HERE_REVGEOCODE = 'https://revgeocode.search.hereapi.com/v1/revgeocode';
const HERE_LOOKUP = 'https://lookup.search.hereapi.com/v1/lookup';
const HERE_ROUTE = 'https://router.hereapi.com/v8/routes';
const HERE_TRANSIT = 'https://transit.router.hereapi.com/v8/routes';
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

// ── Google Places (New) — hybrid setup ──
// Google handles place search, opening hours and photos (better coverage and
// venue-bound images). HERE stays for map tiles + routing.
// COST GUARD: each field mask below is pinned to one SKU tier on purpose.
// Adding a field can silently bump the call into a pricier SKU — check
// https://developers.google.com/maps/billing-and-pricing/pricing before changing.
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const GOOGLE_PLACES = 'https://places.googleapis.com/v1';

// Supabase env — used by the share-link resolver (resolve-maps-link Edge Function)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Pro-tier fields only (5,000 free calls/month)
const GOOGLE_SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
  'places.addressComponents',
].join(',');

// HERE raster map tiles (for Leaflet) — exported for components
export const HERE_TILE_URL = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=explore.day&apiKey=${HERE_API_KEY}`;
export const HERE_TILE_ATTRIBUTION = '&copy; HERE Technologies';

// ── Place search via HERE Autosuggest ──

function mapHereItem(item: Record<string, unknown>): HereSearchResult | null {
  const pos = item.position as { lat: number; lng: number } | undefined;
  if (!pos) return null;

  const addr = (item.address || {}) as Record<string, string>;
  const cats = (item.categories || []) as { id: string; name: string }[];
  const oh = (item.openingHours || []) as { text?: string[] }[];

  return {
    id: (item.id as string) || '',
    title: (item.title as string) || '',
    address: {
      label: addr.label || (item.title as string) || '',
      city: addr.city,
      state: addr.state,
      country: addr.countryName,
      countryCode: addr.countryCode,
    },
    position: pos,
    categories: cats,
    openingHours: oh[0]?.text?.[0],
  };
}

// ── Google Places mapping helpers ──

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

function googleAddressPart(components: GoogleAddressComponent[], type: string, short = false): string | undefined {
  const c = components.find(comp => (comp.types || []).includes(type));
  return short ? c?.shortText : c?.longText;
}

function mapGooglePlace(place: Record<string, unknown>): HereSearchResult | null {
  const loc = place.location as { latitude: number; longitude: number } | undefined;
  const id = place.id as string | undefined;
  if (!loc || !id) return null;

  const comps = (place.addressComponents || []) as GoogleAddressComponent[];
  const types = (place.types || []) as string[];
  const displayName = (place.displayName as { text?: string } | undefined)?.text || '';

  return {
    id: '', // no HERE id — googlePlaceId identifies this result
    googlePlaceId: id,
    title: displayName,
    address: {
      label: (place.formattedAddress as string) || displayName,
      city: googleAddressPart(comps, 'locality') || googleAddressPart(comps, 'postal_town') || googleAddressPart(comps, 'sublocality'),
      state: googleAddressPart(comps, 'administrative_area_level_1'),
      country: googleAddressPart(comps, 'country'),
      countryCode: googleAddressPart(comps, 'country', true),
    },
    position: { lat: loc.latitude, lng: loc.longitude },
    // Google place types ride along in `categories` so inference can read them
    categories: types.map(t => ({ id: t, name: t.replace(/_/g, ' ') })),
  };
}

/**
 * Search for places. Uses Google Places Text Search (New) when a Google key is
 * configured (better coverage); falls back to HERE otherwise.
 */
export async function searchPlaces(query: string, lat?: number, lng?: number): Promise<HereSearchResult[]> {
  if (!query.trim() || query.length < 3) return [];
  if (GOOGLE_API_KEY) return searchPlacesGoogle(query, lat, lng);
  return searchPlacesHere(query, lat, lng);
}

async function searchPlacesGoogle(query: string, lat?: number, lng?: number): Promise<HereSearchResult[]> {
  try {
    const body: Record<string, unknown> = { textQuery: query, pageSize: 6 };
    if (lat !== undefined && lng !== undefined) {
      // Bias (not restrict) results towards the user's home area
      body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } };
    }
    const res = await fetch(`${GOOGLE_PLACES}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': GOOGLE_SEARCH_FIELDS,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const places = (data.places || []) as Record<string, unknown>[];
    const results: HereSearchResult[] = [];
    for (const place of places) {
      const mapped = mapGooglePlace(place);
      if (mapped) results.push(mapped);
    }
    return results;
  } catch {
    return [];
  }
}

async function searchPlacesHere(query: string, lat?: number, lng?: number): Promise<HereSearchResult[]> {
  try {
    let url: string;
    if (lat !== undefined && lng !== undefined) {
      // Discover API — great for finding restaurants, attractions, etc. near a location
      url = `${HERE_DISCOVER}?q=${encodeURIComponent(query)}&at=${lat},${lng}&limit=6&apiKey=${HERE_API_KEY}`;
    } else {
      // Geocode API — works without location context, good for cities/addresses
      url = `${HERE_GEOCODE}?q=${encodeURIComponent(query)}&limit=6&apiKey=${HERE_API_KEY}`;
    }
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data.items || []) as Record<string, unknown>[];
    const results: HereSearchResult[] = [];
    for (const item of items) {
      const mapped = mapHereItem(item);
      if (mapped) results.push(mapped);
    }
    return results;
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<HereSearchResult | null> {
  try {
    const url = `${HERE_REVGEOCODE}?at=${lat},${lon}&apiKey=${HERE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const item = (data.items || [])[0];
    if (!item) return null;
    return mapHereItem(item);
  } catch {
    return null;
  }
}

// ── Google Maps URL parsing ──

export interface ParsedMapUrl {
  lat: number;
  lng: number;
  name?: string;
}

/**
 * Returns true for Google Maps share-link short URLs (maps.app.goo.gl etc.).
 * These have to be expanded to a long URL before parseGoogleMapsUrl can read
 * them; see resolveGoogleMapsShortUrl below.
 */
export function isGoogleMapsShortUrl(input: string): boolean {
  if (!input) return false;
  const s = input.trim().toLowerCase();
  return /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/[a-z]+\/maps)\//.test(s);
}

/**
 * Expand a maps.app.goo.gl / goo.gl short link to its full Google Maps URL
 * by calling the resolve-maps-link Supabase Edge Function. The browser can't
 * follow the redirect itself (CORS), so this is the necessary detour.
 * Returns the expanded URL, or null if the function fails or env isn't set.
 */
export async function resolveGoogleMapsShortUrl(shortUrl: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-maps-link`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ url: shortUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.expandedUrl === 'string' ? data.expandedUrl : null;
  } catch {
    return null;
  }
}

/**
 * Extract coordinates (and a place name when present) from a full Google Maps
 * URL. Short links (maps.app.goo.gl / goo.gl) must be expanded first via
 * resolveGoogleMapsShortUrl — this parser only handles the long form.
 * Returns null when no coordinates can be found.
 */
export function parseGoogleMapsUrl(input: string): ParsedMapUrl | null {
  if (!input || !input.trim()) return null;
  const url = input.trim();

  // Place name from /place/<name>/ segment (e.g. .../place/Eiffel+Tower/@...)
  let name: string | undefined;
  const placeMatch = url.match(/\/place\/([^/@?]+)/);
  if (placeMatch) {
    try {
      name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    } catch {
      name = placeMatch[1].replace(/\+/g, ' ').trim();
    }
    if (!name) name = undefined;
  }

  // Priority 1: data params !3d<lat>!4d<lng> — the actual pinned place location
  const dataMatch = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dataMatch) {
    return { lat: parseFloat(dataMatch[1]), lng: parseFloat(dataMatch[2]), name };
  }

  // Priority 2: @lat,lng — map centre (usually matches the pin)
  const atMatch = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]), name };
  }

  // Priority 3: query params q= / query= / ll= / destination= holding "lat,lng"
  const qMatch = url.match(/[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]), name };
  }

  // Bare "lat,lng" pasted on its own
  const bareMatch = url.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (bareMatch) {
    return { lat: parseFloat(bareMatch[1]), lng: parseFloat(bareMatch[2]), name };
  }

  return null;
}

// ── Place details via HERE Lookup ──

export async function fetchPlaceDetails(hereId: string): Promise<{
  categories: { id: string; name: string }[];
  openingHours?: string;
  tags: Record<string, string>;
} | null> {
  if (!hereId) return null;
  try {
    const url = `${HERE_LOOKUP}?id=${encodeURIComponent(hereId)}&apiKey=${HERE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cats = (data.categories || []) as { id: string; name: string }[];
    const oh = (data.openingHours || []) as { text?: string[] }[];

    // Build a tags-like object from HERE categories for compatibility with inferDefaults
    const tags: Record<string, string> = {};
    for (const cat of cats) {
      tags[`here_category_${cat.id}`] = cat.name;
    }
    if (data.foodTypes) tags['cuisine'] = (data.foodTypes as { name: string }[]).map(f => f.name).join(';');
    // Note: category inference now reads `here_categories`/`here_category_names` directly
    // (see inference.ts Layer 1/2). We no longer synthesise OSM-style amenity/tourism/leisure
    // tags from HERE IDs — that shim was built on HERE's old Places taxonomy and mislabelled
    // common places (e.g. bars → museum). OSM tags remain only as a legacy fallback (Layer 4)
    // for items saved before the HERE migration.

    // Store raw HERE category data for direct inference (more reliable than OSM-translated tags)
    if (cats.length > 0) {
      tags['here_categories'] = cats.map(c => c.id).join(',');
      tags['here_category_names'] = cats.map(c => c.name.toLowerCase()).join(',');
    }

    return {
      categories: cats,
      openingHours: oh[0]?.text?.[0],
      tags,
    };
  } catch {
    return null;
  }
}

// ── Google place details: opening hours + photos ──

type GooglePeriod = {
  open?: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
};

const OSM_DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Convert Google opening periods into the OSM-style string the app's parser understands. */
function googlePeriodsToOsm(periods: GooglePeriod[] | undefined): string | undefined {
  if (!periods || periods.length === 0) return undefined;
  const pad = (n: number) => String(n ?? 0).padStart(2, '0');
  const byDay: Record<number, string[]> = {};
  for (const p of periods) {
    if (!p.open) continue;
    // A single open period with no close = open 24/7
    if (!p.close && periods.length === 1) return '24/7';
    const start = `${pad(p.open.hour)}:${pad(p.open.minute)}`;
    const end = p.close ? `${pad(p.close.hour)}:${pad(p.close.minute)}` : '24:00';
    (byDay[p.open.day] ||= []).push(`${start}-${end}`);
  }
  const parts: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const day = i % 7; // Mo..Su order; Google uses 0 = Sunday
    if (byDay[day]) parts.push(`${OSM_DAY_CODES[day]} ${byDay[day].join(',')}`);
  }
  return parts.length > 0 ? parts.join('; ') : undefined;
}

/**
 * Fetch opening hours for a Google place. `regularOpeningHours` is an
 * ENTERPRISE-tier field (only 1,000 free calls/month) — call this once per
 * added place, never in a loop or at display time.
 */
export async function fetchGooglePlaceOpeningHours(placeId: string): Promise<string | undefined> {
  if (!GOOGLE_API_KEY || !placeId) return undefined;
  try {
    const res = await fetch(`${GOOGLE_PLACES}/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'regularOpeningHours' },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    return googlePeriodsToOsm(data.regularOpeningHours?.periods as GooglePeriod[] | undefined);
  } catch {
    return undefined;
  }
}

// Per Google ToS we persist ONLY the place_id. Photo references and photo URLs
// expire and must not be stored — fetch fresh at display time. The in-memory
// session cache below keeps repeat views within a session free.
const googlePhotoCache = new Map<string, string | null>();

/**
 * Fetch a fresh photo URL for a Google place (2 API calls on first view per
 * session: Place Details `photos` field + one photo media call — the media
 * call is the scarce one at 1,000 free/month, so this is only used on the
 * item detail view, not on list cards).
 */
export async function fetchGooglePlacePhoto(placeId: string): Promise<string | null> {
  if (!GOOGLE_API_KEY || !placeId) return null;
  const cached = googlePhotoCache.get(placeId);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`${GOOGLE_PLACES}/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'photos' },
    });
    if (!res.ok) { googlePhotoCache.set(placeId, null); return null; }
    const data = await res.json();
    const photoName = (data.photos as { name?: string }[] | undefined)?.[0]?.name;
    if (!photoName) { googlePhotoCache.set(placeId, null); return null; }

    const mediaRes = await fetch(
      `${GOOGLE_PLACES}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${GOOGLE_API_KEY}`,
    );
    if (!mediaRes.ok) { googlePhotoCache.set(placeId, null); return null; }
    const media = await mediaRes.json();
    const uri = (media.photoUri as string) || null;
    googlePhotoCache.set(placeId, uri);
    return uri;
  } catch {
    googlePhotoCache.set(placeId, null);
    return null;
  }
}

/** True when the Google Places integration is configured (key present). */
export const GOOGLE_PLACES_ENABLED = !!GOOGLE_API_KEY;

/**
 * Find the Google place_id for an already-saved place by name + coordinates.
 * Used by the one-time "Refresh place photos" tool in Settings to backfill
 * items saved before the Google integration. One Text Search (Pro tier) per
 * call. The top result is only accepted when it sits within 1 km of the
 * stored coordinates, so a same-name venue in another city can't slip through.
 */
export async function findGooglePlaceId(name: string, lat: number, lng: number): Promise<string | null> {
  if (!GOOGLE_API_KEY || !name.trim()) return null;
  try {
    const res = await fetch(`${GOOGLE_PLACES}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.location',
      },
      body: JSON.stringify({
        textQuery: name,
        pageSize: 1,
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const place = (data.places || [])[0] as { id?: string; location?: { latitude: number; longitude: number } } | undefined;
    if (!place?.id || !place.location) return null;
    const distKm = haversineDistanceKm(lat, lng, place.location.latitude, place.location.longitude);
    return distKm <= 1 ? place.id : null;
  } catch {
    return null;
  }
}

// ── Travel time via HERE Routing ──

// Average speeds (km/h) for fallback estimates when HERE fails (NOT when HERE
// returns "no route" — that's stored as null and rendered as "Not practical").
const MODE_SPEEDS: Record<TransportMode, number> = {
  walk: 5,
  bike: 15,
  car: 60,
  transit: 30,
};

// Haversine straight-line distance in km
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Next upcoming Tuesday at 10:30 in the user's local timezone, returned as
 * an ISO-8601 string with timezone offset (e.g. "2026-06-23T10:30:00+02:00").
 * HERE Transit accepts this format and uses it as the requested departure.
 * Why off-peak Tuesday: it's a representative weekday with normal schedule
 * coverage, far from rush-hour peaks. Computed at call time so the date
 * rolls forward naturally as the calendar advances.
 */
function nextTuesdayMidMorningIso(now: Date = new Date()): string {
  const d = new Date(now);
  const targetDay = 2; // Tuesday (0=Sun)
  let daysAhead = (targetDay - d.getDay() + 7) % 7;
  // If today is Tuesday and it's already past 10:30, jump to next week
  if (daysAhead === 0 && (d.getHours() > 10 || (d.getHours() === 10 && d.getMinutes() >= 30))) {
    daysAhead = 7;
  }
  d.setDate(d.getDate() + daysAhead);
  d.setHours(10, 30, 0, 0);
  // Build ISO string with the local timezone offset (HERE wants ±HH:MM, not Z)
  const pad = (n: number) => String(n).padStart(2, '0');
  const tzOffsetMin = -d.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const tzH = pad(Math.floor(Math.abs(tzOffsetMin) / 60));
  const tzM = pad(Math.abs(tzOffsetMin) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${tzH}:${tzM}`;
}

/**
 * Result of a single-mode routing call:
 *  - { minutes: N }          → HERE found a route
 *  - { minutes: N, fallback: true } → HERE failed; haversine × speed estimate
 *  - { minutes: null }       → HERE returned no routes (e.g. transit not practical)
 */
type ModeResult = { minutes: number | null; fallback?: boolean; distanceKm?: number };

const HERE_MODE_PARAM: Record<TransportMode, string> = {
  walk: 'pedestrian',
  bike: 'bicycle',
  car: 'car',
  transit: 'transit',
};

async function fetchHereRoute(
  mode: TransportMode,
  origin: string,
  destination: string,
): Promise<{ ok: true; minutes: number | null; distanceKm: number | null } | { ok: false }> {
  try {
    let url: string;
    if (mode === 'transit') {
      const departure = encodeURIComponent(nextTuesdayMidMorningIso());
      // HERE Transit doesn't return travelSummary fields by default — you have
      // to opt in. Without this, every section came back with no duration,
      // so we summed 0+0+0 and stored "0 minutes by transit". Asking for
      // travelSummary populates the duration/length we read below.
      url = `${HERE_TRANSIT}?origin=${origin}&destination=${destination}&departureTime=${departure}&return=travelSummary&apiKey=${HERE_API_KEY}`;
    } else {
      url = `${HERE_ROUTE}?transportMode=${HERE_MODE_PARAM[mode]}&origin=${origin}&destination=${destination}&return=summary&apiKey=${HERE_API_KEY}`;
    }

    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    const data = await res.json();

    const route = data.routes?.[0];
    if (!route) {
      // HERE returned 200 with empty routes — this is a real "no practical
      // route" answer (most common for transit), not a transport failure.
      return { ok: true, minutes: null, distanceKm: null };
    }

    const sections = route.sections || [];
    let totalSeconds = 0;
    let totalMeters = 0;
    for (const section of sections) {
      if (section.summary) {
        totalSeconds += section.summary.duration || 0;
        totalMeters += section.summary.length || 0;
      } else if (section.travelSummary) {
        totalSeconds += section.travelSummary.duration || 0;
        totalMeters += section.travelSummary.length || 0;
      }
    }

    // Belt-and-braces fallback: if we somehow got a route with no summaries,
    // derive the duration from the first section's departure and the last
    // section's arrival. These timestamps are always present on transit routes
    // and almost always on routing v8 too.
    if (totalSeconds === 0 && sections.length > 0) {
      const dep = sections[0]?.departure?.time;
      const arr = sections[sections.length - 1]?.arrival?.time;
      if (dep && arr) {
        totalSeconds = Math.max(0, (new Date(arr).getTime() - new Date(dep).getTime()) / 1000);
      }
    }

    const minutes = Math.round(totalSeconds / 60);
    // Transit returning 0 minutes between distinct points is never a real
    // answer — treat it as "no practical route" so the UI shows the proper
    // "Not practical by transit" label instead of a misleading "0 min".
    if (mode === 'transit' && minutes === 0) {
      return { ok: true, minutes: null, distanceKm: null };
    }

    return {
      ok: true,
      minutes,
      distanceKm: Math.round(totalMeters / 100) / 10,
    };
  } catch {
    return { ok: false };
  }
}

function haversineFallback(
  mode: TransportMode,
  homeLat: number, homeLng: number,
  placeLat: number, placeLng: number,
): ModeResult {
  const straightLine = haversineDistanceKm(homeLat, homeLng, placeLat, placeLng);
  const distanceKm = Math.round(straightLine * 13) / 10;
  // Spec for transit fallback is haversine × 2.5; others use haversine × 1.3 (already in distanceKm) ÷ speed.
  const minutes = mode === 'transit'
    ? Math.round(straightLine * 2.5)
    : Math.round((distanceKm / MODE_SPEEDS[mode]) * 60);
  return { minutes, fallback: true, distanceKm };
}

/**
 * Compute all 4 transport-mode travel times in one parallel call. Used by
 * AddPlace (single item) and Settings (batch on home change). Returns:
 *   walk/bike/car: number minutes (always non-null after fallback)
 *   transit: number minutes OR null (null = HERE returned no routes)
 *   distanceKm: straight-line × 1.3 used when HERE is unreachable
 *
 * Why nulls only on transit: walking and cycling routes effectively always
 * exist (worst case: long), and a car route is plausible for any reachable
 * place. Transit is the only mode where "no practical route" is a real,
 * useful answer (rural pin, weekend skeleton service, etc.).
 */
export async function calculateAllModesTravel(
  homeLat: number, homeLng: number,
  placeLat: number, placeLng: number,
): Promise<{
  walkMinutes: number | null;
  bikeMinutes: number | null;
  carMinutes: number | null;
  transitMinutes: number | null;
  distanceKm: number;
}> {
  const origin = `${homeLat},${homeLng}`;
  const destination = `${placeLat},${placeLng}`;

  const [walk, bike, car, transit] = await Promise.all([
    fetchHereRoute('walk', origin, destination),
    fetchHereRoute('bike', origin, destination),
    fetchHereRoute('car', origin, destination),
    fetchHereRoute('transit', origin, destination),
  ]);

  const haversine = haversineDistanceKm(homeLat, homeLng, placeLat, placeLng);
  const haversineKmRounded = Math.round(haversine * 13) / 10;

  // Prefer HERE's reported car distance when we have one — it's a real road
  // distance, not straight-line. Falls back to haversine × 1.3 otherwise.
  const distanceKm = (car.ok && car.distanceKm) || haversineKmRounded;

  const resolve = (mode: TransportMode, r: typeof walk): number | null => {
    if (r.ok) return r.minutes; // may be null for transit when no route
    return haversineFallback(mode, homeLat, homeLng, placeLat, placeLng).minutes;
  };

  return {
    walkMinutes: resolve('walk', walk),
    bikeMinutes: resolve('bike', bike),
    carMinutes: resolve('car', car),
    transitMinutes: resolve('transit', transit),
    distanceKm,
  };
}

/**
 * Run calculateAllModesTravel for many items in parallel batches. Used by
 * Settings when home location changes and by the "Refresh travel times"
 * button. CONCURRENCY=3 → 12 parallel HERE calls (4 modes × 3 items).
 */
export async function calculateBatchAllModes(
  homeLat: number, homeLng: number,
  items: { id: string; latitude: number; longitude: number }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, Awaited<ReturnType<typeof calculateAllModesTravel>>>> {
  const CONCURRENCY = 3;
  const results: Record<string, Awaited<ReturnType<typeof calculateAllModesTravel>>> = {};
  let done = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (item) => {
      results[item.id] = await calculateAllModesTravel(homeLat, homeLng, item.latitude, item.longitude);
      done += 1;
      onProgress?.(done, items.length);
    });
    await Promise.all(promises);
  }
  return results;
}

// ── Weather (Open-Meteo — unchanged) ──

function classifyWeatherCode(code: number): { type: WeatherType; description: string } {
  if (code <= 1) return { type: 'sunny', description: 'Clear sky' };
  if (code <= 3) return { type: 'cloudy', description: 'Partly cloudy' };
  if (code <= 48) return { type: 'foggy', description: 'Foggy' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
    return { type: 'rainy', description: code >= 95 ? 'Thunderstorm' : code >= 80 ? 'Rain showers' : 'Rainy' };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { type: 'snowy', description: 'Snowy' };
  }
  return { type: 'cloudy', description: 'Overcast' };
}

// Tokenise a place/article name for fuzzy match. Lowercases, strips punctuation,
// drops generic stopwords ("the", "cafe", "restaurant"…) that match too eagerly.
const NAME_STOPWORDS = new Set([
  'the','a','an','of','at','on','in','und','und.','&','-',
  'cafe','café','restaurant','bar','hotel','park','garten','garden',
  'museum','kirche','church','platz','strasse','straße','street','road',
  'haus','house','st','st.','saint','sankt','san','santa',
]);
function nameTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !NAME_STOPWORDS.has(t)),
  );
}

// Fetch place image from Wikidata/Wikipedia. Returns null when no trustworthy
// photo is found — callers render PlaceholderImage instead of a broken image.
export async function fetchPlaceImage(tags: Record<string, string>, lat: number, lng: number): Promise<string | null> {
  // Try 1: Wikidata → get image
  const wikidataId = tags['wikidata'];
  if (wikidataId) {
    try {
      const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=claims&format=json&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const entity = data.entities?.[wikidataId];
        const imageClaim = entity?.claims?.P18?.[0];
        const filename = imageClaim?.mainsnak?.datavalue?.value;
        if (filename) {
          return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=400`;
        }
      }
    } catch { /* fall through */ }
  }

  // Try 2: Wikipedia page image
  const wikipedia = tags['wikipedia'];
  if (wikipedia) {
    try {
      const parts = wikipedia.includes(':') ? wikipedia.split(':') : ['en', wikipedia];
      const lang = parts[0];
      const title = parts.slice(1).join(':');
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=400&format=json&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages) {
          const page = Object.values(pages)[0] as { thumbnail?: { source: string } };
          if (page?.thumbnail?.source) return page.thumbnail.source;
        }
      }
    } catch { /* fall through */ }
  }

  // Try 3: Search Wikipedia by place name. To avoid the old failure mode (a
  // venue named after a person returning that person's photo, or a same-name
  // place in another city), we require BOTH:
  //   (a) the article is geotagged within ~3km of the place, AND
  //   (b) the article title shares a non-stopword token with the place name.
  try {
    const placeName = tags['name'] || '';
    if (placeName) {
      const placeTokens = nameTokens(placeName);
      if (placeTokens.size === 0) return null; // nothing distinctive to match on
      const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(placeName)}&gsrlimit=5&prop=pageimages|coordinates&pithumbsize=400&format=json&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages as Record<string, {
          title?: string;
          thumbnail?: { source: string };
          coordinates?: { lat: number; lon: number }[];
        }> | undefined;
        if (pages) {
          const MAX_KM = 3; // tight enough to reject a same-name venue across town
          for (const page of Object.values(pages)) {
            const coord = page.coordinates?.[0];
            if (!page.thumbnail?.source || !coord || !page.title) continue;
            const distKm = haversineDistanceKm(lat, lng, coord.lat, coord.lon);
            if (distKm > MAX_KM) continue;
            // Title must share at least one meaningful token with the place name
            const titleTokens = nameTokens(page.title);
            let overlap = false;
            for (const t of titleTokens) { if (placeTokens.has(t)) { overlap = true; break; } }
            if (overlap) return page.thumbnail.source;
          }
        }
      }
    }
  } catch { /* fall through */ }

  // No trustworthy photo found. Caller should render PlaceholderImage.
  return null;
}

export async function fetchWeatherForecast(lat: number, lng: number): Promise<WeatherForecast[]> {
  try {
    const url = `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const daily = data.daily;
    if (!daily) return [];
    return daily.time.map((date: string, i: number) => {
      const { type, description } = classifyWeatherCode(daily.weathercode[i]);
      return {
        date,
        weatherCode: daily.weathercode[i],
        weatherType: type,
        tempMax: Math.round(daily.temperature_2m_max[i]),
        tempMin: Math.round(daily.temperature_2m_min[i]),
        precipitation: daily.precipitation_sum[i],
        description,
      };
    });
  } catch {
    return [];
  }
}
