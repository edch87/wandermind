import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import { searchPlaces, fetchPlaceDetails, fetchGooglePlaceOpeningHours, calculateAllModesTravel, fetchPlaceImage, reverseGeocode, HERE_TILE_URL, HERE_TILE_ATTRIBUTION } from '../utils/api';
import { inferDefaults } from '../utils/inference';
import { generateId } from '../utils/storage';
import type {
  UserProfile, BucketListItem, HereSearchResult, Category, Setting,
  WeatherSuitability, DurationEstimate, CostLevel, Season, TimeOfDay,
  GroupType, Priority, Tag
} from '../types';
import { CATEGORY_INFO, DURATION_LABELS, COST_LABELS, SEASON_LABELS, TIME_OF_DAY_LABELS, TAG_INFO, TAG_SOFT_CAP, tagsEligibleForCategory } from '../types';
import {
  ArrowLeft, MagnifyingGlass, CaretDown, CaretUp,
  Buildings, TreeEvergreen, ArrowsClockwise,
  CloudSun, Sun, CloudRain,
  Dog, Wheelchair, BabyCarriage,
} from '@phosphor-icons/react';
import PlaceImg from './PlaceImg';
import KiteIcon from './KiteIcon';
import { formatTravelShort } from '../utils/travelDisplay';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  /** Persist the item. The optional `addAnother` flag tells the parent to
   *  skip the post-save navigation so the user can keep adding from search. */
  onSave: (item: BucketListItem, options?: { addAnother?: boolean }) => void;
  onBack: () => void;
  /** Open an existing item's detail screen — used when a search result
   *  matches a place that's already on the user's list. */
  onViewExisting: (id: string) => void;
  /** When set (e.g. from the Discover feed), skip search and jump straight to the review step. */
  initialPlace?: HereSearchResult;
  /** Category hint from the discover feed — overrides inference so the user isn't re-asked. */
  initialCategory?: Category;
}

type Step = 'search' | 'confirm' | 'loading' | 'review';

/** Haversine distance in metres. Used to decide whether a pin drag is large
 *  enough to bother re-running reverse geocoding. */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

/** Return the existing bucket list item that matches a search/url result, or
 *  undefined if it's a new place. Match strategy is IDs only (per IDEAS.md
 *  spec): googlePlaceId first, fall back to HERE id (stored as osmId for
 *  legacy reasons). Lat/lng proximity is intentionally NOT a fallback to
 *  avoid false positives where two distinct places sit close together. */
function findExistingMatch(
  result: HereSearchResult,
  items: BucketListItem[],
): BucketListItem | undefined {
  if (result.googlePlaceId) {
    const m = items.find(i => i.googlePlaceId && i.googlePlaceId === result.googlePlaceId);
    if (m) return m;
  }
  if (result.id) {
    const m = items.find(i => i.osmId && i.osmId === result.id);
    if (m) return m;
  }
  return undefined;
}

