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
  ArrowLeft, MagnifyingGlass, Plus,
  House, TreeEvergreen, ArrowsClockwise,
  CloudSun, Sun, CloudRain,
  Clock,
  SunHorizon, MoonStars,
  Flower, Leaf, Snowflake, CalendarBlank,
  Dog, Wheelchair, BabyCarriage,
  Flag, Check, X, Minus,
} from '@phosphor-icons/react';
import PlaceImg from './PlaceImg';
import KiteIcon from './KiteIcon';
import BottomSheet from './BottomSheet';
import { formatTravelShort } from '../utils/travelDisplay';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  /** Persist the item. */
  onSave: (item: BucketListItem) => void;
  onBack: () => void;
  /** Open an existing item's detail screen — used when a search result
   *  matches a place that's already on the user's list. */
  onViewExisting: (id: string) => void;
  /** When set (e.g. from the Discover feed), skip search and jump straight to the review step. */
  initialPlace?: HereSearchResult;
  /** Category hint from the discover feed — overrides inference so the user isn't re-asked. */
  initialCategory?: Category;
}

// The single review field the sheet is currently editing, or null when closed.
type SheetField =
  | 'category' | 'setting' | 'weather' | 'duration' | 'cost' | 'priority'
  | 'times' | 'seasons' | 'groups' | 'tags'
  | 'dogs' | 'wheelchair' | 'stroller';

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
  // Which field row is currently editing in the bottom sheet, or null when closed.
  const [sheetField, setSheetField] = useState<SheetField | null>(null);
  // Draft state used by multi-select sheets so the caller can commit on Done.
  // Set when the sheet opens, cleared when it closes.
  const [multiDraft, setMultiDraft] = useState<string[]>([]);
  // The result the user just picked, held in state while they confirm or
  // adjust the pin. Once they tap "Add this place" we hand this off to the
  // existing selectPlace pipeline (Google details, travel time, photo, etc.).
  const [pendingPlace, setPendingPlace] = useState<HereSearchResult | null>(null);

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
    setResults([]);
    setStep('confirm');
  };

  const confirmPlace = () => {
    if (pendingPlace) void selectPlace(pendingPlace);
  };

  const backToSearch = () => {
    setPendingPlace(null);
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

  // Multi-select toggle helpers moved into MultiChipList inside the sheet
  // (with `exclusiveKey="any"` handling the Any / specific-values semantics).

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
            forces an explicit constrained width on the map element itself.
            Map height reduced from 55vh to 42vh so the CTAs below stay in
            viewport on shorter phones (iPhone SE etc.) — the previous height
            plus the App wrapper's 72px bottom nav padding was pushing the
            buttons below the fold, and Leaflet consumes touch events on the
            map so users couldn't easily scroll past it to reach them. */}
        <div className="px-6">
          <div
            ref={confirmMapRef}
            role="application"
            aria-label="Map with draggable pin. Drag the pin or tap a new spot to adjust the location."
            className="w-full rounded-[20px] border border-sand-200 overflow-hidden"
            style={{ height: '42vh', minHeight: '260px' }}
          />
        </div>

        <div
          className="px-6 pt-4 flex gap-2"
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

  // Review screen — third-pass design (2026-07-01):
  //  - Value chips are the tap targets (Change buttons dropped for a cleaner
  //    world-class mobile pattern; Airbnb / Google Maps / Uber all do this).
  //  - Semantic value formatting where words are weak: cost as € symbols,
  //    priority as a colour-coded flag, accessibility with a state dot.
  //  - Leading icons in value chips where they encode meaning (Setting,
  //    Weather, Duration, Times, Seasons, Access). Text-heavy fields
  //    (Category, Tags, Good for, Notes) stay iconless to avoid noise.
  //  - Section grouping (Category / Tags / About / When / Who / Access /
  //    Priority / Notes) so the eye lands on regions instead of a wall of
  //    identical rows.
  const subtitle = [draft.city, draft.country].filter(Boolean).join(', ');
  const travelChip = draft.travelDistanceKm != null
    ? formatTravelShort(draft as BucketListItem, profile.preferredTransport ?? 'car')
    : null;

  // ── Sheet open helpers ───────────────────────────────────────────────────
  const openSheet = (field: SheetField) => setSheetField(field);
  const openMultiSheet = (field: SheetField, current: string[]) => {
    setMultiDraft(current);
    setSheetField(field);
  };
  const closeSheet = () => setSheetField(null);

  // ── Option label maps used both in review chips and inside sheets ────────
  const SETTING_LABEL: Record<Setting, string> = { indoor: 'Indoor', outdoor: 'Outdoor', mixed: 'Mixed' };
  const WEATHER_LABEL: Record<WeatherSuitability, string> = {
    any: 'Any weather',
    good_weather: 'Good weather only',
    bad_weather_ideal: 'Great for bad weather',
  };
  const GROUP_LABEL: Record<GroupType, string> = {
    solo: 'Solo', couple: 'Couple', friends: 'Friends', kids: 'With kids',
  };
  const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

  const currentTags = (draft.tags || []) as Tag[];
  const currentTimes = draft.bestTimesOfDay || [];
  const currentSeasons = draft.bestSeasons || [];
  const currentGroups = draft.groupSuitability || [];

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
        <div className="mb-6">
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

        {/* Category */}
        {categoryUncertain && (
          <p
            role="alert"
            className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5"
          >
            We weren't sure how to categorise this one. Tap to pick the best fit.
          </p>
        )}
        <ReviewSection label="Category">
          <ValueChip
            label={draft.category ? CATEGORY_INFO[draft.category].label : 'Choose category'}
            muted={!draft.category}
            onClick={() => openSheet('category')}
          />
        </ReviewSection>

        {/* Tags — the one field with no inference, sits right after Category
            because it drives recommendations more heavily than the rest. */}
        {draft.category && (
          <ReviewSection label="Tags">
            {currentTags.map(t => (
              <ValueChip
                key={t}
                label={TAG_INFO[t].label}
                onClick={() => openMultiSheet('tags', currentTags)}
              />
            ))}
            <AddChip
              label={currentTags.length === 0 ? 'Add tags' : 'Add'}
              onClick={() => openMultiSheet('tags', currentTags)}
            />
          </ReviewSection>
        )}

        {/* About — the auto-inferred core: setting, weather, duration, cost.
            Semantic icons on Setting/Weather/Duration; cost renders as
            € symbols (Yelp / Google convention). */}
        <ReviewSection label="About">
          <ValueChip
            icon={settingIcon(draft.setting)}
            label={draft.setting ? SETTING_LABEL[draft.setting] : 'Setting'}
            muted={!draft.setting}
            onClick={() => openSheet('setting')}
          />
          <ValueChip
            icon={weatherIcon(draft.weatherSuitability)}
            label={draft.weatherSuitability ? WEATHER_LABEL[draft.weatherSuitability] : 'Weather'}
            muted={!draft.weatherSuitability}
            onClick={() => openSheet('weather')}
          />
          <ValueChip
            icon={<Clock size={14} weight="regular" aria-hidden="true" />}
            label={draft.durationEstimate ? DURATION_LABELS[draft.durationEstimate] : 'Duration'}
            muted={!draft.durationEstimate}
            onClick={() => openSheet('duration')}
          />
          <ValueChip
            label={draft.costLevel ? COST_LABELS[draft.costLevel] : 'Cost'}
            muted={!draft.costLevel}
            onClick={() => openSheet('cost')}
          />
        </ReviewSection>

        {/* When it works — Times + Seasons live in one section since both
            answer "when does this place shine?" Icons per value help scanning. */}
        <ReviewSection label="When it works">
          {currentTimes.length === 0 ? (
            <AddChip label="Time of day" onClick={() => openMultiSheet('times', currentTimes)} />
          ) : (
            currentTimes.map(t => (
              <ValueChip
                key={`time-${t}`}
                icon={timeIcon(t)}
                label={TIME_OF_DAY_LABELS[t]}
                onClick={() => openMultiSheet('times', currentTimes)}
              />
            ))
          )}
          {currentSeasons.length === 0 ? (
            <AddChip label="Season" onClick={() => openMultiSheet('seasons', currentSeasons)} />
          ) : (
            currentSeasons.map(s => (
              <ValueChip
                key={`season-${s}`}
                icon={seasonIcon(s)}
                label={SEASON_LABELS[s]}
                onClick={() => openMultiSheet('seasons', currentSeasons)}
              />
            ))
          )}
        </ReviewSection>

        {/* Who it's for — group chips (Solo / Couple / Friends / Kids). No
            icons here since the labels already communicate cleanly and
            people-icons would read as visual noise. */}
        <ReviewSection label="Who it's for">
          {currentGroups.length === 0 ? (
            <AddChip label="Who" onClick={() => openMultiSheet('groups', currentGroups)} />
          ) : (
            currentGroups.map(g => (
              <ValueChip
                key={g}
                label={GROUP_LABEL[g]}
                onClick={() => openMultiSheet('groups', currentGroups)}
              />
            ))
          )}
        </ReviewSection>

        {/* Access — three-state pill with a trailing state dot. Green check
            for Yes, red cross for No, muted dash for Not sure. Reads faster
            than the pre-shipped "Not sure" outlined chip. */}
        <ReviewSection label="Access">
          <AccessChip
            icon={<Dog size={14} weight="regular" aria-hidden="true" />}
            label="Dogs"
            state={draft.dogFriendly}
            onClick={() => openSheet('dogs')}
          />
          <AccessChip
            icon={<Wheelchair size={14} weight="regular" aria-hidden="true" />}
            label="Wheelchair"
            state={draft.wheelchairAccessible}
            onClick={() => openSheet('wheelchair')}
          />
          <AccessChip
            icon={<BabyCarriage size={14} weight="regular" aria-hidden="true" />}
            label="Stroller"
            state={draft.strollerFriendly}
            onClick={() => openSheet('stroller')}
          />
        </ReviewSection>

        {/* Priority — colour-coded flag chip (Todoist / Things convention).
            Low is neutral outlined, Medium warms to amber, High pushes to
            terra. Colour telegraphs urgency without needing to read. */}
        <ReviewSection label="Priority">
          <PriorityChip
            level={draft.priority || 'medium'}
            label={PRIORITY_LABEL[draft.priority || 'medium']}
            onClick={() => openSheet('priority')}
          />
        </ReviewSection>

        {/* Notes stays inline — it's a free-text field, no picker to open. */}
        <div className="mb-5">
          <label htmlFor="personal-notes" className="block text-xs font-medium text-sand-500 mb-2 uppercase tracking-wider">
            Notes
          </label>
          <textarea
            id="personal-notes"
            value={draft.personalNotes || ''}
            onChange={(e) => updateDraft({ personalNotes: e.target.value })}
            placeholder="Any notes about this place..."
            rows={2}
            className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-700 focus:ring-2 focus:ring-sand-700/30 resize-none bg-white"
          />
        </div>

        <button
          onClick={() => onSave(draft as BucketListItem)}
          className="w-full min-h-[44px] bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 transition mt-2 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
        >
          Save place
        </button>
      </div>

      {/* ── Bottom-sheet pickers ────────────────────────────────────────────
          One BottomSheet is mounted at any given time; the field controls
          which picker renders inside. Single-select variants commit + close
          on option tap. Multi-select variants pipe through multiDraft and
          commit on Done. */}

      <BottomSheet open={sheetField === 'category'} onClose={closeSheet} title="Category">
        <SingleChipList
          options={(Object.entries(CATEGORY_INFO) as [Category, { label: string }][]).map(([k, v]) => ({ key: k, label: v.label }))}
          value={draft.category}
          onPick={(k) => { updateDraft({ category: k as Category }); setCategoryUncertain(false); closeSheet(); }}
        />
      </BottomSheet>

      <BottomSheet open={sheetField === 'setting'} onClose={closeSheet} title="Setting">
        <SingleChipList
          options={(['indoor', 'outdoor', 'mixed'] as Setting[]).map(k => ({ key: k, label: SETTING_LABEL[k] }))}
          value={draft.setting}
          onPick={(k) => { updateDraft({ setting: k as Setting }); closeSheet(); }}
        />
      </BottomSheet>

      <BottomSheet open={sheetField === 'weather'} onClose={closeSheet} title="Weather">
        <SingleChipList
          options={(['any', 'good_weather', 'bad_weather_ideal'] as WeatherSuitability[]).map(k => ({ key: k, label: WEATHER_LABEL[k] }))}
          value={draft.weatherSuitability}
          onPick={(k) => { updateDraft({ weatherSuitability: k as WeatherSuitability }); closeSheet(); }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheetField === 'duration'}
        onClose={closeSheet}
        title="Activity duration"
        helpText="How long the activity itself takes. Travel time is calculated separately."
      >
        <SingleChipList
          options={(Object.entries(DURATION_LABELS) as [DurationEstimate, string][]).map(([k, l]) => ({ key: k, label: l }))}
          value={draft.durationEstimate}
          onPick={(k) => { updateDraft({ durationEstimate: k as DurationEstimate }); closeSheet(); }}
        />
      </BottomSheet>

      <BottomSheet open={sheetField === 'cost'} onClose={closeSheet} title="Cost">
        <SingleChipList
          options={(Object.entries(COST_LABELS) as [CostLevel, string][]).map(([k, l]) => ({ key: k, label: l }))}
          value={draft.costLevel}
          onPick={(k) => { updateDraft({ costLevel: k as CostLevel }); closeSheet(); }}
        />
      </BottomSheet>

      <BottomSheet open={sheetField === 'priority'} onClose={closeSheet} title="Priority">
        <SingleChipList
          options={(['low', 'medium', 'high'] as Priority[]).map(k => ({ key: k, label: PRIORITY_LABEL[k] }))}
          value={draft.priority}
          onPick={(k) => { updateDraft({ priority: k as Priority }); closeSheet(); }}
        />
      </BottomSheet>

      {/* Three-state accessibility sheets — the option keys map back to
          boolean | undefined at commit time. "unset" is a first-class explicit
          value here (three-state model): user is telling us they've considered
          it and don't have signal. */}
      {(['dogs', 'wheelchair', 'stroller'] as const).map(field => {
        const draftKey = field === 'dogs' ? 'dogFriendly'
          : field === 'wheelchair' ? 'wheelchairAccessible'
          : 'strollerFriendly';
        const current = draft[draftKey];
        const currentKey = current === true ? 'yes' : current === false ? 'no' : 'unset';
        const titleMap = { dogs: 'Dogs allowed?', wheelchair: 'Wheelchair accessible?', stroller: 'Stroller friendly?' };
        return (
          <BottomSheet
            key={field}
            open={sheetField === field}
            onClose={closeSheet}
            title={titleMap[field]}
          >
            <SingleChipList
              options={[
                { key: 'yes', label: 'Yes' },
                { key: 'unset', label: 'Not sure' },
                { key: 'no', label: 'No' },
              ]}
              value={currentKey}
              onPick={(k) => {
                const nextVal = k === 'yes' ? true : k === 'no' ? false : undefined;
                updateDraft({ [draftKey]: nextVal } as Partial<BucketListItem>);
                closeSheet();
              }}
            />
          </BottomSheet>
        );
      })}

      {/* Multi-select sheets — draft state lives in multiDraft; Done commits.
          Backdrop-tap or drag-down dismiss discards the pending edits (a
          user's safety net). */}
      <BottomSheet
        open={sheetField === 'times'}
        onClose={closeSheet}
        title="Times of day"
        helpText="Pick any that apply."
        onDone={() => { updateDraft({ bestTimesOfDay: multiDraft as TimeOfDay[] }); closeSheet(); }}
      >
        <MultiChipList
          options={(Object.entries(TIME_OF_DAY_LABELS) as [TimeOfDay, string][]).map(([k, l]) => ({ key: k, label: l }))}
          selected={multiDraft}
          onToggle={(k) => setMultiDraft(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
          exclusiveKey="any"
        />
      </BottomSheet>

      <BottomSheet
        open={sheetField === 'seasons'}
        onClose={closeSheet}
        title="Best seasons"
        helpText="Pick any that apply."
        onDone={() => { updateDraft({ bestSeasons: multiDraft as Season[] }); closeSheet(); }}
      >
        <MultiChipList
          options={(Object.entries(SEASON_LABELS) as [Season, string][]).map(([k, l]) => ({ key: k, label: l }))}
          selected={multiDraft}
          onToggle={(k) => setMultiDraft(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
          exclusiveKey="any"
        />
      </BottomSheet>

      <BottomSheet
        open={sheetField === 'groups'}
        onClose={closeSheet}
        title="Good for"
        helpText="Pick any that apply."
        onDone={() => { updateDraft({ groupSuitability: multiDraft as GroupType[] }); closeSheet(); }}
      >
        <MultiChipList
          options={(['solo', 'couple', 'friends', 'kids'] as GroupType[]).map(k => ({ key: k, label: GROUP_LABEL[k] }))}
          selected={multiDraft}
          onToggle={(k) => setMultiDraft(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
        />
      </BottomSheet>

      {/* Tags — soft cap at TAG_SOFT_CAP; out-of-pool selected tags stay
          visible so the user can drop them after a category change. */}
      <BottomSheet
        open={sheetField === 'tags'}
        onClose={closeSheet}
        title="Tags"
        helpText={`Pick the ones that make this place worth recommending. Up to ${TAG_SOFT_CAP}.`}
        onDone={() => { updateDraft({ tags: multiDraft as Tag[] }); closeSheet(); }}
      >
        {draft.category && (
          <TagSheetBody
            category={draft.category}
            selected={multiDraft as Tag[]}
            onToggle={(t) => setMultiDraft(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
          />
        )}
      </BottomSheet>
    </main>
  );
}

/**
 * ReviewSection — thin section wrapper: a lighter uppercase label above a
 * wrapping row of chips. The section label uses sand-500 (lighter than the
 * chip text) so the eye lands on the values first, not the field headings.
 */
function ReviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-medium text-sand-500 mb-2 uppercase tracking-wider">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">{children}</div>
    </div>
  );
}

/**
 * ValueChip — the tap target for editing any field. Filled dark pill for
 * committed values; muted outlined variant used for empty-state and for the
 * "Not sure" three-state. The whole chip opens the field's BottomSheet.
 */
function ValueChip({
  icon,
  label,
  onClick,
  muted = false,
  ariaLabel,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  muted?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || `${label}. Tap to change.`}
      className={muted ? 'value-chip value-chip--muted' : 'value-chip'}
    >
      {icon}
      {label}
    </button>
  );
}

/** Add chip — muted outlined pill with a leading plus. Used as the empty-state
 *  affordance for multi-select rows (Tags, Times, Seasons, Groups) so the row
 *  never renders empty without a clear "add something" tap target. */
function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="value-chip value-chip--muted"
    >
      <Plus size={13} weight="bold" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * AccessChip — three-state chip with icon + label + state dot. Green check
 * for Yes, red cross for No, muted dash for Not sure. Reads faster than
 * "Not sure" text because the dot colour communicates state at a glance.
 */
function AccessChip({
  icon,
  label,
  state,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  state: boolean | undefined;
  onClick: () => void;
}) {
  const stateClass = state === true ? 'chip-access__state--yes'
    : state === false ? 'chip-access__state--no'
    : 'chip-access__state--unset';
  const stateIcon = state === true ? <Check size={11} weight="bold" aria-hidden="true" />
    : state === false ? <X size={11} weight="bold" aria-hidden="true" />
    : <Minus size={11} weight="bold" aria-hidden="true" />;
  const stateText = state === true ? 'yes' : state === false ? 'no' : 'not sure';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${stateText}. Tap to change.`}
      className="chip-access"
    >
      {icon}
      <span>{label}</span>
      <span className={`chip-access__state ${stateClass}`}>{stateIcon}</span>
    </button>
  );
}

/**
 * PriorityChip — colour-coded flag chip. Low is neutral, Medium warms to
 * amber, High pushes to terra. Colour telegraphs urgency without reading.
 * Same tap-to-open-sheet behaviour as every other value chip.
 */
function PriorityChip({
  level,
  label,
  onClick,
}: {
  level: Priority;
  label: string;
  onClick: () => void;
}) {
  const cls = level === 'low' ? 'chip-priority-low'
    : level === 'medium' ? 'chip-priority-med'
    : 'chip-priority-hi';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Priority: ${label}. Tap to change.`}
      className={cls}
    >
      <Flag size={14} weight="fill" aria-hidden="true" />
      {label}
    </button>
  );
}

// ── Icon pickers used by the review's About / When it works sections ─────
// Kept as small pure functions so the review JSX above stays readable and
// each icon choice sits next to its enum value.

function settingIcon(s: Setting | undefined): React.ReactNode {
  if (!s) return null;
  if (s === 'indoor') return <House size={14} weight="regular" aria-hidden="true" />;
  if (s === 'outdoor') return <TreeEvergreen size={14} weight="regular" aria-hidden="true" />;
  return <ArrowsClockwise size={14} weight="regular" aria-hidden="true" />;
}

function weatherIcon(w: WeatherSuitability | undefined): React.ReactNode {
  if (!w) return null;
  if (w === 'any') return <CloudSun size={14} weight="regular" aria-hidden="true" />;
  if (w === 'good_weather') return <Sun size={14} weight="regular" aria-hidden="true" />;
  return <CloudRain size={14} weight="regular" aria-hidden="true" />;
}

function timeIcon(t: TimeOfDay): React.ReactNode {
  if (t === 'morning') return <SunHorizon size={14} weight="regular" aria-hidden="true" />;
  if (t === 'afternoon') return <Sun size={14} weight="regular" aria-hidden="true" />;
  if (t === 'evening') return <MoonStars size={14} weight="regular" aria-hidden="true" />;
  return <CalendarBlank size={14} weight="regular" aria-hidden="true" />;
}

function seasonIcon(s: Season): React.ReactNode {
  if (s === 'spring') return <Flower size={14} weight="regular" aria-hidden="true" />;
  if (s === 'summer') return <Sun size={14} weight="regular" aria-hidden="true" />;
  if (s === 'autumn') return <Leaf size={14} weight="regular" aria-hidden="true" />;
  if (s === 'winter') return <Snowflake size={14} weight="regular" aria-hidden="true" />;
  return <CalendarBlank size={14} weight="regular" aria-hidden="true" />;
}

/**
 * SingleChipList — the option chip grid that renders inside a single-select
 * BottomSheet. Tap commits and closes via the caller's `onPick`.
 */
function SingleChipList({
  options,
  value,
  onPick,
}: {
  options: { key: string; label: string }[];
  value: string | undefined;
  onPick: (key: string) => void;
}) {
  return (
    <div className="toggle-group" role="radiogroup" aria-label="Options">
      {options.map(opt => (
        <button
          key={opt.key}
          role="radio"
          aria-checked={value === opt.key}
          onClick={() => onPick(opt.key)}
          className={`toggle-btn ${value === opt.key ? 'active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * MultiChipList — the option chip grid for multi-select sheets. Toggles feed
 * the caller's draft state; commit happens on the sheet's Done button.
 *
 * `exclusiveKey` is the "Any" special value used by Times / Seasons: picking
 * "Any" clears the specific selections and vice-versa. Mirrors the toggle
 * semantics of the previous inline implementation.
 */
function MultiChipList({
  options,
  selected,
  onToggle,
  exclusiveKey,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  exclusiveKey?: string;
}) {
  const handle = (k: string) => {
    if (!exclusiveKey) return onToggle(k);
    if (k === exclusiveKey) {
      // Picking "Any" clears everything and either leaves it selected or unselected.
      if (selected.includes(exclusiveKey)) {
        onToggle(exclusiveKey);
      } else {
        // Clear specifics, then set Any — done as two batched updates in state effect.
        selected.forEach(s => onToggle(s));
        onToggle(exclusiveKey);
      }
      return;
    }
    // Picking a specific value removes "Any" first if present.
    if (selected.includes(exclusiveKey)) onToggle(exclusiveKey);
    onToggle(k);
  };
  return (
    <div className="toggle-group" role="group" aria-label="Options">
      {options.map(opt => (
        <button
          key={opt.key}
          aria-pressed={selected.includes(opt.key)}
          onClick={() => handle(opt.key)}
          className={`toggle-btn ${selected.includes(opt.key) ? 'active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Legacy TagPicker — kept for ItemDetail's inline edit mode which still uses
 * the chip-cloud pattern. AddPlace review has moved to the sheet-based
 * `TagSheetBody` above. When ItemDetail's edit mode moves to the sheet
 * pattern too (a future audit), this export can be dropped.
 */
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
  const outOfPool = selected.filter(t => !pool.includes(t));
  const all = [...pool, ...outOfPool];
  const overCap = selected.length > TAG_SOFT_CAP;
  const toggle = (t: Tag) => {
    onChange(selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t]);
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

/**
 * Tag sheet body — shows category-eligible tags plus any out-of-pool tags the
 * item already has (so users can drop them after a category change). Soft cap
 * at TAG_SOFT_CAP; further picks show a hint but don't block.
 */
function TagSheetBody({
  category,
  selected,
  onToggle,
}: {
  category: Category;
  selected: Tag[];
  onToggle: (t: Tag) => void;
}) {
  const pool = tagsEligibleForCategory(category);
  const outOfPool = selected.filter(t => !pool.includes(t));
  const all = [...pool, ...outOfPool];
  const overCap = selected.length > TAG_SOFT_CAP;
  return (
    <>
      <div className="toggle-group" role="group" aria-label="Tags">
        {all.map(t => (
          <button
            key={t}
            aria-pressed={selected.includes(t)}
            onClick={() => onToggle(t)}
            className={`toggle-btn text-xs ${selected.includes(t) ? 'active' : ''}`}
          >
            {TAG_INFO[t].label}
          </button>
        ))}
      </div>
      {overCap && (
        <p className="text-xs mt-3 text-terra-600" role="alert">
          {selected.length} selected — best to keep it under {TAG_SOFT_CAP}.
        </p>
      )}
    </>
  );
}
