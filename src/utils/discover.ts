import { supabase } from './supabase';
import type { BucketListItem, Category, UserProfile, HereSearchResult } from '../types';

/**
 * Discover feed data layer — two organic sources, zero paid APIs:
 *
 *  1. Community: places other Lark users have saved, aggregated anonymously
 *     by the `get_community_places` security-definer function (migration v4).
 *     Only public fields + a save count; 2+ distinct savers required (privacy).
 *
 *  2. Wikidata: notable places near the user, ranked by sitelink count
 *     (number of Wikipedia language editions — our stand-in for ratings).
 *     Wikidata is CC0, so results are cached in the shared `discover_cache`
 *     table in Supabase and one fetch serves every user, forever.
 *
 *  HERE and Google data must NEVER enter this feed or the cache — their ToS
 *  forbid shared caching (see docs/MONETIZATION.md). They come into play only
 *  after a feed item is saved, via the normal AddPlace flow.
 */

export interface DiscoverPlace {
  key: string;                       // Wikidata QID or community place key
  source: 'community' | 'wikidata';
  name: string;
  latitude: number;
  longitude: number;
  category: Category;
  imageUrl?: string;
  city?: string;
  country?: string;
  saveCount?: number;                // community: distinct users who saved it
  sitelinks?: number;                // wikidata: notability proxy
  distanceKm: number;                // straight-line from home
}

/** Convert a discover place into the search-result shape AddPlace expects. */
export function toSearchResult(p: DiscoverPlace): HereSearchResult {
  return {
    id: '',
    title: p.name,
    address: {
      label: [p.name, p.city, p.country].filter(Boolean).join(', '),
      city: p.city,
      country: p.country,
    },
    position: { lat: p.latitude, lng: p.longitude },
    categories: [],
  };
}

const RADIUS_KM = 100;
const CACHE_MAX_AGE_DAYS = 60;       // CC0 data; refresh just to pick up improvements
const PER_CATEGORY_LIMIT = 20;
const MIN_SITELINKS = 2;             // drop barely-documented places

// Wikidata P31 classes per Lark category. Direct instances only — the big
// subclass trees time out inside the geo service, so we list the classes that
// actually matter for a bucket list.
const WIKIDATA_GROUPS: { category: Category; classes: string[] }[] = [
  { category: 'museum_gallery', classes: ['Q33506', 'Q207694'] },                       // museum, art museum
  { category: 'historical', classes: ['Q23413', 'Q16560', 'Q751876', 'Q44613', 'Q839954'] }, // castle, palace, château, monastery, archaeological site
  { category: 'nature_landscape', classes: ['Q23397', 'Q8502', 'Q34038', 'Q150784', 'Q35509'] }, // lake, mountain, waterfall, canyon, cave
  { category: 'park_garden', classes: ['Q22698', 'Q167346', 'Q1107656'] },              // park, botanical garden, garden
  { category: 'zoo_aquarium', classes: ['Q43501', 'Q2281788'] },                        // zoo, public aquarium
  { category: 'entertainment', classes: ['Q194195'] },                                  // amusement park
];

// ── Helpers ──

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** ~50 km grid cell so nearby users share one cached Wikidata fetch. */
function cellFor(lat: number, lng: number): string {
  return `${(Math.round(lat * 2) / 2).toFixed(1)},${(Math.round(lng * 2) / 2).toFixed(1)}`;
}

// ── Wikidata layer ──

interface CachedPlace {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  sitelinks: number;
}

function buildSparql(category: { category: Category; classes: string[] }, lat: number, lng: number): string {
  const values = category.classes.map(q => `wd:${q}`).join(' ');
  return `SELECT ?item ?itemLabel ?lat ?lon ?image ?sitelinks WHERE {
  VALUES ?class { ${values} }
  ?item wdt:P31 ?class .
  SERVICE wikibase:around {
    ?item wdt:P625 ?location .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${RADIUS_KM}" .
  }
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  OPTIONAL { ?item wdt:P18 ?image . }
  BIND(geof:latitude(?location) AS ?lat)
  BIND(geof:longitude(?location) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de" . }
}
ORDER BY DESC(?sitelinks)
LIMIT ${PER_CATEGORY_LIMIT}`;
}

async function queryWikidata(sparql: string): Promise<CachedPlace[]> {
  try {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
      },
      body: `query=${encodeURIComponent(sparql)}`,
    });
    if (!res.ok) return [];
    const json = await res.json();
    const bindings: Record<string, { value: string }>[] = json?.results?.bindings || [];
    const places: CachedPlace[] = [];
    for (const b of bindings) {
      const qid = b.item?.value?.split('/').pop();
      const label = b.itemLabel?.value;
      if (!qid || !label || /^Q\d+$/.test(label)) continue; // skip unlabelled items
      places.push({
        key: qid,
        name: label,
        latitude: parseFloat(b.lat?.value || '0'),
        longitude: parseFloat(b.lon?.value || '0'),
        imageUrl: b.image?.value
          ? `${b.image.value.replace('http://', 'https://')}?width=640`
          : undefined,
        sitelinks: parseInt(b.sitelinks?.value || '0', 10),
      });
    }
    return places;
  } catch {
    return [];
  }
}

