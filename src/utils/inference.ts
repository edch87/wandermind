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

// Defaults sourced from docs/categories.xlsx Sheet 1 (group fit / weather / duration columns).
// Setting, costLevel, bestSeasons, bestTimesOfDay aren't in the spreadsheet — kept as
// sensible defaults that the user can override on the review screen.
// Note: `family` GroupType is gone (2026-06-24 pass) — the spreadsheet's family entries
// collapse into the `kids` group where children are the headline use-case.
const CATEGORY_DEFAULTS: Record<Category, Omit<InferredDefaults, 'category' | 'categoryUncertain' | 'dogFriendly' | 'wheelchairAccessible'>> = {
  museum_gallery:      { setting: 'indoor',  weatherSuitability: 'any',               durationEstimate: '1_2h',     costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','kids'] },
  historical:          { setting: 'mixed',   weatherSuitability: 'any',               durationEstimate: '2_3h',     costLevel: 'cheap',     bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','kids'] },
  religious_site:      { setting: 'mixed',   weatherSuitability: 'any',               durationEstimate: 'under_1h', costLevel: 'free',      bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends'] },
  nature_landscape:    { setting: 'outdoor', weatherSuitability: 'good_weather',      durationEstimate: 'half_day', costLevel: 'free',      bestSeasons: ['any'],    bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends','kids'] },
  park_garden:         { setting: 'outdoor', weatherSuitability: 'good_weather',      durationEstimate: '1_2h',     costLevel: 'free',      bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','kids'] },
  neighbourhood_walks: { setting: 'outdoor', weatherSuitability: 'good_weather',      durationEstimate: '1_2h',     costLevel: 'free',      bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends'] },
  beach_water:         { setting: 'outdoor', weatherSuitability: 'good_weather',      durationEstimate: 'half_day', costLevel: 'free',      bestSeasons: ['summer'], bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','kids'] },
  active:              { setting: 'mixed',   weatherSuitability: 'any',               durationEstimate: '1_2h',     costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends'] },
  food_drink:          { setting: 'indoor',  weatherSuitability: 'any',               durationEstimate: '1_2h',     costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['evening'],   groupSuitability: ['solo','couple','friends','kids'] },
  nightlife:           { setting: 'indoor',  weatherSuitability: 'any',               durationEstimate: '2_3h',     costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['evening'],   groupSuitability: ['solo','couple','friends'] },
  theatre_concert:     { setting: 'indoor',  weatherSuitability: 'any',               durationEstimate: '2_3h',     costLevel: 'expensive', bestSeasons: ['any'],    bestTimesOfDay: ['evening'],   groupSuitability: ['couple','friends'] },
  amusement_park:      { setting: 'outdoor', weatherSuitability: 'good_weather',      durationEstimate: 'full_day', costLevel: 'expensive', bestSeasons: ['summer'], bestTimesOfDay: ['any'],       groupSuitability: ['couple','friends','kids'] },
  entertainment:       { setting: 'indoor',  weatherSuitability: 'any',               durationEstimate: '1_2h',     costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['afternoon'], groupSuitability: ['couple','friends','kids'] },
  zoo_aquarium:        { setting: 'mixed',   weatherSuitability: 'any',               durationEstimate: 'half_day', costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['couple','friends','kids'] },
  wellness:            { setting: 'indoor',  weatherSuitability: 'bad_weather_ideal', durationEstimate: '2_3h',     costLevel: 'expensive', bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends'] },
  shopping:            { setting: 'indoor',  weatherSuitability: 'any',               durationEstimate: '1_2h',     costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends'] },
  other:               { setting: 'mixed',   weatherSuitability: 'any',               durationEstimate: '1_2h',     costLevel: 'moderate',  bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','kids'] },
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

  // Religious site — 300-3200 churches / temples / mosques / cathedrals (2026-06-24 split from historical)
  if (pre('300-3200-')) return 'religious_site';

  // Historical — historic building & castle (300-3000-0025 / -0030)
  if (has('300-3000-0025') || has('300-3000-0030')) return 'historical';

  // Food & drink — all 100 (restaurants, cafes, food halls, coffee), plus biergarten and brewery (per Lark rule)
  if (pre('100-')) return 'food_drink';
  if (has('300-3000-0065') || has('300-3000-0350')) return 'food_drink';

  // Nightlife — bars, pubs, night clubs (200-2000 family)
  if (has('200-2000-0011') || has('200-2000-0012') || has('200-2000-0019')) return 'nightlife';

  // Theatre & concert — 200-2200 theatre/music/culture (concert halls, opera, philharmonics) — split from entertainment
  if (pre('200-2200-')) return 'theatre_concert';

  // Amusement park — 550-5520-0207 theme/amusement park, 550-5520-0357 water park (was beach_water/entertainment)
  if (has('550-5520-0207') || has('550-5520-0357')) return 'amusement_park';

  // Entertainment — cinema (200-2100), arcades, generic leisure within 200-2000 minus the carved-out theatre/nightlife ids
  if (pre('200-2100-')) return 'entertainment';
  if (has('200-2000-0000') || has('200-2000-0013') || has('200-2000-0015') || has('200-2000-0306')) return 'entertainment';

  // Zoo & aquarium — 550-5520 zoo / aquarium / animal park
  if (has('550-5520-0208') || has('550-5520-0211') || has('550-5520-0228')) return 'zoo_aquarium';

  // Lakes & water — beach, lake, swimming pool
  if (has('550-5510-0205') || has('350-3500-0304') || has('800-8600-0182')) return 'beach_water';

  // Active — sports facilities, ski, recreation centre, stadium, fitness, golf, training (renamed from active_adventure)
  if (has('550-5510-0203') || has('550-5510-0206') || has('550-5510-0227') || has('550-5520-0212')) return 'active';
  if (pre('800-8600-')) return 'active';

  // Wellness — wellness centre / services
  if (has('700-7400-0292')) return 'wellness';

  // Park & garden — park/recreation area, garden
  if (has('550-5510-0202') || has('550-5510-0204')) return 'park_garden';

  // Nature & landscape — rivers, mountains/hills, forests, general natural, protected area, scenic viewpoints,
  // plus mountain peak (was hiking_trails, now part of nature — the place IS a peak)
  if (has('350-3500-0302') || pre('350-3510-') || pre('350-3522-') || pre('350-3550-')) return 'nature_landscape';
  if (has('550-5520-0210') || has('550-5510-0242') || has('400-4300-0308')) return 'nature_landscape';

  // Shopping — 600 family (shops, malls, outlet centres, boutiques)
  if (pre('600-')) return 'shopping';

  // City areas / outdoor zones → neighbourhood walks
  if (pre('900-')) return 'neighbourhood_walks';

  // 300-3000-0000 / -0023 (generic "sight"/"tourist attraction") are ambiguous → let name heuristics decide
  return null;
}

// ── Layer 2: HERE category names (keyword match — catches IDs we haven't mapped) ──
function categoryFromHereNames(hereCatNames: string): Category | null {
  if (!hereCatNames) return null;
  if (/museum|gallery|art centre|arts centre/.test(hereCatNames)) return 'museum_gallery';
  if (/cathedral|church|chapel|temple|mosque|synagogue|monastery|abbey|shrine/.test(hereCatNames)) return 'religious_site';
  if (/historic|castle|ruins|monument|memorial|fortress/.test(hereCatNames)) return 'historical';
  if (/zoo|aquarium|wildlife park|safari/.test(hereCatNames)) return 'zoo_aquarium';
  if (/theme park|amusement|water park/.test(hereCatNames)) return 'amusement_park';
  if (/concert hall|opera|philharmoni|theatre|theater/.test(hereCatNames)) return 'theatre_concert';
  if (/cinema|bowling|escape room|arcade/.test(hereCatNames)) return 'entertainment';
  if (/viewpoint|observation|scenic/.test(hereCatNames)) return 'nature_landscape';
  if (/spa|wellness|hot spring|thermal bath/.test(hereCatNames)) return 'wellness';
  if (/swimming|beach|lake/.test(hereCatNames)) return 'beach_water';
  // Mountains/peaks/hiking trails are nature now (places-not-activities).
  if (/hiking|trail|trekking|mountain|peak/.test(hereCatNames)) return 'nature_landscape';
  if (/national park|nature reserve|nature park|forest/.test(hereCatNames)) return 'nature_landscape';
  if (/botanical|garden/.test(hereCatNames)) return 'park_garden';
  if (/park|playground/.test(hereCatNames)) return 'park_garden';
  if (/mall|shopping|outlet|boutique|department store/.test(hereCatNames)) return 'shopping';
  // Food/drink retain (biergarten and brewery stay food_drink per Lark rule)
  if (/restaurant|cafe|biergarten|brewery|food/.test(hereCatNames)) return 'food_drink';
  // Nightlife
  if (/\bbar\b|pub|nightclub|cocktail|wine bar/.test(hereCatNames)) return 'nightlife';
  // Fallback generic "drink" — could be a juice bar or smoothie place
  if (/drink/.test(hereCatNames)) return 'food_drink';
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
  // Religious site — split from historical (2026-06-24)
  if (has(/church|place_of_worship|synagogue|mosque|temple|hindu_temple|buddhist_temple/)) return 'religious_site';
  if (has(/historical|monument|castle|palace|cultural_landmark/)) return 'historical';
  if (has(/zoo|aquarium|wildlife/)) return 'zoo_aquarium';
  // Amusement & water parks — destination-tier
  if (has(/amusement|water_park|theme_park/)) return 'amusement_park';
  // Theatre & concert — live performance carved out of entertainment
  if (has(/performing_arts|concert|opera|theater_company|symphony|philharmonic/)) return 'theatre_concert';
  // Entertainment — cinemas, arcades, bowling, casinos, escape rooms
  if (has(/movie_theater|bowling|casino|comedy|karaoke|arcade|escape_room/)) return 'entertainment';
  if (has(/swimming|beach/)) return 'beach_water';
  // Active — sports facilities, gyms, ski, climbing, skating, adventure parks
  if (has(/ski|sports_|fitness|golf|stadium|climbing|skating|adventure/)) return 'active';
  if (has(/\bspa\b|sauna|wellness|public_bath|massage|hot_spring/)) return 'wellness';
  if (has(/national_park|natural_feature|observation_deck|hiking_area/)) return 'nature_landscape';
  if (has(/botanical|garden|dog_park|playground|picnic/)) return 'park_garden';
  if (/(^|,)park(,|$)/.test(t) || has(/state_park|city_park/)) return 'park_garden';
  // Shopping — malls, outlets, department stores, boutiques
  if (has(/shopping_mall|shopping_center|department_store|outlet|boutique/)) return 'shopping';
  // Food/drink — restaurants, cafés, brewpubs (per Lark rule). Bars/pubs go to nightlife below.
  if (has(/restaurant|cafe|coffee|bakery|food|brew|deli|ice_cream|market/)) return 'food_drink';
  // Nightlife — bars, pubs, night clubs, wine bars, cocktail bars
  if (has(/night_club|bar(_|,|$)|pub(_|,|$)|wine_bar|cocktail/)) return 'nightlife';
  // Generic wine (winery, wine shop) → food_drink
  if (has(/wine/)) return 'food_drink';
  if (has(/locality|neighborhood|town_square|plaza/)) return 'neighbourhood_walks';
  return null;
}

// ── Layer 3: Place name keyword heuristics (catches generic HERE "attraction" entries) ──
function categoryFromName(name: string): Category | null {
  if (!name) return null;
  if (/\bmuseum\b|musée|museo|museu/.test(name)) return 'museum_gallery';
  if (/\bgallery\b|galerie|galleria/.test(name)) return 'museum_gallery';
  // Religious — Dom, Münster, Kloster, Wieskirche, etc.
  if (/cathedral|\bdom\b|basilica|abbey|kloster|monastery|münster|wieskirche|frauenkirche|\bkirche\b|chapel|kapelle|temple|mosque|synagogue|shrine/.test(name)) return 'religious_site';
  if (/castle|schloss|\bburg\b|château|fortress|palace|palast|monument|memorial|ruins|ruine/.test(name)) return 'historical';
  if (/waterfall|wasserfall|gorge|canyon|cave|grotto|cliff|crater|schlucht/.test(name)) return 'nature_landscape';
  if (/viewpoint|aussicht|belvedere|lookout|panorama/.test(name)) return 'nature_landscape';
  if (/national park|naturpark|nature reserve|naturschutz/.test(name)) return 'nature_landscape';
  if (/\bzoo\b|aquarium|safari|wildpark|tierpark/.test(name)) return 'zoo_aquarium';
  if (/botanical|botanic/.test(name)) return 'park_garden';
  if (/\bpark\b|\bgarden\b|\bgarten\b/.test(name)) return 'park_garden';
  // Hiking-related names go to nature_landscape (place IS a trail/peak)
  if (/hiking|trail|wanderweg|trek/.test(name)) return 'nature_landscape';
  if (/\bspa\b|thermal|therme|sauna|wellness/.test(name)) return 'wellness';
  if (/\bbeach\b|\bstrand\b|\bschwimm|\blake\b|\bsee\b/.test(name)) return 'beach_water';
  // Theatre & concert venues
  if (/concert hall|opera|nationaltheater|philharmoni|gasteig|olympiahalle|theater|theatre/.test(name)) return 'theatre_concert';
  // Amusement & water parks
  if (/legoland|skyline park|freizeitpark|theme park|water park/.test(name)) return 'amusement_park';
  if (/cinema|kino|bowling|escape room/.test(name)) return 'entertainment';
  // Shopping — malls and outlets
  if (/arcaden|outlet|mall|shopping center|shopping centre/.test(name)) return 'shopping';
  // Food/drink retain wins over bar/pub (so "Augustiner Bräu" stays food_drink even if it had "bar" in the name)
  if (/biergarten|brauhaus|bräuhaus|brewery|brauerei|gasthaus|gasthof|wirtshaus|restaurant|bistro|café|cafe|brasserie/.test(name)) return 'food_drink';
  // Nightlife
  if (/\bpub\b|\bbar\b|nightclub|cocktail lounge|cocktail bar|speakeasy/.test(name)) return 'nightlife';
  return null;
}

// ── Layer 4: OSM-style tags (backwards compat for items added before HERE migration) ──
function categoryFromOsmTags(tags: Record<string, string>): Category | null {
  const t = (key: string) => tags[key] || '';
  if (t('tourism') === 'museum' || t('amenity') === 'arts_centre' || t('tourism') === 'gallery') return 'museum_gallery';
  // Religious — place_of_worship and monasteries (split from historical 2026-06-24)
  if (t('amenity') === 'place_of_worship' || t('building') === 'monastery' || t('building') === 'church' || t('building') === 'cathedral' || t('building') === 'temple' || t('building') === 'mosque') return 'religious_site';
  if (['castle', 'monument', 'ruins', 'memorial', 'archaeological_site'].includes(t('historic'))) return 'historical';
  if (t('tourism') === 'attraction' && t('historic')) return 'historical';
  if (['waterfall', 'gorge', 'cliff', 'cave_entrance'].includes(t('natural'))) return 'nature_landscape';
  if (t('tourism') === 'viewpoint') return 'nature_landscape';
  if (t('leisure') === 'nature_reserve' || t('boundary') === 'national_park') return 'nature_landscape';
  if (['park', 'garden', 'playground'].includes(t('leisure'))) return 'park_garden';
  if (t('tourism') === 'botanical_garden') return 'park_garden';
  // Peaks, ridges, trails and alpine huts go to nature_landscape now (place IS a peak/trail)
  if (t('natural') === 'peak' || t('natural') === 'ridge') return 'nature_landscape';
  if (t('route') === 'hiking') return 'nature_landscape';
  if (t('tourism') === 'alpine_hut') return 'nature_landscape';
  if (t('natural') === 'beach' || t('leisure') === 'swimming_area') return 'beach_water';
  if (t('sport') === 'swimming') return 'beach_water';
  // Active — climbing, ski, racquet sports, fitness, golf, etc.
  if (['climbing', 'skiing', 'kayak', 'surfing', 'paragliding'].includes(t('sport'))) return 'active';
  if (t('leisure') === 'fitness_centre' || t('leisure') === 'sports_centre' || t('leisure') === 'pitch') return 'active';
  // Amusement & water parks — split out of entertainment
  if (t('tourism') === 'theme_park' || t('leisure') === 'water_park') return 'amusement_park';
  if (['restaurant', 'cafe', 'biergarten', 'fast_food'].includes(t('amenity'))) return 'food_drink';
  if (t('craft') === 'brewery') return 'food_drink';
  if (t('amenity') === 'marketplace') return 'food_drink';
  if (['bar', 'pub', 'nightclub'].includes(t('amenity'))) return 'nightlife';
  // Theatre & concert — concert halls and theatres
  if (t('amenity') === 'theatre' || t('amenity') === 'concert_hall') return 'theatre_concert';
  if (t('amenity') === 'cinema' || t('leisure') === 'bowling_alley' || t('leisure') === 'amusement_arcade' || t('leisure') === 'escape_game') return 'entertainment';
  if (t('leisure') === 'spa' || t('amenity') === 'spa') return 'wellness';
  if (t('natural') === 'hot_spring') return 'wellness';
  if (t('tourism') === 'zoo' || t('tourism') === 'aquarium') return 'zoo_aquarium';
  // Shopping — malls, department stores, marketplace-shop (markets handled above as food_drink)
  if (t('shop') === 'mall' || t('shop') === 'department_store') return 'shopping';
  if (t('shop') && t('shop') !== 'no' && !['convenience','supermarket'].includes(t('shop'))) return 'shopping';
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
