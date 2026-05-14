import type { NominatimResult, WeatherForecast, WeatherType } from '../types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OSM_API_BASE = 'https://api.openstreetmap.org/api/0.6';
const OSRM_BASE = 'https://router.project-osrm.org';
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

// Rate limiting for Nominatim (1 req/sec)
let lastNominatimCall = 0;
async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastNominatimCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimCall = Date.now();
  return fetch(url);
}

export async function searchPlaces(query: string): Promise<NominatimResult[]> {
  if (!query.trim() || query.length < 3) return [];
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=5`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) return [];
  return res.json();
}

export async function reverseGeocode(lat: number, lon: number): Promise<NominatimResult | null> {
  const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchOsmTags(osmType: string, osmId: number): Promise<Record<string, string>> {
  const typeMap: Record<string, string> = { N: 'node', W: 'way', R: 'relation', node: 'node', way: 'way', relation: 'relation' };
  const type = typeMap[osmType] || osmType;
  try {
    const res = await fetch(`${OSM_API_BASE}/${type}/${osmId}.json`);
    if (!res.ok) return {};
    const data = await res.json();
    const elements = data.elements || [];
    return elements[0]?.tags || {};
  } catch {
    return {};
  }
}

export async function calculateTravelTime(
  homeLat: number, homeLng: number,
  placeLat: number, placeLng: number,
  mode: string = 'driving'
): Promise<{ durationMinutes: number; distanceKm: number }> {
  const modeMap: Record<string, string> = {
    car: 'driving', bike: 'cycling', walk: 'foot', transit: 'driving'
  };
  const osrmMode = modeMap[mode] || 'driving';
  try {
    const url = `${OSRM_BASE}/route/v1/${osrmMode}/${homeLng},${homeLat};${placeLng},${placeLat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return { durationMinutes: 0, distanceKm: 0 };
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return { durationMinutes: 0, distanceKm: 0 };
    let minutes = Math.round(route.duration / 60);
    // Rough transit estimate
    if (mode === 'transit') minutes = Math.round(minutes * 1.5);
    return {
      durationMinutes: minutes,
      distanceKm: Math.round(route.distance / 100) / 10,
    };
  } catch {
    return { durationMinutes: 0, distanceKm: 0 };
  }
}

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