export default function AddPlace({ profile, items, onSave, onBack, onViewExisting, initialPlace, initialCategory }: Props) {
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HereSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [draft, setDraft] = useState<Partial<BucketListItem>>({});
  // True when inference couldn't confidently pick a category — prompts the user to confirm.
  const [categoryUncertain, setCategoryUncertain] = useState(false);
  // Review-step "More details" disclosure (Best seasons + Accessibility).
  const [moreOpen, setMoreOpen] = useState(false);
  // The result the user just picked, held in state while they confirm or
  // adjust the pin. Once they tap "Add this place" we hand this off to the
  // existing selectPlace pipeline (Google details, travel time, photo, etc.).
  const [pendingPlace, setPendingPlace] = useState<HereSearchResult | null>(null);
  // Confirm-step address fallback for users who can't drag the map (keyboard /
  // VoiceOver). Editing the field re-geocodes and moves the pin. Mirrors the
  // Onboarding pin step's address fallback.
  const [confirmAddressInput, setConfirmAddressInput] = useState('');
  const [confirmAddressLooking, setConfirmAddressLooking] = useState(false);
  const [confirmAddressError, setConfirmAddressError] = useState<string | null>(null);

  const searchTimeout = useRef<number | null>(null);
  const confirmMapRef = useRef<HTMLDivElement>(null);
  const confirmMapInstance = useRef<L.Map | null>(null);
  const confirmMarkerRef = useRef<L.Marker | null>(null);

  // Launched with a prefilled place (from the Discover feed): skip search, go straight to review.
  // Discover items are already user-confirmed visually, so we deliberately skip the confirm step.
  useEffect(() => {
    if (initialPlace) selectPlace(initialPlace, initialCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the map on the confirm step. Marker is draggable; tapping anywhere
  // on the map also moves it. On meaningful drags (>50m from the original
  // autocomplete position) we reverse-geocode so the address text stays in
  // sync with the pin. Mirrors the pattern used in Onboarding's pin step.
  useEffect(() => {
    if (step !== 'confirm' || !confirmMapRef.current || confirmMapInstance.current || !pendingPlace) return;

    const originLat = pendingPlace.position.lat;
    const originLng = pendingPlace.position.lng;
    const map = L.map(confirmMapRef.current).setView([originLat, originLng], 16);
    L.tileLayer(HERE_TILE_URL, { attribution: HERE_TILE_ATTRIBUTION }).addTo(map);
    const marker = L.marker([originLat, originLng], { draggable: true }).addTo(map);

    const updateFromMap = async (lat: number, lng: number) => {
      const moved = distanceMeters(originLat, originLng, lat, lng);
      // Tiny nudges (<50m) update the pin but keep the autocomplete address as-is,
      // so we don't accidentally overwrite "Marienplatz" with a generic street label.
      if (moved < 50) {
        setPendingPlace(prev => prev ? { ...prev, position: { lat, lng } } : prev);
        return;
      }
      const geo = await reverseGeocode(lat, lng);
      setPendingPlace(prev => prev ? {
        ...prev,
        position: { lat, lng },
        address: geo?.address || prev.address,
      } : prev);
      if (geo?.address.label) setConfirmAddressInput(geo.address.label);
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

    confirmMapInstance.current = map;
    confirmMarkerRef.current = marker;
    setTimeout(() => map.invalidateSize(), 0);
  }, [step, pendingPlace]);

  /** Address-field fallback for users who can't drag the map (keyboard /
   *  VoiceOver). Mirrors the Onboarding pin step. Re-geocodes the typed value
   *  and moves both the pin and the pendingPlace state. */
  const handleConfirmAddressSubmit = async () => {
    if (!pendingPlace) return;
    const value = confirmAddressInput.trim();
    if (!value) return;
    if (value === pendingPlace.address.label) return;
    setConfirmAddressError(null);
    setConfirmAddressLooking(true);
    const matches = await searchPlaces(value, profile.homeLatitude, profile.homeLongitude);
    setConfirmAddressLooking(false);
    if (matches.length === 0) {
      setConfirmAddressError("Couldn't find that address. Try a more specific street, city, or postcode.");
      setConfirmAddressInput(pendingPlace.address.label);
      return;
    }
    const top = matches[0];
    setPendingPlace(prev => prev ? {
      ...prev,
      position: { lat: top.position.lat, lng: top.position.lng },
      address: top.address,
    } : prev);
    setConfirmAddressInput(top.address.label);
    if (confirmMapInstance.current && confirmMarkerRef.current) {
      confirmMarkerRef.current.setLatLng([top.position.lat, top.position.lng]);
      confirmMapInstance.current.setView([top.position.lat, top.position.lng], 16);
    }
  };

  // Tear the confirm-step map down whenever we leave it, so re-entry (e.g.
  // via Search again → pick a new result) gets a clean instance.
  useEffect(() => {
    if (step !== 'confirm' && confirmMapInstance.current) {
      confirmMapInstance.current.remove();
      confirmMapInstance.current = null;
      confirmMarkerRef.current = null;
    }
  }, [step]);

  const goToConfirm = (place: HereSearchResult) => {
    setPendingPlace(place);
    setConfirmAddressInput(place.address.label);
    setConfirmAddressError(null);
    setResults([]);
    setStep('confirm');
  };

  const confirmPlace = () => {
    if (pendingPlace) void selectPlace(pendingPlace);
  };

  const backToSearch = () => {
    setPendingPlace(null);
    setConfirmAddressInput('');
    setConfirmAddressError(null);
    setStep('search');
  };

  /** Reset the review state back to a clean search step (used after "Save & add
   *  another" so the user lands on an empty search ready for the next entry). */
  const resetForNextAdd = () => {
    setPendingPlace(null);
    setConfirmAddressInput('');
    setConfirmAddressError(null);
    setDraft({});
    setCategoryUncertain(false);
    setMoreOpen(false);
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setStep('search');
  };

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (searchTimeout.current !== null) clearTimeout(searchTimeout.current);
    if (q.length < 3) { setResults([]); setHasSearched(false); return; }
    searchTimeout.current = window.setTimeout(async () => {
      setSearching(true);
      const res = await searchPlaces(q, profile.homeLatitude, profile.homeLongitude);
      setResults(res);
      setSearching(false);
      setHasSearched(true);
    }, 400);
  };

  const selectPlace = async (result: HereSearchResult, categoryHint?: Category) => {
    setStep('loading');
    setResults([]);
    const lat = result.position.lat;
    const lng = result.position.lng;

    setLoadingMsg('Fetching place details...');
    let tags: Record<string, string> = {};
    let openingHours: string | undefined;
    if (result.googlePlaceId) {
      // Google result — its place types arrived with the search; one details call for opening hours
      const googleTypes = (result.categories || []).map(c => c.id).join(',');
      if (googleTypes) tags['google_types'] = googleTypes;
      openingHours = await fetchGooglePlaceOpeningHours(result.googlePlaceId);
    } else if (result.id) {
      const details = await fetchPlaceDetails(result.id);
      if (details) {
        tags = details.tags;
        openingHours = details.openingHours;
      }
    }

    setLoadingMsg('Calculating travel times...');
    // Compute all 4 modes in parallel — stored on the item so the recommend
    // flow doesn't need a live HERE batch every session.
    const travel = await calculateAllModesTravel(
      profile.homeLatitude, profile.homeLongitude, lat, lng
    );

    setLoadingMsg('Finding photos...');
    const searchTags = { ...tags, name: result.title };
    const photoUrl = (await fetchPlaceImage(searchTags, lat, lng)) || undefined;

    setLoadingMsg('Auto-categorising...');
    const { categoryUncertain: uncertain, ...inferred } = inferDefaults({ ...tags, name: result.title });
    // A category hint (from the Discover feed) beats inference — no need to re-ask the user
    if (categoryHint) {
      inferred.category = categoryHint;
      setCategoryUncertain(false);
    } else {
      setCategoryUncertain(uncertain);
    }

    setDraft({
      id: generateId(),
      status: 'want_to_do',
      createdAt: new Date().toISOString(),
      name: result.title,
      latitude: lat,
      longitude: lng,
      osmId: result.id || undefined, // HERE place ID (legacy field name)
      googlePlaceId: result.googlePlaceId, // the only Google data we persist — photos are fetched fresh at display time (ToS)
      osmTags: tags,
      photoUrl,
      address: result.address.label,
      country: result.address.country || '',
      region: result.address.state || '',
      city: result.address.city || '',
      openingHours: openingHours || result.openingHours || undefined,
      // Seed the TTL whenever we got hours from Google so the 30-day refresh
      // clock starts now. HERE-only opening hours (no Google key) leave this
      // null — the detail page treats null as "refresh on next open".
      openingHoursLastRefreshedAt: openingHours ? new Date().toISOString() : undefined,
      travelDistanceKm: travel.distanceKm,
      walkMinutes: travel.walkMinutes,
      bikeMinutes: travel.bikeMinutes,
      carMinutes: travel.carMinutes,
      transitMinutes: travel.transitMinutes,
      ...inferred,
      priority: 'medium',
      personalNotes: '',
      tags: [],
    });
    setStep('review');
  };

  const updateDraft = (updates: Partial<BucketListItem>) => {
    setDraft(prev => ({ ...prev, ...updates }));
  };

  const toggleGroupType = (g: GroupType) => {
    const current = draft.groupSuitability || [];
    updateDraft({ groupSuitability: current.includes(g) ? current.filter(x => x !== g) : [...current, g] });
  };

  const toggleSeason = (s: Season) => {
    const current = draft.bestSeasons || [];
    if (s === 'any') {
      // Toggle "Any season": if already selected, deselect; otherwise select only "any"
      updateDraft({ bestSeasons: current.includes('any') ? [] : ['any'] });
    } else {
      // Selecting a specific season: remove "any" if present, then toggle the specific one
      const withoutAny = current.filter(x => x !== 'any');
      const updated = withoutAny.includes(s) ? withoutAny.filter(x => x !== s) : [...withoutAny, s];
      updateDraft({ bestSeasons: updated });
    }
  };

  const toggleTimeOfDay = (t: TimeOfDay) => {
    const current = draft.bestTimesOfDay || [];
    if (t === 'any') {
      updateDraft({ bestTimesOfDay: current.includes('any') ? [] : ['any'] });
    } else {
      const withoutAny = current.filter(x => x !== 'any');
      const updated = withoutAny.includes(t) ? withoutAny.filter(x => x !== t) : [...withoutAny, t];
      updateDraft({ bestTimesOfDay: updated });
    }
  };

  // Search screen
  if (step === 'search') {
    return (
      <main
        aria-label="Add a place"
        className="page-enter px-6 py-6"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            aria-label="Back to dashboard"
            className="w-11 h-11 rounded-full bg-sand-100 flex items-center justify-center text-sand-700 hover:bg-sand-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            <ArrowLeft size={18} weight="bold" aria-hidden="true" />
          </button>
          <h2 className="text-xl font-semibold text-sand-900">Add a <span className="heading-accent">place</span></h2>
        </div>

        <form
          onSubmit={(e) => e.preventDefault()}
          role="search"
          className="relative mb-4"
        >
          <label htmlFor="add-place-search" className="sr-only">Search for a place</label>
          <input
            id="add-place-search"
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search for a place..."
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
            enterKeyHint="search"
            aria-autocomplete="list"
            aria-controls="add-place-results"
            aria-expanded={results.length > 0}
            className="w-full px-4 py-3.5 bg-white border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-700 focus:ring-2 focus:ring-sand-700/30"
          />
          {searching && (
            <span
              aria-hidden="true"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-sand-300 border-t-sand-700 rounded-full animate-spin"
            />
          )}
        </form>

        <div aria-live="polite" className="sr-only">
          {searching
            ? 'Searching for places'
            : hasSearched && results.length === 0
              ? 'No results found'
              : results.length > 0
                ? `${results.length} ${results.length === 1 ? 'result' : 'results'} found`
                : ''}
        </div>

        <div id="add-place-results" role="list" className="space-y-1">
          {results.map((r) => {
            const subtitle = [r.address.city, r.address.country].filter(Boolean).join(', ');
            const existing = findExistingMatch(r, items);
            // If already in the list, tap routes to the item detail instead of
            // the confirm step — same surface, no silent hide, no re-adding.
            return (
              <button
                key={r.id}
                onClick={() => existing ? onViewExisting(existing.id) : goToConfirm(r)}
                role="listitem"
                aria-label={existing
                  ? `${r.title}${subtitle ? ', ' + subtitle : ''}, already saved — open detail`
                  : `${r.title}${subtitle ? ', ' + subtitle : ''}`}
                className="w-full text-left min-h-[44px] px-4 py-3.5 rounded-[20px] hover:bg-sand-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-sand-900 truncate">{r.title}</div>
                    {subtitle && <div className="text-xs text-sand-700 mt-0.5 truncate">{subtitle}</div>}
                  </div>
                  {existing && (
                    <span className="badge bg-sand-200 text-sand-800 flex-shrink-0 mt-0.5">
                      Already saved
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {!searching && hasSearched && results.length === 0 && (
          <div className="text-center py-12" role="status">
            <p className="text-sm text-sand-700">No results found. Try a different search.</p>
          </div>
        )}
        {query.length < 3 && (
          <div className="text-center py-16">
            <div className="flex justify-center mb-3"><MagnifyingGlass size={32} className="text-sand-400" aria-hidden="true" /></div>
            <p className="text-sm text-sand-700">Search for museums, restaurants, parks, hikes, viewpoints...</p>
          </div>
        )}
      </main>
    );
  }

  // Confirm step — map preview with draggable pin so the user can sanity-check
  // (and adjust) the autocomplete result before we spend API calls on details.
  if (step === 'confirm' && pendingPlace) {
    return (
      // Plain block layout (not flex column). Earlier flex-column versions of
      // this screen had the map div collapsing to zero height on this route —
      // AddPlace renders inside App's wrapper div whereas Onboarding does not,
      // and the flex sizing didn't survive that extra context. Explicit inline
      // height with a px minHeight fallback removes the dependency on parent
      // sizing entirely.
      <main
        aria-label="Confirm place location"
        className="bg-sand-50 pb-4 w-full max-w-full overflow-x-hidden"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={backToSearch}
              aria-label="Back to search"
              className="w-11 h-11 rounded-full bg-sand-100 flex items-center justify-center text-sand-700 hover:bg-sand-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
            >
              <ArrowLeft size={18} weight="bold" aria-hidden="true" />
            </button>
            <h2 className="text-xl font-semibold text-sand-900">
              Is this the right <span className="heading-accent">spot?</span>
            </h2>
          </div>
          <p className="text-base font-medium text-sand-900">{pendingPlace.title}</p>
          <p className="text-xs text-sand-700 mt-0.5 truncate">{pendingPlace.address.label}</p>
          <p className="text-xs text-sand-700 mt-2">
            Move the pin if it's not quite right.
          </p>
        </div>

        {/* px-6 wrapper + w-full on the map is the same pattern Settings uses.
            Earlier mx-6 on the map div was letting Leaflet render past the
            right edge in some PWA layouts — putting the inset on a wrapper
            forces an explicit constrained width on the map element itself. */}
        <div className="px-6">
          <div
            ref={confirmMapRef}
            role="application"
            aria-label="Map with draggable pin. Drag the pin or tap a new spot to adjust the location. If you can't drag, use the address field below."
            className="w-full rounded-[20px] border border-sand-200 overflow-hidden"
            style={{ height: '55vh', minHeight: '320px' }}
          />
        </div>

        {/* Address-field fallback — keyboard / VoiceOver path for users who
            can't drag the map. Mirrors the Onboarding pin step. */}
        <form
          className="px-6 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleConfirmAddressSubmit();
          }}
        >
          <label htmlFor="confirm-address-input" className="text-xs font-medium text-sand-700 uppercase tracking-wider mb-1 block">
            Address
          </label>
          <input
            id="confirm-address-input"
            type="text"
            value={confirmAddressInput}
            onChange={(e) => {
              setConfirmAddressInput(e.target.value);
              if (confirmAddressError) setConfirmAddressError(null);
            }}
            onBlur={() => void handleConfirmAddressSubmit()}
            placeholder="Street, city, or postcode"
            autoComplete="street-address"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
            enterKeyHint="done"
            disabled={confirmAddressLooking}
            className="w-full px-4 py-2.5 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-700 focus:ring-2 focus:ring-sand-700/30 bg-white disabled:opacity-60"
          />
          <div aria-live="polite" className="sr-only">
            {confirmAddressLooking ? 'Looking up address' : confirmAddressError ?? ''}
          </div>
          {confirmAddressError && (
            <p className="text-sm text-terra-600 mt-2" role="alert">
              {confirmAddressError}
            </p>
          )}
        </form>

        <div
          className="px-6 pt-3 flex gap-2"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={backToSearch}
            className="flex-1 min-h-[44px] py-3.5 rounded-full font-medium text-sm border border-sand-300 text-sand-800 hover:bg-sand-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            Search again
          </button>
          <button
            onClick={confirmPlace}
            className="flex-[2] min-h-[44px] bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            Add this place
          </button>
        </div>
      </main>
    );
  }

  // Loading
  if (step === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center px-6"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
        <KiteIcon size={48} className="text-sand-900 mb-4" animate />
        <p className="text-sm text-sand-700 font-medium">{loadingMsg}</p>
      </div>
    );
  }

  // Review screen — final pass before saving. Per-section semantics: every
  // Section renders an <h3> + a labelled toggle group so the screen reads as a
  // proper form to assistive tech, not a wall of unrelated buttons.
  const subtitle = [draft.city, draft.country].filter(Boolean).join(', ');
  const travelChip = draft.travelDistanceKm != null
    ? formatTravelShort(draft as BucketListItem, profile.preferredTransport ?? 'car')
    : null;

  return (
    <main aria-label="Review and save place" className="page-enter pb-24">
      {/* Hero image — always shown; PlaceImg renders the designed placeholder
          when there's no photo so the layout stays consistent. */}
      <div className="place-img-container h-48 rounded-none">
        <PlaceImg
          src={draft.photoUrl}
          alt=""
          name={draft.name}
          category={draft.category || 'other'}
          placeholderVariant="detail"
          loading="eager"
        />
        <button
          onClick={() => setStep('search')}
          aria-label="Back to search"
          className="absolute top-4 left-4 z-10 w-11 h-11 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-sand-900 hover:bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white shadow-sm"
        >
          <ArrowLeft size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <div className="px-6 pt-5">

        {/* Place name & travel info */}
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-sand-900">{draft.name}</h1>
          {subtitle && <p className="text-xs text-sand-700 mt-1">{subtitle}</p>}
          {travelChip && (
            <div className="flex items-center gap-3 mt-3">
              <span className="badge bg-sand-100 text-sand-700">
                {travelChip}
              </span>
            </div>
          )}
        </div>

        {/* Fields */}
        <Section label="Category" id="category">
          {categoryUncertain && (
            <p
              role="alert"
              className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5"
            >
              We weren't sure how to categorise this one. Please pick the best fit below.
            </p>
          )}
          <div className="toggle-group" role="radiogroup" aria-labelledby="section-category">
            {(Object.entries(CATEGORY_INFO) as [Category, { label: string; icon: string; color: string }][]).map(([key, info]) => (
              <button
                key={key}
                role="radio"
                aria-checked={draft.category === key}
                className={`toggle-btn text-xs ${draft.category === key ? 'active' : ''}`}
                onClick={() => { updateDraft({ category: key }); setCategoryUncertain(false); }}
              >
                {info.label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Setting" id="setting">
          <div className="toggle-group" role="radiogroup" aria-labelledby="section-setting">
            {([
              { val: 'indoor' as Setting, label: 'Indoor', icon: <Buildings size={16} aria-hidden="true" /> },
              { val: 'outdoor' as Setting, label: 'Outdoor', icon: <TreeEvergreen size={16} aria-hidden="true" /> },
              { val: 'mixed' as Setting, label: 'Mixed', icon: <ArrowsClockwise size={16} aria-hidden="true" /> },
            ]).map(({ val, label, icon }) => (
              <button
                key={val}
                role="radio"
                aria-checked={draft.setting === val}
                className={`toggle-btn ${draft.setting === val ? 'active' : ''}`}
                onClick={() => updateDraft({ setting: val })}
              >
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Weather" id="weather">
          <div className="toggle-group" role="radiogroup" aria-labelledby="section-weather">
            {([
              { val: 'any' as WeatherSuitability, label: 'Any weather', icon: <CloudSun size={16} aria-hidden="true" /> },
              { val: 'good_weather' as WeatherSuitability, label: 'Good weather only', icon: <Sun size={16} aria-hidden="true" /> },
              { val: 'bad_weather_ideal' as WeatherSuitability, label: 'Great for bad weather', icon: <CloudRain size={16} aria-hidden="true" /> },
            ]).map(({ val, label, icon }) => (
              <button
                key={val}
                role="radio"
                aria-checked={draft.weatherSuitability === val}
                className={`toggle-btn ${draft.weatherSuitability === val ? 'active' : ''}`}
                onClick={() => updateDraft({ weatherSuitability: val })}
              >
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Activity duration" id="duration">
          <div className="toggle-group" role="radiogroup" aria-labelledby="section-duration">
            {(Object.entries(DURATION_LABELS) as [DurationEstimate, string][]).map(([key, label]) => (
              <button
                key={key}
                role="radio"
                aria-checked={draft.durationEstimate === key}
                className={`toggle-btn ${draft.durationEstimate === key ? 'active' : ''}`}
                onClick={() => updateDraft({ durationEstimate: key })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-sand-700 mt-1">How long the activity itself takes (travel time is calculated separately)</p>
        </Section>

        <Section label="Cost" id="cost">
          <div className="toggle-group" role="radiogroup" aria-labelledby="section-cost">
            {(Object.entries(COST_LABELS) as [CostLevel, string][]).map(([key, label]) => (
              <button
                key={key}
                role="radio"
                aria-checked={draft.costLevel === key}
                className={`toggle-btn ${draft.costLevel === key ? 'active' : ''}`}
                onClick={() => updateDraft({ costLevel: key })}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Best times of day" id="times">
          <div className="toggle-group" role="group" aria-labelledby="section-times">
            {(Object.entries(TIME_OF_DAY_LABELS) as [TimeOfDay, string][]).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={(draft.bestTimesOfDay || []).includes(key)}
                className={`toggle-btn ${(draft.bestTimesOfDay || []).includes(key) ? 'active' : ''}`}
                onClick={() => toggleTimeOfDay(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Tag picker — text-only, user-driven (no inference). Category-eligible
            pool only. Soft 5-tag cap; further taps after the cap show a hint
            but don't block (existing items can keep more than 5). Tags sit
            above "Good for" because they drive recommendations more heavily. */}
        {draft.category && (
          <Section label="Tags" id="tags">
            <TagPicker
              category={draft.category}
              selected={(draft.tags || []) as Tag[]}
              onChange={(next) => updateDraft({ tags: next })}
            />
          </Section>
        )}

        <Section label="Good for" id="good-for">
          <div className="toggle-group" role="group" aria-labelledby="section-good-for">
            {([
              ['solo', 'Solo'],
              ['couple', 'Couple'],
              ['friends', 'Friends'],
              ['kids', 'With kids'],
            ] as [GroupType, string][]).map(([val, label]) => (
              <button
                key={val}
                aria-pressed={(draft.groupSuitability || []).includes(val)}
                className={`toggle-btn ${(draft.groupSuitability || []).includes(val) ? 'active' : ''}`}
                onClick={() => toggleGroupType(val)}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Priority" id="priority">
          <div className="toggle-group" role="radiogroup" aria-labelledby="section-priority">
            {([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as const).map(([val, label]) => (
              <button
                key={val}
                role="radio"
                aria-checked={draft.priority === val}
                className={`toggle-btn ${draft.priority === val ? 'active' : ''}`}
                onClick={() => updateDraft({ priority: val as Priority })}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Personal notes" id="notes">
          <textarea
            id="personal-notes"
            aria-labelledby="section-notes"
            value={draft.personalNotes || ''}
            onChange={(e) => updateDraft({ personalNotes: e.target.value })}
            placeholder="Any notes about this place..."
            rows={2}
            className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-700 focus:ring-2 focus:ring-sand-700/30 resize-none bg-white"
          />
        </Section>

        {/* More details disclosure — Best seasons + Accessibility live here.
            Both are lower-frequency: seasons rarely change once set, and
            accessibility is opt-in signal (default "Not sure" doesn't affect
            recommendations). Keeping them collapsed shortens the must-edit
            scan path. */}
        <div className="mb-5">
          <button
            onClick={() => setMoreOpen(o => !o)}
            aria-expanded={moreOpen}
            aria-controls="more-details-panel"
            className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 bg-sand-100 hover:bg-sand-200 rounded-[12px] text-sm font-medium text-sand-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            <span>More details</span>
            {moreOpen
              ? <CaretUp size={16} weight="bold" aria-hidden="true" />
              : <CaretDown size={16} weight="bold" aria-hidden="true" />}
          </button>

          {moreOpen && (
            <div id="more-details-panel" className="mt-4">
              <Section label="Best seasons" id="seasons">
                <div className="toggle-group" role="group" aria-labelledby="section-seasons">
                  {(Object.entries(SEASON_LABELS) as [Season, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={(draft.bestSeasons || []).includes(key)}
                      className={`toggle-btn ${(draft.bestSeasons || []).includes(key) ? 'active' : ''}`}
                      onClick={() => toggleSeason(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section label="Accessibility" id="accessibility">
                {/* Three-state per field: Yes / Not sure / No. "Not sure" is the
                    default (undefined) and means "no signal" — recommend-flow
                    filters let it through, and the detail page shows no chip.
                    Explicit Yes and No are user-only signal (inference no
                    longer writes false). Tapping the active pill again clears
                    back to "Not sure" so users can undo a misclick without
                    leaving a misleading "No". */}
                <AccessibilityRow
                  label="Dogs"
                  icon={<Dog size={16} aria-hidden="true" />}
                  value={draft.dogFriendly}
                  onChange={(v) => updateDraft({ dogFriendly: v })}
                />
                <AccessibilityRow
                  label="Wheelchair"
                  icon={<Wheelchair size={16} aria-hidden="true" />}
                  value={draft.wheelchairAccessible}
                  onChange={(v) => updateDraft({ wheelchairAccessible: v })}
                />
                <AccessibilityRow
                  label="Stroller"
                  icon={<BabyCarriage size={16} aria-hidden="true" />}
                  value={draft.strollerFriendly}
                  onChange={(v) => updateDraft({ strollerFriendly: v })}
                />
              </Section>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-2 mb-4">
          <button
            onClick={() => {
              onSave(draft as BucketListItem, { addAnother: true });
              resetForNextAdd();
            }}
            className="flex-1 min-h-[44px] py-3.5 rounded-full font-medium text-sm border border-sand-300 text-sand-800 hover:bg-sand-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            Save & add another
          </button>
          <button
            onClick={() => onSave(draft as BucketListItem)}
            className="flex-[2] min-h-[44px] bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            Save to my list
          </button>
        </div>
      </div>
    </main>
  );
}

/** Section heading + slot for a toggle group / control. The `id` prop becomes
 *  `section-{id}` on the heading so the inner toggle group can reference it
 *  via aria-labelledby — what makes the group announce as e.g. "Category,
 *  radio group" instead of a stream of unlabelled buttons. */
function Section({ label, children, id }: { label: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="mb-5">
      <h3
        id={id ? `section-${id}` : undefined}
        className="text-xs font-medium text-sand-700 mb-2 uppercase tracking-wide"
      >
        {label}
      </h3>
      {children}
    </div>
  );
}

/** One row of the Accessibility section: an icon + label on the left, a
 *  Yes / Not sure / No pill group on the right. `undefined` is the "Not sure"
 *  state. Tapping the active pill clears back to undefined. */
function AccessibilityRow({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  const pick = (v: boolean | undefined) => onChange(value === v ? undefined : v);
  const groupLabelId = `a11y-${label.toLowerCase().replace(/\s+/g, '-')}-label`;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span id={groupLabelId} className="inline-flex items-center gap-1.5 text-sm text-sand-800">
        {icon} {label}
      </span>
      <div className="toggle-group !mt-0" role="radiogroup" aria-labelledby={groupLabelId}>
        <button
          role="radio"
          aria-checked={value === true}
          className={`toggle-btn text-xs ${value === true ? 'active' : ''}`}
          onClick={() => pick(true)}
        >
          Yes
        </button>
        <button
          role="radio"
          aria-checked={value === undefined}
          className={`toggle-btn text-xs ${value === undefined ? 'active' : ''}`}
          onClick={() => onChange(undefined)}
        >
          Not sure
        </button>
        <button
          role="radio"
          aria-checked={value === false}
          className={`toggle-btn text-xs ${value === false ? 'active' : ''}`}
          onClick={() => pick(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

/** Text-only chip picker for editorial tags. Shows the category-eligible pool;
 *  selected tags out of pool (e.g. after a category change) are kept and shown
 *  too so the user can drop them deliberately. Soft cap at TAG_SOFT_CAP. */
export function TagPicker({
  category,
  selected,
  onChange,
}: {
  category: Category;
  selected: Tag[];
  onChange: (next: Tag[]) => void;
}) {
  const pool = tagsEligibleForCategory(category);
  // Show out-of-pool selected tags too — happens when an item's category was changed
  // after tags were applied. User decides whether to remove them.
  const outOfPool = selected.filter(t => !pool.includes(t));
  const all = [...pool, ...outOfPool];
  const overCap = selected.length > TAG_SOFT_CAP;

  const toggle = (t: Tag) => {
    if (selected.includes(t)) {
      onChange(selected.filter(x => x !== t));
    } else {
      onChange([...selected, t]);
    }
  };

  return (
    <div>
      <div className="toggle-group" role="group" aria-label="Tags">
        {all.map(t => (
          <button
            key={t}
            aria-pressed={selected.includes(t)}
            className={`toggle-btn text-xs ${selected.includes(t) ? 'active' : ''}`}
            onClick={() => toggle(t)}
          >
            {TAG_INFO[t].label}
          </button>
        ))}
      </div>
      <p className={`text-xs mt-1 ${overCap ? 'text-terra-600' : 'text-sand-700'}`}>
        {overCap
          ? `${selected.length} selected — best to keep it under ${TAG_SOFT_CAP}.`
          : `Pick the ones that make this place worth recommending. Up to ${TAG_SOFT_CAP}.`}
      </p>
    </div>
  );
}
