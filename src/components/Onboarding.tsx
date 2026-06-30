import { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { searchPlaces, reverseGeocode } from '../utils/api';
import { supabase } from '../utils/supabase';
import { generateId } from '../utils/storage';
import { markHomePinRefined } from '../utils/homePinPrompt';
import type { UserProfile, BucketListItem, HereSearchResult, Category } from '../types';
import { CATEGORY_INFO } from '../types';
import { MapPin, Target, BookOpen, Shuffle, Check } from '@phosphor-icons/react';
import KiteIcon from './KiteIcon';
import PlaceImg from './PlaceImg';
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
// Seeded discover items get per-mode times filled on the user's next home
// change or via Settings → "Refresh travel times". Until then the recommend
// flow falls back to haversine × speed-table for any null per-mode field.

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
  'museum_gallery', 'historical', 'religious_site', 'nature_landscape', 'park_garden',
  'neighbourhood_walks', 'beach_water', 'active',
  'food_drink', 'nightlife', 'theatre_concert', 'amusement_park',
  'entertainment', 'zoo_aquarium', 'wellness', 'shopping', 'other',
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
    travelDistanceKm: Math.round(distanceKm * 10) / 10,
    walkMinutes: null,
    bikeMinutes: null,
    carMinutes: null,
    transitMinutes: null,
    category: entry.category,
    setting: entry.setting,
    weatherSuitability: entry.weatherSuitability,
    durationEstimate: entry.durationEstimate,
    costLevel: entry.costLevel,
    bestSeasons: entry.bestSeasons,
    bestTimesOfDay: entry.bestTimesOfDay,
    // Strip `family` from legacy seed data (dropped from GroupType in 2026-06-24 pass).
    groupSuitability: (entry.groupSuitability as unknown as string[])
      .filter((g): g is BucketListItem['groupSuitability'][number] =>
        g === 'solo' || g === 'couple' || g === 'friends' || g === 'kids'),
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
  // Tracks whether the user has run at least one search whose result is the
  // current `searchResults`. Lets us distinguish "haven't searched yet" from
  // "searched and got zero" so the empty-state copy only shows in the latter
  // case. Cleared whenever the query string changes.
  const [hasSearched, setHasSearched] = useState(false);

  // Pin-step editable address field — the screen-reader / keyboard fallback
  // for users who can't interact with the Leaflet map. Kept in sync with
  // selectedLocation.address whenever the map moves the pin, and forward-
  // geocodes via searchPlaces when the user submits.
  const [pinAddressInput, setPinAddressInput] = useState('');
  const [pinAddressError, setPinAddressError] = useState<string | null>(null);
  const [pinAddressLooking, setPinAddressLooking] = useState(false);

  // "Use my location" button (location step). Reverse-geocodes the GPS coords
  // straight into selectedLocation so the user can skip typing an address.
  const [geoLooking, setGeoLooking] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Brief visual pulse on the centre crosshair pin when selectedLocation
  // changes from a non-map source (address field or GPS). Closes the loop so
  // users see the pin "jumped" rather than wondering if the address went in.
  const [pinPulse, setPinPulse] = useState(false);

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
  // Debounce timer for the as-you-type suggest on the location step. Mirrors
  // the AddPlace search pattern: fire searchPlaces after the user pauses
  // typing for 600ms, never below the 3-char floor in searchPlaces itself.
  const searchTimeout = useRef<number | null>(null);
  // Holds the latest selectedLocation for the map's moveend closure, which is
  // attached once and would otherwise hold a stale value across re-renders.
  // Mirrored inside an effect below.
  const selectedLocationRef = useRef<{ lat: number; lng: number; address: string } | null>(null);

  // Build the map for the dedicated pin-refine step. We use a centre-crosshair
  // model: the pin is a fixed DOM overlay at the map's centre, and users drag
  // the map underneath it. On moveend (the user lets go), we reverse-geocode
  // the new centre to keep the human-readable address in sync. Tiles are Carto
  // Positron — light, attribution-only, and visually calmer than HERE explore.
  //
  // Init depends only on `step` — selectedLocation is read through a ref so
  // the user dragging the map (which mutates selectedLocation) doesn't tear
  // the map down and rebuild it. Cleanup is colocated so React's StrictMode
  // mount → unmount → mount cycle in dev properly disposes the first instance
  // before the second one is created (previous code skipped re-init on the
  // remount because mapInstance.current was still set, leaving the new DOM
  // node empty).
  useEffect(() => {
    if (step !== 'pin' || !mapRef.current) return;
    const sl = selectedLocationRef.current;
    if (!sl) return;

    const container = mapRef.current;
    const map = L.map(container, { zoomControl: true }).setView(
      [sl.lat, sl.lng],
      16,
    );
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Reverse-geocode the map's current centre and write back to state. We
    // skip when the centre already matches selectedLocation — that's how
    // programmatic recentres (from address submit or GPS) avoid pinging the
    // API a second time.
    map.on('moveend', () => {
      const c = map.getCenter();
      const cur = selectedLocationRef.current;
      if (
        cur &&
        Math.abs(c.lat - cur.lat) < 1e-6 &&
        Math.abs(c.lng - cur.lng) < 1e-6
      ) {
        return;
      }
      void (async () => {
        const geo = await reverseGeocode(c.lat, c.lng);
        setSelectedLocation({
          lat: c.lat,
          lng: c.lng,
          address: geo?.address.label || `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`,
        });
      })();
    });

    mapInstance.current = map;

    // Belt-and-braces invalidateSize. 0ms covers normal first-paint; 200ms
    // catches slow layouts (iOS Safari resolving dvh, in-app webview, etc.)
    // where the container's height is still 0 on the next tick.
    const t1 = window.setTimeout(() => map.invalidateSize(), 0);
    const t2 = window.setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.off();
      map.remove();
      if (mapInstance.current === map) {
        mapInstance.current = null;
      }
    };
  }, [step]);

  // Mirror selectedLocation.address into the editable pin-step input so the
  // canonical address always appears in the field (drag the map → field
  // updates; pick a search result → field updates).
  useEffect(() => {
    if (selectedLocation) setPinAddressInput(selectedLocation.address);
  }, [selectedLocation]);

  // Mirror selectedLocation into the ref so the moveend closure always reads
  // the latest value (the listener is attached once).
  useEffect(() => {
    selectedLocationRef.current = selectedLocation;
  }, [selectedLocation]);

  // Clear the search-debounce timer when Onboarding unmounts so a late
  // callback never tries to setState on a dead component.
  useEffect(() => {
    return () => {
      if (searchTimeout.current !== null) {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = null;
      }
    };
  }, []);

  // Sync the map's centre when selectedLocation changes from a non-map source
  // (the editable address input or the "Use my location" button). We compare
  // against the map's current centre and skip if they already match, which
  // avoids a feedback loop when the change came from the map itself
  // (moveend writes back into selectedLocation).
  useEffect(() => {
    if (step !== 'pin' || !selectedLocation || !mapInstance.current) return;
    const c = mapInstance.current.getCenter();
    if (Math.abs(c.lat - selectedLocation.lat) < 1e-6 && Math.abs(c.lng - selectedLocation.lng) < 1e-6) return;
    mapInstance.current.setView([selectedLocation.lat, selectedLocation.lng], mapInstance.current.getZoom() ?? 16);
  }, [step, selectedLocation]);

  // Trigger a short visual pulse on the centre crosshair so the user gets
  // confirmation that their non-map action (address submit, GPS) moved the
  // pin. Reset is on a timer; if the user fires another pulse quickly we
  // re-trigger by toggling off→on.
  const triggerPinPulse = () => {
    setPinPulse(false);
    requestAnimationFrame(() => setPinPulse(true));
    setTimeout(() => setPinPulse(false), 500);
  };

  // Forward-geocode the typed address and move the pin. Restores the canonical
  // address on failure so the field doesn't end up holding text that no longer
  // matches the pin.
  const handlePinAddressSubmit = async () => {
    if (!pinAddressInput.trim()) return;
    if (selectedLocation && pinAddressInput.trim() === selectedLocation.address) return;
    setPinAddressError(null);
    setPinAddressLooking(true);
    const results = await searchPlaces(pinAddressInput);
    setPinAddressLooking(false);
    if (results.length === 0) {
      setPinAddressError("Couldn't find that address. Try a city or postcode.");
      if (selectedLocation) setPinAddressInput(selectedLocation.address);
      return;
    }
    const top = results[0];
    setSelectedLocation({
      lat: top.position.lat,
      lng: top.position.lng,
      address: top.address.label,
    });
    triggerPinPulse();
  };

  // "Use my location" — geolocation API + reverse-geocode. Used on the
  // location step so the user can skip the search box entirely. Capacitor's
  // Geolocation plugin is unnecessary here because the WKWebView surfaces
  // navigator.geolocation natively (with a one-time iOS permission prompt).
  const handleUseMyLocation = async () => {
    if (!('geolocation' in navigator)) {
      setGeoError('Location is not available on this device.');
      return;
    }
    setGeoError(null);
    setGeoLooking(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      const { latitude, longitude } = position.coords;
      const geo = await reverseGeocode(latitude, longitude);
      setSelectedLocation({
        lat: latitude,
        lng: longitude,
        address: geo?.address.label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      });
      setHasSearched(false);
      setSearchResults([]);
      triggerPinPulse();
    } catch (err) {
      const e = err as GeolocationPositionError;
      if (e.code === 1) {
        setGeoError("Location permission denied. You can still type your address below.");
      } else if (e.code === 2) {
        setGeoError("Couldn't get your location. Try typing your address below.");
      } else if (e.code === 3) {
        setGeoError("Location request timed out. Try typing your address below.");
      } else {
        setGeoError("Couldn't get your location. Try typing your address below.");
      }
    } finally {
      setGeoLooking(false);
    }
  };

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

  // As-you-type suggest. Called from the input's onChange. Debounces so we
  // don't fire a request on every keystroke; AddPlace uses the same shape.
  const handleSearchInput = (q: string) => {
    setSearchQuery(q);
    if (hasSearched) setHasSearched(false);
    // Typing should invalidate any previously-selected pin — otherwise the
    // green confirmation line stays on screen while the user is clearly
    // changing their mind.
    if (selectedLocation && q !== selectedLocation.address) {
      setSelectedLocation(null);
    }
    if (searchTimeout.current !== null) {
      clearTimeout(searchTimeout.current);
      searchTimeout.current = null;
    }
    if (q.trim().length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeout.current = window.setTimeout(async () => {
      const results = await searchPlaces(q);
      setSearchResults(results);
      setHasSearched(true);
      setSearching(false);
    }, 600);
  };

  // Enter key — flush the debounce and search immediately.
  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) return;
    if (searchTimeout.current !== null) {
      clearTimeout(searchTimeout.current);
      searchTimeout.current = null;
    }
    setSearching(true);
    const results = await searchPlaces(searchQuery);
    setSearchResults(results);
    setHasSearched(true);
    setSearching(false);
  };

  const selectSearchResult = (result: HereSearchResult) => {
    setSelectedLocation({ lat: result.position.lat, lng: result.position.lng, address: result.address.label });
    setSearchResults([]);
    setHasSearched(false);
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
        <KiteIcon size={48} className="text-sand-900 mb-6" animate />
        <p className="text-sand-700 text-base">{completingMessage}</p>
      </div>
    );
  }

  // ── Welcome screen ──
  if (step === 'welcome') {
    const firstName = displayName.split(' ')[0] || 'there';
    return (
      <div
        className="flex flex-col items-center justify-center px-8 text-center bg-sand-50"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
        <KiteIcon size={56} className="text-sand-900 mb-6" animate />
        <h1 className="text-3xl font-semibold text-sand-900 mb-2">
          <span className="heading-accent">Welcome</span>, {firstName}!
        </h1>
        <p className="text-sand-700 text-sm mb-10 max-w-xs leading-relaxed">
          Here's how Lark works — it only takes a minute.
        </p>
        <button
          onClick={() => setStep('carousel')}
          className="w-full max-w-xs bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
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
        className="relative flex flex-col items-center justify-center px-8 text-center bg-sand-50"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          onClick={() => setStep('location')}
          aria-label="Skip introduction"
          className="absolute top-3 right-3 min-h-[44px] min-w-[44px] px-3 flex items-center justify-center text-sm text-sand-700 hover:text-sand-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 rounded-full"
        >
          Skip
        </button>

        <div className="w-16 h-16 rounded-[20px] bg-sand-200 flex items-center justify-center text-sand-700 mb-8">
          {slide.icon}
        </div>

        <div role="group" aria-roledescription="slide" aria-live="polite">
          <h2 className="text-2xl font-semibold text-sand-900 mb-3">{slide.title}</h2>
          <p className="text-sand-700 text-sm leading-relaxed max-w-xs mb-10 mx-auto">
            {slide.description}
          </p>
        </div>

        <div className="flex gap-1 mb-8" role="tablist" aria-label="Introduction slides">
          {CAROUSEL_SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              role="tab"
              aria-current={i === slideIndex ? 'true' : undefined}
              aria-label={`Go to slide ${i + 1} of ${CAROUSEL_SLIDES.length}: ${s.title}`}
              className="p-3 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-1 focus-visible:ring-offset-sand-50 rounded-full"
            >
              <span
                aria-hidden="true"
                className={`block h-2 rounded-full transition-all ${
                  i === slideIndex ? 'bg-sand-900 w-6' : 'bg-sand-500 w-2'
                }`}
              />
            </button>
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
          className="w-full max-w-xs bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
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

    // Per-category counts for the filter chips (use unfiltered nearbyCurated)
    const countByCategory = CATEGORY_ORDER.reduce<Record<string, number>>((acc, c) => {
      acc[c] = nearbyCurated.filter(e => e.category === c).length;
      return acc;
    }, {});

    const hasSelection = selectedKeys.size > 0;

    return (
      <div
        className="bg-sand-50 pb-28"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
        <div className="px-6 pt-8 pb-3">
          <h2 className="text-xl font-semibold text-sand-900">
            A few <span className="heading-accent">near you</span>
          </h2>
          <p className="text-sm text-sand-700 mt-2">
            Tap any place to add it to your bucket list. You can always add more later.
          </p>
        </div>

        {/* Category filter chips */}
        {categoriesPresent.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-6 pb-3 scrollbar-hide">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              aria-pressed={categoryFilter === 'all'}
              className={`flex-shrink-0 min-h-[44px] px-4 py-2 rounded-full text-sm font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 ${
                categoryFilter === 'all' ? 'bg-sand-900 text-sand-100 border-sand-900' : 'bg-white text-sand-700 border-sand-200'
              }`}
            >
              All ({nearbyCurated.length})
            </button>
            {categoriesPresent.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                aria-pressed={categoryFilter === c}
                className={`flex-shrink-0 min-h-[44px] px-4 py-2 rounded-full text-sm font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 ${
                  categoryFilter === c ? 'bg-sand-900 text-sand-100 border-sand-900' : 'bg-white text-sand-700 border-sand-200'
                }`}
              >
                {CATEGORY_INFO[c].label} ({countByCategory[c]})
              </button>
            ))}
          </div>
        )}

        {/* Sections */}
        {sections.map(s => {
          const headingId = `discover-section-${s.category}`;
          return (
            <div key={s.category} className="mb-5">
              <h3 id={headingId} className="px-6 text-base font-semibold text-sand-900 mb-2">
                {CATEGORY_INFO[s.category].label}
              </h3>
              <div
                role="list"
                aria-labelledby={headingId}
                className="grid grid-cols-2 gap-3 px-6"
              >
                {s.items.map(entry => {
                  const isSelected = selectedKeys.has(entry.key);
                  return (
                    <div key={entry.key} role="listitem">
                      <button
                        type="button"
                        onClick={() => toggleSelection(entry.key)}
                        aria-pressed={isSelected}
                        aria-label={`${entry.name}${isSelected ? ', selected' : ''}`}
                        className={`card text-left w-full relative transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 ${
                          isSelected ? 'ring-2 ring-sand-900 ring-offset-1 ring-offset-sand-50' : ''
                        }`}
                      >
                        <div className="place-img-container h-32 overflow-hidden">
                          <PlaceImg
                            src={entry.imageUrl}
                            alt={entry.name}
                            name={entry.name}
                            category={entry.category}
                          />
                          {isSelected && (
                            <div
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-sand-900 flex items-center justify-center shadow-sm"
                              aria-hidden="true"
                            >
                              <Check size={14} color="#fff" weight="bold" />
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <div className="text-sm font-medium text-sand-900 truncate">{entry.name}</div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredCurated.length === 0 && (
          <div className="text-center px-6 py-12" role="status">
            <p className="text-sm text-sand-700">Nothing in this category.</p>
          </div>
        )}

        {/* Sticky bottom action bar */}
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-sand-50/95 backdrop-blur border-t border-sand-200 px-6 pt-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div aria-live="polite" className="sr-only">
            {hasSelection
              ? `${selectedKeys.size} ${selectedKeys.size === 1 ? 'place' : 'places'} selected`
              : 'No places selected'}
          </div>
          <button
            type="button"
            onClick={() => handleFinishDiscover(hasSelection)}
            className="w-full bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            {hasSelection
              ? `Add ${selectedKeys.size} ${selectedKeys.size === 1 ? 'place' : 'places'}`
              : 'Skip for now'}
          </button>
        </div>
      </div>
    );
  }

  // ── Pin refine step ──
  if (step === 'pin') {
    return (
      <div
        className="flex flex-col bg-sand-50"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
        <div className="px-6 pt-8 pb-3">
          <h2 className="text-xl font-semibold text-sand-900">
            Confirm <span className="heading-accent">your home</span>
          </h2>
          <p className="text-sm text-sand-700 mt-1">
            Drag the map to centre the pin on your home, or edit the address if it's easier. If it's already right, just tap This is home.
          </p>
        </div>

        <div className="mx-6 relative">
          <div
            ref={mapRef}
            role="application"
            aria-label="Interactive map. Drag to centre the pin on your home. If you can't use the map, edit the address field below."
            className="rounded-[20px] border border-sand-200 overflow-hidden"
            style={{ height: '55vh', minHeight: '320px' }}
          />
          {/* Centre crosshair pin — pure DOM overlay, never moves; the user
              drags the map underneath. pointer-events-none so it doesn't
              swallow drag gestures. translate-y on the wrapper anchors the
              pin's tip (bottom-centre) to the crosshair point. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[400]" aria-hidden="true">
            <div className="-translate-y-1/2">
              <div className={pinPulse ? 'pin-pulse' : ''}>
                <MapPin
                  size={40}
                  weight="fill"
                  className="text-sand-900"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(45, 27, 14, 0.35))' }}
                />
              </div>
            </div>
          </div>
        </div>

        <form
          className="px-6 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePinAddressSubmit();
          }}
        >
          <label htmlFor="pin-address-input" className="text-xs font-medium text-sand-700 uppercase tracking-wider mb-1 block">
            Home address
          </label>
          <input
            id="pin-address-input"
            type="text"
            value={pinAddressInput}
            onChange={(e) => {
              setPinAddressInput(e.target.value);
              if (pinAddressError) setPinAddressError(null);
            }}
            onBlur={() => void handlePinAddressSubmit()}
            placeholder="Street, city, or postcode"
            autoComplete="street-address"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
            enterKeyHint="done"
            disabled={pinAddressLooking}
            className="w-full px-4 py-2.5 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-700 focus:ring-2 focus:ring-sand-700/30 bg-white disabled:opacity-60"
          />
          <div aria-live="polite" className="sr-only">
            {pinAddressLooking ? 'Looking up address' : pinAddressError ?? ''}
          </div>
          {pinAddressError && (
            <p className="text-sm text-terra-600 mt-2" role="alert">
              {pinAddressError}
            </p>
          )}
        </form>

        <div
          className="px-6 pt-3 mt-auto flex gap-2"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setStep('location')}
            aria-label="Back to home location search"
            className="flex-1 min-h-[44px] py-3.5 rounded-full font-medium text-sm border border-sand-300 text-sand-800 hover:bg-sand-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            Back
          </button>
          <button
            onClick={goToDiscoverOrFinish}
            disabled={!selectedLocation}
            className="flex-[2] min-h-[44px] bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 disabled:opacity-30 disabled:cursor-not-allowed transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            This is home
          </button>
        </div>
      </div>
    );
  }

  // ── Location setup ──
  return (
    <div
      className="px-6 py-8 bg-sand-50"
      style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
    >
      <div className="mb-1">
        <h2 className="text-xl font-semibold text-sand-900 mt-1">
          Where's <span className="heading-accent">home?</span>
        </h2>
        <p className="text-sm text-sand-700 mt-1">
          We use this to work out travel times. The more precise the better, and you can fine-tune the pin on the next step.
        </p>
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSearchSubmit();
        }}
      >
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={geoLooking}
          className="w-full min-h-[44px] mb-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-sand-300 text-sand-800 rounded-full text-sm font-medium hover:bg-sand-100 disabled:opacity-60 disabled:cursor-not-allowed transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
        >
          <Target size={18} weight="bold" aria-hidden="true" />
          <span>{geoLooking ? 'Finding you…' : 'Use my current location'}</span>
        </button>

        <div aria-live="polite" className="sr-only">
          {geoLooking ? 'Finding your location' : geoError ?? ''}
        </div>

        {geoError && (
          <p className="text-sm text-terra-600 mb-3" role="alert">
            {geoError}
          </p>
        )}

        <label htmlFor="home-location-input" className="text-xs font-medium text-sand-700 uppercase tracking-wider mb-1.5 block">
          Or search for it
        </label>
        <div className="relative mb-3">
          <input
            id="home-location-input"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Street, neighbourhood, or postcode"
            autoComplete="street-address"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
            enterKeyHint="search"
            aria-autocomplete="list"
            aria-controls="home-location-suggestions"
            aria-expanded={searchResults.length > 0}
            className="w-full px-4 py-3 pr-10 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-700 focus:ring-2 focus:ring-sand-700/30 bg-white"
          />
          {searching && (
            <span
              aria-hidden="true"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-sand-300 border-t-sand-700 rounded-full animate-spin"
            />
          )}
        </div>

        <div aria-live="polite" className="sr-only">
          {searching
            ? 'Searching for matches'
            : hasSearched && searchResults.length === 0
              ? 'No matches found'
              : searchResults.length > 0
                ? `${searchResults.length} ${searchResults.length === 1 ? 'result' : 'results'} found`
                : ''}
        </div>

        {searchResults.length > 0 && (
          <div
            id="home-location-suggestions"
            role="listbox"
            aria-label="Address suggestions"
            className="bg-white border border-sand-200 rounded-[20px] mb-3 max-h-60 overflow-auto"
          >
            {searchResults.map((r) => (
              <button
                key={r.id || r.googlePlaceId || `${r.position.lat},${r.position.lng}`}
                type="button"
                role="option"
                aria-selected={selectedLocation?.address === r.address.label}
                onClick={() => selectSearchResult(r)}
                className="w-full text-left min-h-[44px] px-4 py-3 text-sm hover:bg-sand-50 border-b border-sand-100 last:border-0 text-sand-800 focus:outline-none focus-visible:bg-sand-50 focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-inset"
              >
                {r.address.label}
              </button>
            ))}
          </div>
        )}

        {hasSearched && !searching && searchResults.length === 0 && searchQuery.trim().length >= 3 && (
          <p className="text-sm text-sand-700 mb-3 px-1">
            No matches. Try a city, postcode, or wider area.
          </p>
        )}

        {selectedLocation && (
          <p className="text-sm text-forest-600 mb-4 px-1 flex items-center gap-1.5">
            <Check size={16} weight="bold" aria-hidden="true" />
            <span>{selectedLocation.address.substring(0, 80)}</span>
          </p>
        )}
      </form>

      <button
        onClick={() => setStep('pin')}
        disabled={!selectedLocation}
        className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 disabled:opacity-30 disabled:cursor-not-allowed transition mt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
      >
        Continue
      </button>
    </div>
  );
}
