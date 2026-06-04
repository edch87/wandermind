import { useState, useEffect } from 'react';
import type { UserProfile, BucketListItem, Category, HereSearchResult } from '../types';
import { CATEGORY_INFO } from '../types';
import { getDiscoverPlaces, toSearchResult, type DiscoverPlace } from '../utils/discover';
import PlaceholderImage from './PlaceholderImage';
import { UsersThree, Sparkle, MapPin } from '@phosphor-icons/react';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onAddPlace: (place: HereSearchResult, category: Category) => void;
  onBack: () => void;
}

export function DiscoverCard({ place, onAdd }: { place: DiscoverPlace; onAdd: () => void }) {
  return (
    <button onClick={onAdd} className="card text-left w-full">
      <div className="place-img-container h-28 overflow-hidden">
        {place.imageUrl ? (
          <img src={place.imageUrl} alt={place.name} loading="lazy" className="place-img"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = 'none';
              const placeholder = img.nextElementSibling as HTMLElement | null;
              if (placeholder) placeholder.style.display = 'flex';
            }} />
        ) : null}
        <PlaceholderImage category={place.category} className={place.imageUrl ? 'hidden' : ''} />
      </div>
      <div className="p-3">
        <div className="text-xs font-medium text-sand-900 truncate">{place.name}</div>
        <div className="text-[10px] text-sand-700 mt-1 flex items-center gap-1">
          <MapPin size={10} /> ~{place.distanceKm} km
        </div>
        <div className="mt-2">
          {place.source === 'community' ? (
            <span className="badge bg-forest-500/10 text-forest-500 inline-flex items-center gap-1">
              <UsersThree size={11} /> Saved by {place.saveCount}
            </span>
          ) : (
            <span className="badge bg-sand-100 text-sand-700 inline-flex items-center gap-1">
              <Sparkle size={11} /> {CATEGORY_INFO[place.category].label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Discover({ profile, items, onAddPlace, onBack }: Props) {
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

  const categoriesPresent = [...new Set(places.map(p => p.category))];
  const filtered = filter === 'all' ? places : places.filter(p => p.category === filter);
  const community = filtered.filter(p => p.source === 'community');
  const notable = filtered.filter(p => p.source === 'wikidata');

  const handleAdd = (p: DiscoverPlace) => onAddPlace(toSearchResult(p), p.category);

  return (
    <div className="page-enter pb-24">
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-600 text-sm">←</button>
          <h2 className="text-xl font-semibold text-sand-900">
            Discover <span className="heading-accent">nearby</span>
          </h2>
        </div>
        <p className="text-xs text-sand-700 mt-2">
          Ideas within 100 km of home — tap one to review and save it.
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

      {!loading && community.length > 0 && (
        <div className="mb-6">
          <h3 className="px-6 text-sm font-semibold text-sand-900 mb-3">Loved by other larkers</h3>
          <div className="grid grid-cols-2 gap-3 px-6">
            {community.map(p => <DiscoverCard key={p.key} place={p} onAdd={() => handleAdd(p)} />)}
          </div>
        </div>
      )}

      {!loading && notable.length > 0 && (
        <div className="mb-6">
          <h3 className="px-6 text-sm font-semibold text-sand-900 mb-3">Worth knowing about</h3>
          <div className="grid grid-cols-2 gap-3 px-6">
            {notable.map(p => <DiscoverCard key={p.key} place={p} onAdd={() => handleAdd(p)} />)}
          </div>
        </div>
      )}

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
