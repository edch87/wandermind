import { useState, useEffect } from 'react';
import type { UserProfile, BucketListItem, Category, HereSearchResult, PreferredTransport } from '../types';
import { CATEGORY_INFO } from '../types';
import { getDiscoverPlaces, toSearchResult, SOFT_HEART_MIN_SAVES, type DiscoverPlace } from '../utils/discover';
import { estimateTravelShortFromDistance } from '../utils/travelDisplay';
import PlaceImg from './PlaceImg';
import HeaderAvatar from './HeaderAvatar';
import { Heart, MapPin } from '@phosphor-icons/react';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onAddPlace: (place: HereSearchResult, category: Category) => void;
  onBack: () => void;
  /** Open the Settings screen from the header avatar. Shared affordance across
   *  primary tabs since Settings was pulled from the bottom nav. */
  onOpenSettings: () => void;
}

/**
 * Card surface for a discover entry. Source ('curated' / 'community' / 'wikidata')
 * is intentionally invisible — the card looks identical regardless. The only
 * social signal we surface is a soft heart for places that 3+ other larkers
 * have already saved, regardless of source.
 */
export function DiscoverCard({ place, onAdd, preferred }: {
  place: DiscoverPlace;
  onAdd: () => void;
  /** When provided, the card shows an estimated travel time ("20 min by car")
   *  instead of straight-line distance. The estimate uses the same fallback
   *  speeds as the recommend engine; it's an approximation since the place
   *  hasn't been saved yet (no routed minutes stored). */
  preferred?: PreferredTransport;
}) {
  const showHeart = (place.saveCount ?? 0) >= SOFT_HEART_MIN_SAVES;
  const travelLabel = preferred
    ? estimateTravelShortFromDistance(place.distanceKm, preferred)
    : `~${place.distanceKm} km`;
  const categoryLabel = CATEGORY_INFO[place.category]?.label ?? place.category;
  return (
    <button
      onClick={onAdd}
      aria-label={`Add ${place.name}, ${categoryLabel}, ${travelLabel}`}
      className="card text-left w-full relative flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 active:scale-[0.98] transition-transform"
    >
      <div className="place-img-container h-28 overflow-hidden flex-shrink-0">
        <PlaceImg
          src={place.imageUrl}
          alt=""
          name={place.name}
          category={place.category}
        />
        {showHeart && (
          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm"
               aria-hidden="true"
               title={`${place.saveCount} larkers have saved this`}>
            <Heart size={13} weight="fill" color="#c14a2f" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-xs font-medium text-sand-900 line-clamp-2 leading-snug">{place.name}</div>
        <div className="text-xs text-sand-700 mt-1 flex items-center gap-1">
          <MapPin size={10} aria-hidden="true" /> {travelLabel}
        </div>
      </div>
    </button>
  );
}

/** Display order for category sections — matches the order in the Lark type system. */
const CATEGORY_ORDER: Category[] = [
  'museum_gallery', 'historical', 'religious_site', 'nature_landscape', 'park_garden',
  'neighbourhood_walks', 'beach_water', 'active',
  'food_drink', 'nightlife', 'theatre_concert', 'amusement_park',
  'entertainment', 'zoo_aquarium', 'wellness', 'shopping', 'other',
];

export default function Discover({ profile, items, onAddPlace, onBack, onOpenSettings }: Props) {
  const [places, setPlaces] = useState<DiscoverPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    getDiscoverPlaces(profile, items).then(p => {
      if (!cancelled) { setPlaces(p); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [profile, items]);

  const categoriesPresent = CATEGORY_ORDER.filter(c => places.some(p => p.category === c));
  const filtered = filter === 'all' ? places : places.filter(p => p.category === filter);

  // Group by category and render a section per category, in CATEGORY_ORDER.
  const sections = categoriesPresent
    .filter(c => filter === 'all' || c === filter)
    .map(c => ({ category: c, items: filtered.filter(p => p.category === c) }))
    .filter(s => s.items.length > 0);

  const handleAdd = (p: DiscoverPlace) => onAddPlace(toSearchResult(p), p.category);

  return (
    <div className="page-enter pb-24">
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="w-11 h-11 rounded-full bg-sand-100 flex items-center justify-center text-sand-900 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            ←
          </button>
          <h2 className="flex-1 text-xl font-semibold text-sand-900">
            Discover <span className="heading-accent">nearby</span>
          </h2>
          <HeaderAvatar profile={profile} onOpen={onOpenSettings} />
        </div>
        <p className="text-xs text-sand-700 mt-2">
          Ideas within 150 km of home — tap one to review and save it.
        </p>
      </div>

      {/* Category filter chips */}
      {categoriesPresent.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-6 pb-4 scrollbar-hide">
          <button onClick={() => setFilter('all')}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === 'all' ? 'bg-sand-900 text-sand-100 border-sand-900' : 'bg-white text-sand-700 border-sand-200'}`}>
            All
          </button>
          {categoriesPresent.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                filter === c ? 'bg-sand-900 text-sand-100 border-sand-900' : 'bg-white text-sand-700 border-sand-200'}`}>
              {CATEGORY_INFO[c].label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="text-center py-16">
          <div className="w-10 h-10 mx-auto rounded-full bg-sand-100 flex items-center justify-center mb-3">
            <div className="w-5 h-5 border-2 border-sand-300 border-t-sand-700 rounded-full animate-spin" />
          </div>
          <p className="text-sm text-sand-600">Finding things to do near you...</p>
        </div>
      )}

      {!loading && sections.map(s => (
        <div key={s.category} className="mb-6">
          <h3 className="px-6 text-sm font-semibold text-sand-900 mb-3">{CATEGORY_INFO[s.category].label}</h3>
          <div className="grid grid-cols-2 gap-3 px-6">
            {s.items.map(p => <DiscoverCard key={p.key} place={p} onAdd={() => handleAdd(p)} />)}
          </div>
        </div>
      ))}

      {!loading && filtered.length === 0 && (
        <div className="text-center px-6 py-12">
          <p className="text-sm text-sand-700">
            Nothing new to show around here yet — you may have saved it all already!
          </p>
        </div>
      )}
    </div>
  );
}
