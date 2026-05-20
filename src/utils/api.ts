import type { HereSearchResult, WeatherForecast, WeatherType } from '../types';

const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY || '';
const HERE_DISCOVER = 'https://discover.search.hereapi.com/v1/discover';
const HERE_GEOCODE = 'https://geocode.search.hereapi.com/v1/geocode';
const HERE_REVGEOCODE = 'https://revgeocode.search.hereapi.com/v1/revgeocode';
const HERE_LOOKUP = 'https://lookup.search.hereapi.com/v1/lookup';
const HERE_ROUTE = 'https://router.hereapi.com/v8/routes';
const HERE_TRANSIT = 'https://transit.router.hereapi.com/v8/routes';
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

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

/**
 * Search for places using HERE APIs.
 * When lat/lng are provided, uses the Discover API (best for POI search near a location).
 * Without lat/lng, uses the Geocode API (works globally for cities/addresses).
 */
export async function searchPlaces(query: string, lat?: number, lng?: number): Promise<HereSearchResult[]> {
  if (!query.trim() || query.length < 3) return [];
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
      // Map common HERE categories to OSM-like tag keys for inference.ts compatibility
      const catId = cat.id;
      if (catId.startsWith('100-')) tags['amenity'] = mapHereCatToOsmAmenity(catId);
      if (catId.startsWith('200-')) tags['tourism'] = mapHereCatToOsmTourism(catId);
      if (catId.startsWith('300-')) tags['leisure'] = mapHereCatToOsmLeisure(catId);
      if (catId.startsWith('550-')) tags['leisure'] = 'park';
      if (catId.startsWith('350-')) tags['sport'] = 'yes';
    }
    if (data.foodTypes) tags['cuisine'] = (data.foodTypes as { name: string }[]).map(f => f.name).join(';');

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

// Map HERE category IDs to OSM-like amenity values for inference.ts
function mapHereCatToOsmAmenity(catId: string): string {
  if (catId === '100-1000-0000') return 'restaurant';
  if (catId === '100-1000-0001') return 'restaurant'; // casual dining
  if (catId === '100-1000-0002') return 'fast_food';
  if (catId === '100-1000-0003') return 'cafe';
  if (catId === '100-1000-0004') return 'pub';
  if (catId === '100-1000-0007') return 'biergarten';
  if (catId === '100-1000-0008') return 'bar';
  if (catId === '100-1100-0010') return 'cinema';
  if (catId === '100-1100-0000') return 'arts_centre';
  return 'restaurant';
}

function mapHereCatToOsmTourism(catId: string): string {
  if (catId === '200-2000-0011') return 'museum';
  if (catId === '200-2000-0014') return 'gallery';
  if (catId === '200-2000-0000') return 'attraction';
  if (catId === '200-2300-0000') return 'zoo';
  if (catId === '200-2000-0012') return 'viewpoint';
  if (catId === '200-2200-0000') return 'theme_park';
  return 'attraction';
}

function mapHereCatToOsmLeisure(catId: string): string {
  if (catId === '300-3000-0000') return 'park';
  if (catId === '300-3100-0000') return 'spa';
  if (catId === '300-3200-0000') return 'swimming_area';
  return 'park';
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

  // Try 3: Search Wikipedia by place name for an image
  try {
    const placeName = tags['name'] || '';
    if (placeName) {
      const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(placeName)}&gsrlimit=1&prop=pageimages&pithumbsize=400&format=json&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages) {
          const page = Object.values(pages)[0] as { thumbnail?: { source: string } };
          if (page?.thumbnail?.source) return page.thumbnail.source;
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
