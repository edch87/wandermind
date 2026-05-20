import type { Category, Setting, WeatherSuitability, DurationEstimate, CostLevel, Season, TimeOfDay, GroupType } from '../types';

interface InferredDefaults {
  category: Category;
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

const CATEGORY_DEFAULTS: Record<Category, Omit<InferredDefaults, 'category' | 'dogFriendly' | 'wheelchairAccessible'>> = {
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

export function inferCategory(tags: Record<string, string>): Category {
  // ── Layer 1: HERE category IDs (most precise — direct lookup) ──
  const hereCats = (tags['here_categories'] || '').split(',').filter(Boolean);
  if (hereCats.length > 0) {
    const has = (id: string) => hereCats.includes(id);
    const startsWith = (prefix: string) => hereCats.some(c => c.startsWith(prefix));

    // Food & Drink: all 100-1000-* (restaurants, cafes, bars, etc.)
    if (startsWith('100-1000-')) return 'food_drink';

    // Entertainment venues: cinema (100-1100-0010), bowling, clubs
    if (has('100-1100-0010') || has('100-1100-0012') || has('100-1100-0013')) return 'entertainment';

    // Arts centre: 100-1100-0000
    if (has('100-1100-0000')) return 'museum_gallery';

    // Museums & Galleries: specific 200-2000 codes
    if (has('200-2000-0011') || has('200-2000-0015') || has('200-2000-0016')) return 'museum_gallery';
    if (has('200-2000-0014')) return 'museum_gallery'; // art gallery

    // Historical: castle (0004), historic site (0013), monument (0017), memorial (0018), ruins (0019), religious (0020)
    if (has('200-2000-0004') || has('200-2000-0013') || has('200-2000-0017') || has('200-2000-0018') || has('200-2000-0019') || has('200-2000-0020')) return 'historical';

    // Religious buildings under 900-* → typically historical
    if (startsWith('900-')) return 'historical';

    // Viewpoint: 200-2000-0012
    if (has('200-2000-0012')) return 'nature_landscape';

    // Zoo & Aquarium: all 200-2300-*
    if (startsWith('200-2300-')) return 'zoo_aquarium';

    // Theme Park / Amusement: all 200-2200-*
    if (startsWith('200-2200-')) return 'entertainment';

    // Wellness & Spa: 300-3100-*
    if (startsWith('300-3100-')) return 'wellness';

    // Swimming / Beach / Water: 300-3200-*
    if (startsWith('300-3200-')) return 'beach_water';

    // Hiking & Trails: 300-3400-*
    if (startsWith('300-3400-')) return 'hiking_trails';

    // Active & Adventure sports: all 350-* (climbing, skiing, kayaking, etc.)
    if (startsWith('350-')) return 'active_adventure';

    // Parks & Gardens: 300-3000-*, botanical/garden under 550-*
    if (startsWith('300-3000-')) return 'park_garden';
    if (has('550-5510-0202') || has('550-5510-0208')) return 'park_garden'; // garden / botanical garden

    // Nature Reserves & National Parks: broader 550-* bucket
    if (startsWith('550-')) return 'nature_landscape';

    // Note: generic HERE attraction (200-2000-0000) falls through to layers below
  }

  // ── Layer 2: HERE category names (keyword match — catches IDs we haven't mapped) ──
  const hereCatNames = tags['here_category_names'] || '';
  if (hereCatNames) {
    if (/museum|gallery|art centre|arts centre/.test(hereCatNames)) return 'museum_gallery';
    if (/historic|castle|ruins|monument|memorial|fortress|abbey|cathedral|temple/.test(hereCatNames)) return 'historical';
    if (/zoo|aquarium|wildlife park|safari/.test(hereCatNames)) return 'zoo_aquarium';
    if (/theme park|amusement|cinema|bowling|escape room/.test(hereCatNames)) return 'entertainment';
    if (/viewpoint|observation/.test(hereCatNames)) return 'nature_landscape';
    if (/spa|wellness|hot spring|thermal bath/.test(hereCatNames)) return 'wellness';
    if (/swimming|beach|water park/.test(hereCatNames)) return 'beach_water';
    if (/hiking|trail|trekking/.test(hereCatNames)) return 'hiking_trails';
    if (/national park|nature reserve|nature park/.test(hereCatNames)) return 'nature_landscape';
    if (/botanical|garden/.test(hereCatNames)) return 'park_garden';
    if (/park|playground/.test(hereCatNames)) return 'park_garden';
    if (/restaurant|cafe|bar |pub |biergarten|brewery|food|drink/.test(hereCatNames)) return 'food_drink';
  }

  // ── Layer 3: Place name keyword heuristics (catches generic HERE "attraction" entries) ──
  const name = (tags['name'] || '').toLowerCase();
  if (name) {
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
  }

  // ── Layer 4: OSM-style tags (backwards compat for items added before HERE migration) ──
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
  return 'neighbourhood_walks';
}

export function inferDefaults(tags: Record<string, string>): InferredDefaults {
  const category = inferCategory(tags);
  const defaults = { ...CATEGORY_DEFAULTS[category] };
  const result: InferredDefaults = {
    category,
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
