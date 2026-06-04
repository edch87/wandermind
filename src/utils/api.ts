import type { HereSearchResult, WeatherForecast, WeatherType } from '../types';

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
 * Extract coordinates (and a place name when present) from a Google Maps URL.
 * Handles the common full-length formats. Does NOT resolve shortened
 * maps.app.goo.gl / goo.gl links — those carry no coordinates and would need a
 * server-side redirect to expand (browser fetch is blocked by CORS).
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

// Average speeds (km/h) for fallback estimates
const MODE_SPEEDS: Record<string, number> = {
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

function hereTransportMode(mode: string): { endpoint: string; transportMode: string } {
  switch (mode) {
    case 'walk':
      return { endpoint: HERE_ROUTE, transportMode: 'pedestrian' };
    case 'bike':
      return { endpoint: HERE_ROUTE, transportMode: 'bicycle' };
    case 'transit':
      return { endpoint: HERE_TRANSIT, transportMode: 'transit' };
    case 'car':
    default:
      return { endpoint: HERE_ROUTE, transportMode: 'car' };
  }
}

export async function calculateTravelTime(
  homeLat: number, homeLng: number,
  placeLat: number, placeLng: number,
  mode: string = 'car'
): Promise<{ durationMinutes: number; distanceKm: number }> {
  try {
    const { endpoint, transportMode } = hereTransportMode(mode);
    const origin = `${homeLat},${homeLng}`;
    const destination = `${placeLat},${placeLng}`;

    let url: string;
    if (mode === 'transit') {
      // Transit routing uses a different API structure
      url = `${endpoint}?origin=${origin}&destination=${destination}&apiKey=${HERE_API_KEY}`;
    } else {
      url = `${endpoint}?transportMode=${transportMode}&origin=${origin}&destination=${destination}&return=summary&apiKey=${HERE_API_KEY}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HERE routing failed: ${res.status}`);
    const data = await res.json();

    const route = data.routes?.[0];
    if (!route) throw new Error('No route found');

    // HERE returns sections within a route
    const sections = route.sections || [];
    let totalSeconds = 0;
    let totalMeters = 0;

    for (const section of sections) {
      if (section.summary) {
        totalSeconds += section.summary.duration || 0;
        totalMeters += section.summary.length || 0;
      } else if (section.travelSummary) {
        // Transit routes use travelSummary
        totalSeconds += section.travelSummary.duration || 0;
        totalMeters += section.travelSummary.length || 0;
      }
    }

    return {
      durationMinutes: Math.round(totalSeconds / 60),
      distanceKm: Math.round(totalMeters / 100) / 10,
    };
  } catch {
    // Fallback: straight-line distance × 1.3
    const straightLine = haversineDistanceKm(homeLat, homeLng, placeLat, placeLng);
    const distanceKm = Math.round(straightLine * 13) / 10;
    const speed = MODE_SPEEDS[mode] || MODE_SPEEDS.car;
    const minutes = Math.round((distanceKm / speed) * 60);
    return { durationMinutes: minutes, distanceKm };
  }
}

/**
 * Calculate travel times for multiple items in parallel via HERE Routing.
 * Returns a map of itemId → { durationMinutes, distanceKm }.
 */
export async function calculateBatchTravelTimes(
  originLat: number,
  originLng: number,
  items: { id: string; latitude: number; longitude: number }[],
  mode: string = 'car'
): Promise<Record<string, { durationMinutes: number; distanceKm: number }>> {
  const CONCURRENCY = 5;
  const results: Record<string, { durationMinutes: number; distanceKm: number }> = {};

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (item) => {
      const travel = await calculateTravelTime(originLat, originLng, item.latitude, item.longitude, mode);
      results[item.id] = travel;
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

// Fetch place image from Wikidata/Wikipedia (unchanged — still works with any geocoding provider)
export async function fetchPlaceImage(tags: Record<string, string>, lat: number, lng: number): Promise<string> {
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

  // Try 3: Search Wikipedia by place name, but only trust a result whose article
  // is geotagged near the actual place. This prevents the old failure mode where a
  // venue named after a person returned that person's photo (people have no coords),
  // and rejects same-name places in other locations.
  try {
    const placeName = tags['name'] || '';
    if (placeName) {
      const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(placeName)}&gsrlimit=5&prop=pageimages|coordinates&pithumbsize=400&format=json&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages as Record<string, {
          thumbnail?: { source: string };
          coordinates?: { lat: number; lon: number }[];
        }> | undefined;
        if (pages) {
          const MAX_KM = 30; // article must be geographically near the place
          for (const page of Object.values(pages)) {
            const coord = page.coordinates?.[0];
            if (page.thumbnail?.source && coord) {
              const distKm = haversineDistanceKm(lat, lng, coord.lat, coord.lon);
              if (distKm <= MAX_KM) return page.thumbnail.source;
            }
          }
        }
      }
    }
  } catch { /* fall through */ }

  // Fallback: Static map tile from HERE
  return `https://image.maps.hereapi.com/mia/v3/base/mc/${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100},14/400/300/png8?apiKey=${HERE_API_KEY}`;
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
