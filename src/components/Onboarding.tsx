import { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { searchPlaces, reverseGeocode, HERE_TILE_URL, HERE_TILE_ATTRIBUTION } from '../utils/api';
import { supabase } from '../utils/supabase';
import { generateId } from '../utils/storage';
import { markHomePinRefined } from '../utils/homePinPrompt';
import type { UserProfile, BucketListItem, HereSearchResult, Category } from '../types';
import { CATEGORY_INFO } from '../types';
import { MapPin, Target, BookOpen, Shuffle, Check } from '@phosphor-icons/react';
import KiteIcon from './KiteIcon';
import PlaceholderImage from './PlaceholderImage';
import curatedMunich from '../data/curated/munich.json';

interface Props {
  displayName: string;
  /** Called when onboarding is complete. seedItems will be the curated places the
   *  user opted into from the discover step (may be empty if they skipped). */
  onComplete: (profile: UserProfile, seedItems?: BucketListItem[]) => void;
}

/** Shape of an entry in src/data/curated/*.json — runtime fields only. */
interface CuratedEntry {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  category: Category;
  city?: string;
  country?: string;
  address?: string;
  description?: string;
  url?: string;
  setting: BucketListItem['setting'];
  weatherSuitability: BucketListItem['weatherSuitability'];
  durationEstimate: BucketListItem['durationEstimate'];
  costLevel: BucketListItem['costLevel'];
  bestSeasons: BucketListItem['bestSeasons'];
  bestTimesOfDay: BucketListItem['bestTimesOfDay'];
  groupSuitability: BucketListItem['groupSuitability'];
  imageUrl?: string;
  wikidataQid?: string;
}

const ALL_CURATED: CuratedEntry[] = curatedMunich as CuratedEntry[];
const DISCOVER_RADIUS_KM = 150;
/** Rough average travel speed (km/h) used to seed travelTimeMinutes. The
 *  recommendation flow recomputes via HERE routing on the fly, so the saved
 *  number is just a placeholder until the first recommendation. */
const SEED_TRAVEL_SPEED_KMH = 60;

const CAROUSEL_SLIDES = [
  {
    icon: <MapPin size={28} />,
    title: 'Add a place',
    description: 'Search for anywhere you\'d like to visit. We fill in the details.',
  },
  {
    icon: <Target size={28} />,
    title: 'Get a recommendation',
    description: 'Tell us your mood, how long you\'ve got, and who\'s coming. We\'ll pick the best spot — weather and all.',
  },
  {
    icon: <BookOpen size={28} />,
    title: 'Track your adventures',
    description: 'Mark places as done, rate them, and add notes so that you can share and revisit the ones you love.',
  },
  {
    icon: <Shuffle size={28} />,
    title: 'Feeling spontaneous?',
    description: 'No time to plan? Hit shuffle and we\'ll pick something for you based on what\'s nearby and what the weather\'s doing.',
  },
];

const CATEGORY_ORDER: Category[] = [
  'museum_gallery', 'historical', 'nature_landscape', 'park_garden',
  'hiking_trails', 'beach_water', 'active_adventure',
  'food_drink', 'nightlife', 'entertainment', 'wellness',
  'zoo_aquarium', 'event_festival', 'neighbourhood_walks',
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Build a saveable BucketListItem from a curated entry + user's home. */
function curatedToBucketListItem(entry: CuratedEntry, profile: UserProfile): BucketListItem {
  const distanceKm = haversineKm(profile.homeLatitude, profile.homeLongitude, entry.latitude, entry.longitude);
  const travelMinutes = Math.round((distanceKm / SEED_TRAVEL_SPEED_KMH) * 60);
  const addressLine = entry.address || [entry.city, entry.country].filter(Boolean).join(', ');
  return {
    id: generateId(),
    status: 'want_to_do',
    createdAt: new Date().toISOString(),
    name: entry.name,
    description: entry.description,
    latitude: entry.latitude,
    longitude: entry.longitude,
    photoUrl: entry.imageUrl,
    address: addressLine,
    city: entry.city,
    country: entry.country,
    url: entry.url,
    travelTimeMinutes: travelMinutes,
    travelDistanceKm: Math.round(distanceKm * 10) / 10,
    transportMode: profile.preferredTransport,
    category: entry.category,
    setting: entry.setting,
    weatherSuitability: entry.weatherSuitability,
    durationEstimate: entry.durationEstimate,
    costLevel: entry.costLevel,
    bestSeasons: entry.bestSeasons,
    bestTimesOfDay: entry.bestTimesOfDay,
    groupSuitability: entry.groupSuitability,
    priority: 'medium',
    tags: [],
    osmTags: entry.wikidataQid ? { wikidata_qid: entry.wikidataQid } : {},
  };
}

type Step = 'welcome' | 'carousel' | 'location' | 'pin' | 'discover';

export default function Onboarding({ displayName, onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [slideIndex, setSlideIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HereSearchResult[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [searching, setSearching] = useState(false);

  // Discover-step selection state (keyed by curated entry key)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  // Shown after the user taps the final button. onComplete runs profile + items
  // upserts in the parent which can take a few seconds; without this the user
  // sees a frozen screen.
  const [completingMessage, setCompletingMessage] = useState<string | null>(null);

  // Swipe handling
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Build the map for the dedicated pin-refine step. The marker is draggable so
  // users can nudge it after autocomplete drops them roughly the right place.
  // Tapping anywhere on the map also moves the pin. On drag-end or click we
  // reverse-geocode to keep the human-readable address in sync.
  useEffect(() => {
    if (step !== 'pin' || !mapRef.current || mapInstance.current || !selectedLocation) return;

    const map = L.map(mapRef.current).setView([selectedLocation.lat, selectedLocation.lng], 16);
    L.tileLayer(HERE_TILE_URL, { attribution: HERE_TILE_ATTRIBUTION }).addTo(map);

    const marker = L.marker([selectedLocation.lat, selectedLocation.lng], { draggable: true }).addTo(map);

    const updateFromMap = async (lat: number, lng: number) => {
      const geo = await reverseGeocode(lat, lng);
      setSelectedLocation({
        lat,
        lng,
        address: geo?.address.label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
    };

    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      void updateFromMap(lat, lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      void updateFromMap(lat, lng);
    });

    mapInstance.current = map;
    markerRef.current = marker;
  }, [step, selectedLocation]);

  // When leaving the pin step (e.g. user taps Back), tear the map down so it can
  // be re-created cleanly if they return.
  useEffect(() => {
    if (step !== 'pin' && mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
      markerRef.current = null;
    }
  }, [step]);

  // Curated entries within 150km of the user's home, grouped by category.
  const nearbyCurated = useMemo(() => {
    if (!selectedLocation) return [] as CuratedEntry[];
    return ALL_CURATED
      .map(e => ({
        entry: e,
        km: haversineKm(selectedLocation.lat, selectedLocation.lng, e.latitude, e.longitude),
      }))
      .filter(x => x.km <= DISCOVER_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .map(x => x.entry);
  }, [selectedLocation]);

  const categoriesPresent = CATEGORY_ORDER.filter(c => nearbyCurated.some(e => e.category === c));

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchPlaces(searchQuery);
    setSearchResults(results);
    setSearching(false);
  };

  const selectSearchResult = (result: HereSearchResult) => {
    setSelectedLocation({ lat: result.position.lat, lng: result.position.lng, address: result.address.label });
    setSearchResults([]);
    setSearchQuery(result.title);
  };

  /** Build the profile from the current location state. */
  const buildProfile = async (): Promise<UserProfile | null> => {
    if (!selectedLocation) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return {
      id: user.id,
      displayName: displayName,
      homeLatitude: selectedLocation.lat,
      homeLongitude: selectedLocation.lng,
      homeAddress: selectedLocation.address,
      preferredTransport: 'car',
      hasDog: false,
      hasKids: false,
      needsAccessibility: false,
      onboardingComplete: true,
    };
  };

  // From the pin step: go to discover if there are nearby curated entries,
  // otherwise skip straight to completion (clean fallback for users outside Munich).
  const goToDiscoverOrFinish = async () => {
    const profile = await buildProfile();
    if (!profile) return;
    // User went through the new pin step, so they don't need the refine banner.
    markHomePinRefined(profile.id);
    // Quick filter without waiting for useMemo recompute
    const hasNearby = ALL_CURATED.some(e =>
      haversineKm(profile.homeLatitude, profile.homeLongitude, e.latitude, e.longitude) <= DISCOVER_RADIUS_KM,
    );
    if (hasNearby) {
      setStep('discover');
    } else {
      setCompletingMessage('Setting things up...');
      await onComplete(profile);
    }
  };

  const toggleSelection = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleFinishDiscover = async (withSelection: boolean) => {
    const profile = await buildProfile();
    if (!profile) return;
    if (!withSelection || selectedKeys.size === 0) {
      setCompletingMessage('Almost there...');
      await onComplete(profile);
      return;
    }
    const chosen = nearbyCurated.filter(e => selectedKeys.has(e.key));
    const items = chosen.map(e => curatedToBucketListItem(e, profile));
    setCompletingMessage('Building your list...');
    await onComplete(profile, items);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && slideIndex < CAROUSEL_SLIDES.length - 1) {
        setSlideIndex(slideIndex + 1);
      } else if (diff < 0 && slideIndex > 0) {
        setSlideIndex(slideIndex - 1);
      }
    }
  };

  // ── Completion interstitial ──
  // Shown after the user taps the final button while the parent runs its
  // profile + items writes. Wins over every other render so the user sees
  // a clear "we're working on it" signal instead of a frozen previous screen.
  if (completingMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-sand-50">
        <KiteIcon size={48} className="text-sand-900 mb-6 animate-pulse" />
        <p className="text-sand-700 text-base">{completingMessage}</p>
      </div>
    );
  }

  // ── Welcome screen ──
  if (step === 'welcome') {
    const firstName = displayName.split(' ')[0] || 'there';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-sand-50">
        <KiteIcon size={48} className="text-sand-900 mb-6" />
        <h1 className="text-3xl font-semibold text-sand-900 mb-2">Welcome, {firstName}!</h1>
        <p className="text-sand-700 text-sm mb-10 max-w-xs leading-relaxed">
          Here's how Lark works — it only takes a minute.
        </p>
        <button
          onClick={() => setStep('carousel')}
          className="w-full max-w-xs bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 transition"
        >
          Show me
        </button>
      </div>
    );
  }

  // ── Feature carousel ──
  if (step === 'carousel') {
    const slide = CAROUSEL_SLIDES[slideIndex];
    const isLast = slideIndex === CAROUSEL_SLIDES.length - 1;

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-sand-50"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          onClick={() => setStep('location')}
          className="absolute top-6 right-6 text-sm text-sand-600 hover:text-sand-700 transition"
        >
          Skip
        </button>

        <div className="w-16 h-16 rounded-[20px] bg-sand-200 flex items-center justify-center text-sand-700 mb-8">
          {slide.icon}
        </div>

        <h2 className="text-2xl font-semibold text-sand-900 mb-3">{slide.title}</h2>
        <p className="text-sand-700 text-sm leading-relaxed max-w-xs mb-10">
          {slide.description}
        </p>

        <div className="flex gap-2 mb-8">
          {CAROUSEL_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === slideIndex ? 'bg-sand-900 w-6' : 'bg-sand-300'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => {
            if (isLast) {
              setStep('location');
            } else {
              setSlideIndex(slideIndex + 1);
            }
          }}
          className="w-full max-w-xs bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 transition"
        >
          {isLast ? 'Get started' : 'Next'}
        </button>
      </div>
    );
  }

  // ── Discover step (between location and completion) ──
  if (step === 'discover') {
    const filteredCurated = categoryFilter === 'all'
      ? nearbyCurated
      : nearbyCurated.filter(e => e.category === categoryFilter);

    // Group filtered entries by category, ordered by CATEGORY_ORDER
    const sections = CATEGORY_ORDER
      .filter(c => categoryFilter === 'all' || c === categoryFilter)
      .map(c => ({ category: c, items: filteredCurated.filter(e => e.category === c) }))
      .filter(s => s.items.length > 0);

    return (
      <div className="min-h-screen bg-sand-50 pb-28">
        <div className="px-6 pt-8 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-sand-900">
              A few <span className="heading-accent">to start</span>
            </h2>
            <button
              onClick={() => handleFinishDiscover(false)}
              className="text-sm text-sand-600 hover:text-sand-900 transition"
            >
              Skip
            </button>
          </div>
          <p className="text-xs text-sand-700 mt-2">
            Tap any place to add it to your bucket list — you can always add more later.
          </p>
        </div>

        {/* Category filter chips */}
        {categoriesPresent.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-6 pb-3 scrollbar-hide">
            <button onClick={() => setCategoryFilter('all')}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                categoryFilter === 'all' ? 'bg-sand-900 text-sand-100 border-sand-900' : 'bg-white text-sand-700 border-sand-200'}`}>
              All
            </button>
            {categoriesPresent.map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                  categoryFilter === c ? 'bg-sand-900 text-sand-100 border-sand-900' : 'bg-white text-sand-700 border-sand-200'}`}>
                {CATEGORY_INFO[c].label}
              </button>
            ))}
          </div>
        )}

        {/* Sections */}
        {sections.map(s => (
          <div key={s.category} className="mb-5">
            <h3 className="px-6 text-sm font-semibold text-sand-900 mb-2">{CATEGORY_INFO[s.category].label}</h3>
            <div className="grid grid-cols-2 gap-3 px-6">
              {s.items.map(entry => {
                const isSelected = selectedKeys.has(entry.key);
                return (
                  <button
                    key={entry.key}
                    onClick={() => toggleSelection(entry.key)}
                    className={`card text-left w-full relative transition-all ${
                      isSelected ? 'ring-2 ring-sand-900 ring-offset-1 ring-offset-sand-50' : ''
                    }`}
                  >
                    <div className="place-img-container h-24 overflow-hidden">
                      {entry.imageUrl ? (
                        <img src={entry.imageUrl} alt={entry.name} loading="lazy" className="place-img"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = 'none';
                            const placeholder = img.nextElementSibling as HTMLElement | null;
                            if (placeholder) placeholder.style.display = 'flex';
                          }} />
                      ) : null}
                      <PlaceholderImage category={entry.category} className={entry.imageUrl ? 'hidden' : ''} />
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-sand-900 flex items-center justify-center shadow-sm">
                          <Check size={14} color="#fff" weight="bold" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs font-medium text-sand-900 truncate">{entry.name}</div>
                      <div className="text-[10px] text-sand-600 mt-0.5">
                        {Math.round(haversineKm(selectedLocation!.lat, selectedLocation!.lng, entry.latitude, entry.longitude))} km away
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {filteredCurated.length === 0 && (
          <div className="text-center px-6 py-12">
            <p className="text-sm text-sand-700">Nothing in this category.</p>
          </div>
        )}

        {/* Sticky bottom action bar */}
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/95 backdrop-blur border-t border-sand-200 px-6 pt-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => handleFinishDiscover(true)}
            disabled={selectedKeys.size === 0}
            className="w-full bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            {selectedKeys.size === 0
              ? 'Pick a few places to start'
              : `Add ${selectedKeys.size} ${selectedKeys.size === 1 ? 'place' : 'places'}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Pin refine step ──
  if (step === 'pin') {
    return (
      <div className="min-h-screen flex flex-col bg-sand-50">
        <div className="px-6 pt-8 pb-3">
          <h2 className="text-xl font-semibold text-sand-900">
            Fine-tune <span className="heading-accent">the pin</span>
          </h2>
          <p className="text-sm text-sand-700 mt-1">
            Drag the pin, or tap the map, to drop it exactly on your home.
          </p>
        </div>

        <div ref={mapRef} className="flex-1 mx-6 rounded-[20px] border border-sand-200 min-h-[55vh]" />

        {selectedLocation && (
          <p className="text-xs text-sand-700 px-6 pt-3 truncate">
            {selectedLocation.address}
          </p>
        )}

        <div
          className="px-6 pt-3 flex gap-2"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setStep('location')}
            className="flex-1 py-3.5 rounded-full font-medium text-sm border border-sand-300 text-sand-800 hover:bg-sand-100 transition"
          >
            Back
          </button>
          <button
            onClick={goToDiscoverOrFinish}
            disabled={!selectedLocation}
            className="flex-[2] bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            This is home
          </button>
        </div>
      </div>
    );
  }

  // ── Location setup ──
  return (
    <div className="min-h-screen px-6 py-8 bg-sand-50">
      <div className="mb-1">
        <h2 className="text-xl font-semibold text-sand-900 mt-1">
          Where's <span className="heading-accent">home?</span>
        </h2>
        <p className="text-sm text-sand-700 mt-1">
          We use this to work out travel times. The more precise the better, and you can fine-tune the pin on the next step.
        </p>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">
          Home location
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Street, neighbourhood, or postcode"
            className="flex-1 px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-5 py-3 bg-sand-900 text-sand-100 rounded-full text-sm font-medium hover:bg-sand-800 disabled:opacity-50"
          >
            {searching ? '...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-white border border-sand-200 rounded-[20px] mb-3 max-h-40 overflow-auto">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => selectSearchResult(r)}
                className="w-full text-left px-4 py-3 text-sm hover:bg-sand-50 border-b border-sand-100 last:border-0 text-sand-800"
              >
                {r.address.label}
              </button>
            ))}
          </div>
        )}

        {selectedLocation && (
          <p className="text-xs text-forest-600 mb-4 px-1">
            ✓ {selectedLocation.address.substring(0, 80)}
          </p>
        )}
      </div>

      <button
        onClick={() => setStep('pin')}
        disabled={!selectedLocation}
        className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 disabled:opacity-30 disabled:cursor-not-allowed transition mt-2"
      >
        Continue
      </button>
    </div>
  );
}
