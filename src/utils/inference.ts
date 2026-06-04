import type { Category, Setting, WeatherSuitability, DurationEstimate, CostLevel, Season, TimeOfDay, GroupType } from '../types';

interface InferredDefaults {
  category: Category;
  /** True when no rule confidently matched and we fell back to a default.
   *  Used by the Add-a-place review screen to nudge the user to confirm. */
  categoryUncertain: boolean;
  setting: Setting;
  weatherSuitability: WeatherSuitability;
  durationEstimate: DurationEstimate;
  costLevel: CostLevel;
  bestSeasons: Season[];
  bestTimesOfDay: TimeOfDay[];
  groupSuitability: GroupType[];
  dogFriendly?: boolean;
  wheelchairAccessible?: boolean;
}

const CATEGORY_DEFAULTS: Record<Category, Omit<InferredDefaults, 'category' | 'categoryUncertain' | 'dogFriendly' | 'wheelchairAccessible'>> = {
  museum_gallery:      { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: 'half_day', costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family','kids'] },
  historical:          { setting: 'mixed',   weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'cheap',    bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family'] },
  nature_landscape:    { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'free',     bestSeasons: ['spring'], bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends','family'] },
  park_garden:         { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '1_2h',     costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family','kids'] },
  hiking_trails:       { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends'] },
  beach_water:         { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'free',     bestSeasons: ['summer'], bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family','kids'] },
  active_adventure:    { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends'] },
  food_drink:          { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: '1_2h',     costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['evening'],   groupSuitability: ['solo','couple','friends','family'] },
  entertainment:       { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: '2_3h',     costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['afternoon'], groupSuitability: ['couple','friends','family','kids'] },
  wellness:            { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: 'half_day', costLevel: 'expensive',bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple'] },
  zoo_aquarium:        { setting: 'mixed',   weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['couple','friends','family','kids'] },
  event_festival:      { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'cheap',    bestSeasons: ['any'],    bestTimesOfDay: ['afternoon'], groupSuitability: ['couple','friends','family'] },
  neighbourhood_walks: { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends'] },
};

type CategoryMatch = { category: Category; matched: boolean };

// ── Layer 1: HERE category IDs (HERE Geocoding & Search taxonomy) ──
// IDs verified against live discover/lookup responses. Top-level groups:
//   100 Eat & Drink · 200 Going Out / Entertainment · 300 Sights & Museums
//   350 Natural & Geographical · 400 Transport · 500 Accommodation
//   550 Leisure & Outdoor · 600 Shopping · 700 Services · 800 Facilities · 900 Areas
// Checked most-specific first; returns null so name/OSM layers can take over.
function categoryFromHereIds(hereCats: string[]): Category | null {
  if (hereCats.length === 0) return null;
  const has = (id: string) => hereCats.includes(id);
  const pre = (p: string) => hereCats.some(c => c.startsWith(p));

  // Museums & galleries — 300-3100 museum/history/art museum, 300-3000-0024 gallery
  if (pre('300-3100-') || has('300-3000-0024')) return 'museum_gallery';

  // Historical — 300-3200 religious places (churches), historic building & castle
  if (pre('300-3200-') || has('300-3000-0025') || has('300-3000-0030')) return 'historical';

  // Food & drink — all 100 (restaurants, cafes, food halls, coffee), nightlife bars/biergarten, winery, brewery
  if (pre('100-')) return 'food_drink';
  if (has('200-2000-0011') || has('200-2000-0012') || has('200-2000-0019')) return 'food_drink';
  if (has('300-3000-0065') || has('300-3000-0350')) return 'food_drink';

  // Entertainment — cinema (200-2100), theatre/music/culture (200-2200), nightlife/live music, amusement park
  if (pre('200-2100-') || pre('200-2200-')) return 'entertainment';
  if (has('200-2000-0000') || has('200-2000-0013') || has('200-2000-0015') || has('200-2000-0306')) return 'entertainment';
  if (has('550-5520-0207')) return 'entertainment';

  // Zoo & aquarium — 550-5520 zoo / aquarium / animal park
  if (has('550-5520-0208') || has('550-5520-0211') || has('550-5520-0228')) return 'zoo_aquarium';

  // Beach & water — beach, lake, swimming pool, water park
  if (has('550-5510-0205') || has('350-3500-0304') || has('800-8600-0182') || has('550-5520-0357')) return 'beach_water';

  // Hiking & trails — mountain peak
  if (has('350-3510-0238')) return 'hiking_trails';

  // Active & adventure — sports facilities, ski, recreation centre, stadium, fitness, golf, training
  if (has('550-5510-0203') || has('550-5510-0206') || has('550-5510-0227') || has('550-5520-0212')) return 'active_adventure';
  if (pre('800-8600-')) return 'active_adventure';

  // Wellness — wellness centre / services
  if (has('700-7400-0292')) return 'wellness';

  // Park & garden — park/recreation area, garden
  if (has('550-5510-0202') || has('550-5510-0204')) return 'park_garden';

  // Nature & landscape — rivers, mountains/hills, forests, general natural, protected area, scenic viewpoints
  if (has('350-3500-0302') || pre('350-3510-') || pre('350-3522-') || pre('350-3550-')) return 'nature_landscape';
  if (has('550-5520-0210') || has('550-5510-0242') || has('400-4300-0308')) return 'nature_landscape';

  // City areas / outdoor zones → neighbourhood walks
  if (pre('900-')) return 'neighbourhood_walks';

  // 300-3000-0000 / -0023 (generic "sight"/"tourist attraction") are ambiguous → let name heuristics decide
  return null;
}

// ── Layer 2: HERE category names (keyword match — catches IDs we haven't mapped) ──
function categoryFromHereNames(hereCatNames: string): Category | null {
  if (!hereCatNames) return null;
  if (/museum|gallery|art centre|arts centre/.test(hereCatNames)) return 'museum_gallery';
  if (/historic|castle|ruins|monument|memorial|fortress|abbey|cathedral|temple|church|chapel/.test(hereCatNames)) return 'historical';
  if (/zoo|aquarium|wildlife park|safari/.test(hereCatNames)) return 'zoo_aquarium';
  if (/theme park|amusement|cinema|bowling|escape room|theatre|theater/.test(hereCatNames)) return 'entertainment';
  if (/viewpoint|observation|scenic/.test(hereCatNames)) return 'nature_landscape';
  if (/spa|wellness|hot spring|thermal bath/.test(hereCatNames)) return 'wellness';
  if (/swimming|beach|water park|lake/.test(hereCatNames)) return 'beach_water';
  if (/hiking|trail|trekking|mountain|peak/.test(hereCatNames)) return 'hiking_trails';
  if (/national park|nature reserve|nature park|forest/.test(hereCatNames)) return 'nature_landscape';
  if (/botanical|garden/.test(hereCatNames)) return 'park_garden';
  if (/park|playground/.test(hereCatNames)) return 'park_garden';
  if (/restaurant|cafe|bar |pub |biergarten|brewery|food|drink/.test(hereCatNames)) return 'food_drink';
  return null;
}

// ── Layer 2b: Google place types (Places API New) ──
// Google results carry their `types` array in tags['google_types'].
// Keyword matching over the joined types string — robust against the long tail
// of specific types (e.g. "fine_dining_restaurant", "art_gallery").
// Generic types like "tourist_attraction" / "point_of_interest" deliberately
// fall through to the name heuristics.
function categoryFromGoogleTypes(googleTypes: string[]): Category | null {
  if (googleTypes.length === 0) return null;
  const t = googleTypes.join(',');
  const has = (re: RegExp) => re.test(t);

  if (has(/museum|art_gallery|planetarium/)) return 'museum_gallery';
  if (has(/historical|monument|castle|palace|church|place_of_worship|synagogue|mosque|temple|cultural_landmark/)) return 'historical';
  if (has(/zoo|aquarium|wildlife/)) return 'zoo_aquarium';
  if (has(/amusement|movie_theater|performing_arts|concert|opera|bowling|casino|comedy|karaoke|night_club|arcade|theater/)) return 'entertainment';
  if (has(/water_park|swimming|beach/)) return 'beach_water';
  if (has(/hiking/)) return 'hiking_trails';
  if (has(/ski|sports_|fitness|golf|stadium|climbing|skating|adventure/)) return 'active_adventure';
  if (has(/\bspa\b|sauna|wellness|public_bath|massage|hot_spring/)) return 'wellness';
  if (has(/national_park|natural_feature|observation_deck/)) return 'nature_landscape';
  if (has(/botanical|garden|dog_park|playground|picnic/)) return 'park_garden';
  if (/(^|,)park(,|$)/.test(t) || has(/state_park|city_park/)) return 'park_garden';
  if (has(/restaurant|cafe|coffee|bar(_|,|$)|pub(_|,|$)|bakery|food|brew|wine|deli|ice_cream|market/)) return 'food_drink';
  if (has(/locality|neighborhood|town_square|plaza/)) return 'neighbourhood_walks';
  return null;
}

// ── Layer 3: Place name keyword heuristics (catches generic HERE "attraction" entries) ──
function categoryFromName(name: string): Category | null {
  if (!name) return null;
  if (/\bmuseum\b|musée|museo|museu/.test(name)) return 'museum_gallery';
  if (/\bgallery\b|galerie|galleria/.test(name)) return 'museum_gallery';
  if (/castle|schloss|\bburg\b|château|fortress|palace|palast|abbey|cathedral|dom\b|basilica|monument|memorial|ruins|ruine/.test(name)) return 'historical';
  if (/waterfall|wasserfall|gorge|canyon|cave|grotto|cliff|crater|schlucht/.test(name)) return 'nature_landscape';
  if (/viewpoint|aussicht|belvedere|lookout|panorama/.test(name)) return 'nature_landscape';
  if (/national park|naturpark|nature reserve|naturschutz/.test(name)) return 'nature_landscape';
  if (/\bzoo\b|aquarium|safari|wildpark|tierpark/.test(name)) return 'zoo_aquarium';
  if (/botanical|botanic/.test(name)) return 'park_garden';
  if (/\bpark\b|\bgarden\b|\bgarten\b/.test(name)) return 'park_garden';
  if (/hiking|trail|wanderweg|trek/.test(name)) return 'hiking_trails';
  if (/\bspa\b|thermal|therme|sauna|wellness/.test(name)) return 'wellness';
  if (/\bbeach\b|\bstrand\b|\bschwimm|\blake\b|\bsee\b/.test(name)) return 'beach_water';
  if (/cinema|theater|theatre|concert hall|bowling|escape room/.test(name)) return 'entertainment';
  if (/restaurant|bistro|café|cafe|brasserie|brewery|brauerei|biergarten|gasthaus|pub\b|\bbar\b/.test(name)) return 'food_drink';
  return null;
}

// ── Layer 4: OSM-style tags (backwards compat for items added before HERE migration) ──
function categoryFromOsmTags(tags: Record<string, string>): Category | null {
  const t = (key: string) => tags[key] || '';
  if (t('tourism') === 'museum' || t('amenity') === 'arts_centre' || t('tourism') === 'gallery') return 'museum_gallery';
  if (['castle', 'monument', 'ruins', 'memorial', 'archaeological_site'].includes(t('historic'))) return 'historical';
  if (t('tourism') === 'attraction' && t('historic')) return 'historical';
  if (t('amenity') === 'place_of_worship' || t('building') === 'monastery') return 'historical';
  if (['waterfall', 'gorge', 'cliff', 'cave_entrance'].includes(t('natural'))) return 'nature_landscape';
  if (t('tourism') === 'viewpoint') return 'nature_landscape';
  if (t('leisure') === 'nature_reserve' || t('boundary') === 'national_park') return 'nature_landscape';
  if (['park', 'garden', 'playground'].includes(t('leisure'))) return 'park_garden';
  if (t('tourism') === 'botanical_garden') return 'park_garden';
  if (t('natural') === 'peak' || t('natural') === 'ridge') return 'hiking_trails';
  if (t('route') === 'hiking') return 'hiking_trails';
  if (t('tourism') === 'alpine_hut') return 'hiking_trails';
  if (t('natural') === 'beach' || t('leisure') === 'swimming_area') return 'beach_water';
  if (t('sport') === 'swimming') return 'beach_water';
  if (['climbing', 'skiing', 'kayak', 'surfing', 'paragliding'].includes(t('sport'))) return 'active_adventure';
  if (t('leisure') === 'water_park') return 'active_adventure';
  if (['restaurant', 'cafe', 'pub', 'biergarten', 'fast_food', 'bar'].includes(t('amenity'))) return 'food_drink';
  if (t('craft') === 'brewery') return 'food_drink';
  if (t('amenity') === 'marketplace') return 'food_drink';
  if (t('amenity') === 'cinema' || t('leisure') === 'bowling_alley') return 'entertainment';
  if (t('tourism') === 'theme_park' || t('leisure') === 'amusement_arcade') return 'entertainment';
  if (t('leisure') === 'escape_game') return 'entertainment';
  if (t('leisure') === 'spa' || t('amenity') === 'spa') return 'wellness';
  if (t('natural') === 'hot_spring') return 'wellness';
  if (t('tourism') === 'zoo' || t('tourism') === 'aquarium') return 'zoo_aquarium';
  if (['city', 'town', 'village'].includes(t('place'))) return 'neighbourhood_walks';
  return null;
}

// Run the four layers in priority order. `matched` is false only when nothing
// matched and we fell through to the neutral default — the review screen uses
// this to ask the user to confirm the category.
export function classifyCategory(tags: Record<string, string>): CategoryMatch {
  const hereCats = (tags['here_categories'] || '').split(',').filter(Boolean);
  const l1 = categoryFromHereIds(hereCats);
  if (l1) return { category: l1, matched: true };

  const l2 = categoryFromHereNames(tags['here_category_names'] || '');
  if (l2) return { category: l2, matched: true };

  const googleTypes = (tags['google_types'] || '').split(',').filter(Boolean);
  const l2b = categoryFromGoogleTypes(googleTypes);
  if (l2b) return { category: l2b, matched: true };

  const l3 = categoryFromName((tags['name'] || '').toLowerCase());
  if (l3) return { category: l3, matched: true };

  const l4 = categoryFromOsmTags(tags);
  if (l4) return { category: l4, matched: true };

  return { category: 'neighbourhood_walks', matched: false };
}

export function inferCategory(tags: Record<string, string>): Category {
  return classifyCategory(tags).category;
}

export function inferDefaults(tags: Record<string, string>): InferredDefaults {
  const { category, matched } = classifyCategory(tags);
  const defaults = { ...CATEGORY_DEFAULTS[category] };
  const result: InferredDefaults = {
    category,
    categoryUncertain: !matched,
    ...defaults,
    bestSeasons: [...defaults.bestSeasons],
    bestTimesOfDay: [...defaults.bestTimesOfDay],
    groupSuitability: [...defaults.groupSuitability],
  };

  if (tags['fee'] === 'no' || tags['fee'] === '0') result.costLevel = 'free';
  if (tags['fee'] === 'yes' && result.costLevel === 'free') result.costLevel = 'cheap';
  if (tags['wheelchair'] === 'yes') result.wheelchairAccessible = true;
  if (tags['wheelchair'] === 'no') result.wheelchairAccessible = false;
  if (tags['dog'] === 'yes') result.dogFriendly = true;
  if (tags['dog'] === 'no') result.dogFriendly = false;
  if (tags['indoor'] === 'yes' || tags['covered'] === 'yes') result.setting = 'indoor';
  if (tags['sport'] === 'skiing') result.bestSeasons = ['winter'];
  if (tags['sport'] === 'swimming') result.bestSeasons = ['summer'];

  return result;
}