/**
 * Wikidata places for one grid cell, via the shared Supabase cache.
 * First visitor to a cell pays ~6 free SPARQL queries; everyone after reads
 * the cache. CC0 licensing makes this legal — never do this with HERE/Google.
 */
async function getWikidataPlaces(homeLat: number, homeLng: number): Promise<DiscoverPlace[]> {
  const cell = cellFor(homeLat, homeLng);

  const { data: cachedRows } = await supabase
    .from('discover_cache')
    .select('category, results, fetched_at')
    .eq('cell', cell);

  const fresh = new Map<string, CachedPlace[]>();
  const maxAgeMs = CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const row of cachedRows || []) {
    if (Date.now() - new Date(row.fetched_at).getTime() < maxAgeMs) {
      fresh.set(row.category, row.results as CachedPlace[]);
    }
  }

  // Fetch any missing/stale category groups from Wikidata and cache them for everyone
  const missing = WIKIDATA_GROUPS.filter(g => !fresh.has(g.category));
  if (missing.length > 0) {
    const fetched = await Promise.all(
      missing.map(async group => ({
        group,
        places: await queryWikidata(buildSparql(group, homeLat, homeLng)),
      })),
    );
    for (const { group, places } of fetched) {
      fresh.set(group.category, places);
      // Best-effort cache write; the feed still works if it fails
      supabase
        .from('discover_cache')
        .upsert({ cell, category: group.category, results: places, fetched_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('discover_cache write failed:', error.message);
        });
    }
  }

  const out: DiscoverPlace[] = [];
  const seen = new Set<string>();
  for (const group of WIKIDATA_GROUPS) {
    for (const p of fresh.get(group.category) || []) {
      if (seen.has(p.key)) continue; // a place can match several groups
      seen.add(p.key);
      out.push({
        key: p.key,
        source: 'wikidata',
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        category: group.category,
        imageUrl: p.imageUrl,
        sitelinks: p.sitelinks,
        distanceKm: Math.round(haversineKm(homeLat, homeLng, p.latitude, p.longitude)),
      });
    }
  }
  return out;
}

// ── Community layer ──

async function getCommunityPlaces(homeLat: number, homeLng: number): Promise<DiscoverPlace[]> {
  const { data, error } = await supabase.rpc('get_community_places', {
    center_lat: homeLat,
    center_lng: homeLng,
    radius_km: RADIUS_KM,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(row => ({
    key: String(row.place_key),
    source: 'community' as const,
    name: String(row.name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    category: (row.category as Category) || 'neighbourhood_walks',
    imageUrl: (row.photo_url as string) || undefined,
    city: (row.city as string) || undefined,
    country: (row.country as string) || undefined,
    saveCount: Number(row.save_count),
    distanceKm: Math.round(haversineKm(homeLat, homeLng, Number(row.latitude), Number(row.longitude))),
  }));
}

// ── Combined feed ──

function isAlreadySaved(place: DiscoverPlace, items: BucketListItem[]): boolean {
  const placeName = place.name.trim().toLowerCase();
  return items.some(
    i =>
      i.name.trim().toLowerCase() === placeName ||
      haversineKm(i.latitude, i.longitude, place.latitude, place.longitude) < 0.15,
  );
}

// Session-level memoisation: switching between Dashboard and Discover
// shouldn't refetch. Cleared on page reload.
const sessionCache = new Map<string, DiscoverPlace[]>();

/**
 * The organic discover feed: community saves first (most loved first),
 * then Wikidata notables (most famous first), minus anything already
 * on the user's own list.
 */
export async function getDiscoverPlaces(
  profile: UserProfile,
  savedItems: BucketListItem[],
): Promise<DiscoverPlace[]> {
  const cacheKey = cellFor(profile.homeLatitude, profile.homeLongitude);
  let all = sessionCache.get(cacheKey);

  if (!all) {
    const [community, wikidata] = await Promise.all([
      getCommunityPlaces(profile.homeLatitude, profile.homeLongitude),
      getWikidataPlaces(profile.homeLatitude, profile.homeLongitude),
    ]);

    // Drop Wikidata entries that duplicate a community place
    const deduped = wikidata.filter(
      w => !community.some(c => haversineKm(c.latitude, c.longitude, w.latitude, w.longitude) < 0.15),
    );

    community.sort((a, b) => (b.saveCount || 0) - (a.saveCount || 0));
    deduped.sort((a, b) => (b.sitelinks || 0) - (a.sitelinks || 0));
    all = [...community, ...deduped];
    sessionCache.set(cacheKey, all);
  }

  return all.filter(p => !isAlreadySaved(p, savedItems));
}
