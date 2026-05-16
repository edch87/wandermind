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
  museum_gallery:     { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: 'half_day', costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family','kids'] },
  historical:         { setting: 'mixed',   weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'cheap',    bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family'] },
  nature_landscape:   { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'free',     bestSeasons: ['spring'], bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends','family'] },
  park_garden:        { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '1_2h',     costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family','kids'] },
  mountain_hiking:    { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends'] },
  beach_water:        { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'free',     bestSeasons: ['summer'], bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family','kids'] },
  sport_adventure:    { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends'] },
  food_drink:         { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: '1_2h',     costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['evening'],   groupSuitability: ['solo','couple','friends','family'] },
  entertainment:      { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: '2_3h',     costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['afternoon'], groupSuitability: ['couple','friends','family','kids'] },
  wellness:           { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: 'half_day', costLevel: 'expensive',bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple'] },
  shopping:           { setting: 'indoor',  weatherSuitability: 'any',          durationEstimate: '2_3h',     costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['afternoon'], groupSuitability: ['solo','couple','friends'] },
  religious_spiritual:{ setting: 'mixed',   weatherSuitability: 'any',          durationEstimate: '1_2h',     costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends','family'] },
  zoo_aquarium:       { setting: 'mixed',   weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'moderate', bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['couple','friends','family','kids'] },
  event_festival:     { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: '2_3h',     costLevel: 'cheap',    bestSeasons: ['any'],    bestTimesOfDay: ['afternoon'], groupSuitability: ['couple','friends','family'] },
  city_exploration:   { setting: 'outdoor', weatherSuitability: 'good_weather', durationEstimate: 'half_day', costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['morning'],   groupSuitability: ['solo','couple','friends'] },
  other:              { setting: 'outdoor', weatherSuitability: 'any',          durationEstimate: '2_3h',     costLevel: 'free',     bestSeasons: ['any'],    bestTimesOfDay: ['any'],       groupSuitability: ['solo','couple','friends','family'] },
};

export function inferCategory(tags: Record<string, string>): Category {
  const t = (key: string) => tags[key] || '';

  if (t('tourism') === 'museum' || t('amenity') === 'arts_centre' || t('tourism') === 'gallery') return 'museum_gallery';
  if (['castle', 'monument', 'ruins', 'memorial', 'archaeological_site'].includes(t('historic'))) return 'historical';
  if (t('tourism') === 'attraction' && t('historic')) return 'historical';
  if (['waterfall', 'gorge', 'cliff', 'cave_entrance'].includes(t('natural'))) return 'nature_landscape';
  if (t('tourism') === 'viewpoint') return 'nature_landscape';
  if (t('leisure') === 'nature_reserve' || t('boundary') === 'national_park') return 'nature_landscape';
  if (['park', 'garden', 'playground'].includes(t('leisure'))) return 'park_garden';
  if (t('tourism') === 'botanical_garden') return 'park_garden';
  if (t('natural') === 'peak' || t('natural') === 'ridge') return 'mountain_hiking';
  if (t('route') === 'hiking') return 'mountain_hiking';
  if (t('tourism') === 'alpine_hut') return 'mountain_hiking';
  if (t('natural') === 'beach' || t('leisure') === 'swimming_area') return 'beach_water';
  if (t('sport') === 'swimming') return 'beach_water';
  if (['climbing', 'skiing', 'kayak', 'surfing', 'paragliding'].includes(t('sport'))) return 'sport_adventure';
  if (t('leisure') === 'water_park') return 'sport_adventure';
  if (['restaurant', 'cafe', 'pub', 'biergarten', 'fast_food', 'bar'].includes(t('amenity'))) return 'food_drink';
  if (t('craft') === 'brewery') return 'food_drink';
  if (t('amenity') === 'cinema' || t('leisure') === 'bowling_alley') return 'entertainment';
  if (t('tourism') === 'theme_park' || t('leisure') === 'amusement_arcade') return 'entertainment';
  if (t('leisure') === 'escape_game') return 'entertainment';
  if (t('leisure') === 'spa' || t('amenity') === 'spa') return 'wellness';
  if (t('natural') === 'hot_spring') return 'wellness';
  if (t('amenity') === 'marketplace' || t('shop') === 'mall') return 'shopping';
  if (t('tourism') === 'zoo' || t('tourism') === 'aquarium') return 'zoo_aquarium';
  if (t('amenity') === 'place_of_worship' || t('building') === 'monastery') return 'religious_spiritual';
  if (['city', 'town', 'village'].includes(t('place'))) return 'city_exploration';
  return 'other';
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
