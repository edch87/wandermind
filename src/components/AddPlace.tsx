import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import { searchPlaces, fetchPlaceDetails, fetchGooglePlaceOpeningHours, calculateAllModesTravel, fetchPlaceImage, reverseGeocode, parseGoogleMapsUrl, isGoogleMapsShortUrl, resolveGoogleMapsShortUrl, HERE_TILE_URL, HERE_TILE_ATTRIBUTION } from '../utils/api';
import { inferDefaults } from '../utils/inference';
import { generateId } from '../utils/storage';
import type {
  UserProfile, BucketListItem, HereSearchResult, Category, Setting,
  WeatherSuitability, DurationEstimate, CostLevel, Season, TimeOfDay,
  GroupType, Priority, Tag
} from '../types';
import { CATEGORY_INFO, DURATION_LABELS, COST_LABELS, SEASON_LABELS, TIME_OF_DAY_LABELS, TAG_INFO, TAG_SOFT_CAP, tagsEligibleForCategory } from '../types';
import {
  MapPin, MagnifyingGlass, LinkSimple,
  Buildings, TreeEvergreen, ArrowsClockwise,
  CloudSun, Sun, CloudRain,
  Dog, Wheelchair, Baby,
} from '@phosphor-icons/react';
import PlaceImg from './PlaceImg';
import KiteIcon from './KiteIcon';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onSave: (item: BucketListItem) => void;
  onBack: () => void;
  /** Open an existing item's detail screen — used when a search/url result
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
  const [loadingMsg, setLoadingMsg] = useState('');
  const [draft, setDraft] = useState<Partial<BucketListItem>>({});
  // True when inference couldn't confidently pick a category — prompts the user to confirm.
  const [categoryUncertain, setCategoryUncertain] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
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
    if (q.length < 3) { setResults([]); return; }
    searchTimeout.current = window.setTimeout(async () => {
      setSearching(true);
      const res = await searchPlaces(q, profile.homeLatitude, profile.homeLongitude);
      setResults(res);
      setSearching(false);
    }, 1000);
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

  const importFromUrl = async (raw: string) => {
    setUrlError('');
    let working = raw.trim();

    // Mobile share links (maps.app.goo.gl / goo.gl) have to be expanded first.
    // The browser can't follow the redirect (CORS), so we round-trip through
    // the resolve-maps-link Supabase Edge Function.
    if (isGoogleMapsShortUrl(working)) {
      setStep('loading');
      setLoadingMsg('Expanding share link...');
      const expanded = await resolveGoogleMapsShortUrl(working);
      if (!expanded) {
        setStep('search');
        setUrlError(
          "Couldn't expand that share link. Check your connection and try again, or paste a Google Maps link from a browser instead.",
        );
        return;
      }
      working = expanded;
    }

    const parsed = parseGoogleMapsUrl(working);
    if (!parsed) {
      setStep('search');
      setUrlError(
        "Couldn't find a location in that link. Make sure it's a Google Maps share link or a maps.google.com URL.",
      );
      return;
    }
    setStep('loading');
    setLoadingMsg('Looking up location...');

    // Reverse-geocode for address details + a HERE place id (used by selectPlace
    // to fetch categories, opening hours, etc.). Fall back to a bare pin if it fails.
    const geo = await reverseGeocode(parsed.lat, parsed.lng);
    const result: HereSearchResult = geo
      ? {
          ...geo,
          // Prefer the name from the URL — reverse geocode often returns a street address
          title: parsed.name || geo.title,
          position: { lat: parsed.lat, lng: parsed.lng },
        }
      : {
          id: '',
          title: parsed.name || 'Pinned location',
          address: { label: parsed.name || `${parsed.lat}, ${parsed.lng}` },
          position: { lat: parsed.lat, lng: parsed.lng },
          categories: [],
        };

    setStep('search');

    // If the pasted link points to a place already on the list, jump straight
    // to its detail screen instead of taking the user through confirm/review.
    const existing = findExistingMatch(result, items);
    if (existing) {
      onViewExisting(existing.id);
      return;
    }

    // Drop into the confirm step so the user can verify the parsed pin before
    // we spend API calls on details/photos/travel time.
    goToConfirm(result);
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
      <div className="page-enter px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-600 text-sm">←</button>
          <h2 className="text-xl font-semibold text-sand-900">Add a <span className="heading-accent">place</span></h2>
        </div>
        <div className="relative mb-4">
          <input type="text" value={query} onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search for a place..."
            autoFocus
            className="w-full px-4 py-3.5 bg-white border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 focus:ring-1 focus:ring-sand-300" />
        </div>

        {/* Import from a Google Maps link */}
        {!urlMode ? (
          <button onClick={() => setUrlMode(true)}
            className="inline-flex items-center gap-1.5 text-xs text-sand-600 hover:text-sand-900 underline mb-4 px-1">
            <LinkSimple size={14} /> Or paste a Google Maps link
          </button>
        ) : (
          <div className="mb-4 space-y-2">
            <div className="flex gap-2">
              <input type="text" value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && urlInput.trim()) importFromUrl(urlInput); }}
                placeholder="Paste a Google Maps link..."
                className="flex-1 px-4 py-3 bg-white border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 focus:ring-1 focus:ring-sand-300" />
              <button onClick={() => importFromUrl(urlInput)} disabled={!urlInput.trim()}
                className="px-5 py-3 bg-sand-900 text-sand-100 rounded-[12px] text-sm font-medium hover:bg-sand-800 transition disabled:opacity-40">
                Add
              </button>
            </div>
            {urlError && <p className="text-xs text-red-600 px-1">{urlError}</p>}
            <p className="text-[10px] text-sand-600 px-1">Open the place in Google Maps, copy the link from your browser's address bar, and paste it here.</p>
          </div>
        )}

        {searching && <p className="text-xs text-sand-600 mb-2 px-1">Searching...</p>}
        <div className="space-y-1">
          {results.map((r) => {
            const subtitle = [r.address.city, r.address.country].filter(Boolean).join(', ');
            const existing = findExistingMatch(r, items);
            // If already in the list, tap routes to the item detail instead of
            // the confirm step — same surface, no silent hide, no re-adding.
            return (
              <button key={r.id} onClick={() => existing ? onViewExisting(existing.id) : goToConfirm(r)}
                className="w-full text-left px-4 py-3.5 rounded-[20px] hover:bg-sand-100 transition">
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
        {!searching && results.length === 0 && query.length >= 3 && (
          <div className="text-center py-12">
            <p className="text-sm text-sand-600">No results found. Try a different search.</p>
          </div>
        )}
        {query.length < 3 && (
          <div className="text-center py-16">
            <div className="flex justify-center mb-3"><MagnifyingGlass size={32} className="text-sand-300" /></div>
            <p className="text-sm text-sand-700">Search for museums, restaurants, parks, hikes, viewpoints...</p>
          </div>
        )}
      </div>
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
      <div className="bg-sand-50 pb-4 w-full max-w-full overflow-x-hidden">
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={backToSearch}
              className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-600 text-sm">←</button>
            <h2 className="text-xl font-semibold text-sand-900">
              Is this the right <span className="heading-accent">spot?</span>
            </h2>
          </div>
          <p className="text-base font-medium text-sand-900">{pendingPlace.title}</p>
          <p className="text-xs text-sand-700 mt-0.5 truncate">{pendingPlace.address.label}</p>
          <p className="text-xs text-sand-600 mt-2">
            Drag the pin (or tap the map) if it's slightly off.
          </p>
        </div>

        {/* px-6 wrapper + w-full on the map is the same pattern Settings uses.
            Earlier mx-6 on the map div was letting Leaflet render past the
            right edge in some PWA layouts — putting the inset on a wrapper
            forces an explicit constrained width on the map element itself. */}
        <div className="px-6">
          <div
            ref={confirmMapRef}
            className="w-full rounded-[20px] border border-sand-200 overflow-hidden"
            style={{ height: '55vh', minHeight: '320px' }}
          />
        </div>

        <div
          className="px-6 pt-3 flex gap-2"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button onClick={backToSearch}
            className="flex-1 py-3.5 rounded-full font-medium text-sm border border-sand-300 text-sand-800 hover:bg-sand-100 transition">
            Search again
          </button>
          <button onClick={confirmPlace}
            className="flex-[2] bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold text-base hover:bg-sand-800 transition">
            Add this place
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <KiteIcon size={48} className="text-sand-900 mb-4" animate />
        <p className="text-sm text-sand-600 font-medium">{loadingMsg}</p>
      </div>
    );
  }

  // Review screen
  return (
    <div className="page-enter pb-24">
      {/* Hero image — always shown; PlaceImg renders the designed placeholder
          when there's no photo so the layout stays consistent. */}
      <div className="place-img-container h-48 rounded-none">
        <PlaceImg
          src={draft.photoUrl}
          alt={draft.name || ''}
          name={draft.name}
          category={draft.category || 'other'}
          placeholderVariant="detail"
          loading="eager"
        />
        <button onClick={() => setStep('search')}
          className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-sand-700 text-sm">
          ←
        </button>
      </div>

      <div className="px-6 pt-5">

        {/* Place name & travel info */}
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-sand-900">{draft.name}</h2>
          <p className="text-xs text-sand-700 mt-1">{draft.address?.split(',').slice(1, 3).join(',')}</p>
          {draft.travelDistanceKm != null && (
            <div className="flex items-center gap-3 mt-3">
              <span className="badge bg-sand-100 text-sand-700 inline-flex items-center gap-1.5">
                <MapPin size={14} /> {draft.travelDistanceKm} km away
              </span>
            </div>
          )}
        </div>

        {/* Fields */}
        <Section label="Category">
          {categoryUncertain && (
            <p className="mb-2 text-xs text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded-md px-2.5 py-1.5">
              We weren't sure how to categorise this one. Please pick the best fit below.
            </p>
          )}
          <div className="toggle-group">
            {(Object.entries(CATEGORY_INFO) as [Category, { label: string; icon: string; color: string }][]).map(([key, info]) => (
              <button key={key} className={`toggle-btn text-xs ${draft.category === key ? 'active' : ''}`}
                onClick={() => { updateDraft({ category: key }); setCategoryUncertain(false); }}>{info.label}</button>
            ))}
          </div>
        </Section>

        <Section label="Setting">
          <div className="toggle-group">
            {([
              { val: 'indoor' as Setting, label: 'Indoor', icon: <Buildings size={16} /> },
              { val: 'outdoor' as Setting, label: 'Outdoor', icon: <TreeEvergreen size={16} /> },
              { val: 'mixed' as Setting, label: 'Mixed', icon: <ArrowsClockwise size={16} /> },
            ]).map(({ val, label, icon }) => (
              <button key={val} className={`toggle-btn ${draft.setting === val ? 'active' : ''}`}
                onClick={() => updateDraft({ setting: val })}>
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Weather">
          <div className="toggle-group">
            {([
              { val: 'any' as WeatherSuitability, label: 'Any weather', icon: <CloudSun size={16} /> },
              { val: 'good_weather' as WeatherSuitability, label: 'Good weather only', icon: <Sun size={16} /> },
              { val: 'bad_weather_ideal' as WeatherSuitability, label: 'Great for bad weather', icon: <CloudRain size={16} /> },
            ]).map(({ val, label, icon }) => (
              <button key={val} className={`toggle-btn ${draft.weatherSuitability === val ? 'active' : ''}`}
                onClick={() => updateDraft({ weatherSuitability: val })}>
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Activity duration">
          <div className="toggle-group">
            {(Object.entries(DURATION_LABELS) as [DurationEstimate, string][]).map(([key, label]) => (
              <button key={key} className={`toggle-btn ${draft.durationEstimate === key ? 'active' : ''}`}
                onClick={() => updateDraft({ durationEstimate: key })}>{label}</button>
            ))}
          </div>
          <p className="text-[10px] text-sand-600 mt-1">How long the activity itself takes (travel time is calculated separately)</p>
        </Section>

        <Section label="Cost">
          <div className="toggle-group">
            {(Object.entries(COST_LABELS) as [CostLevel, string][]).map(([key, label]) => (
              <button key={key} className={`toggle-btn ${draft.costLevel === key ? 'active' : ''}`}
                onClick={() => updateDraft({ costLevel: key })}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Best seasons">
          <div className="toggle-group">
            {(Object.entries(SEASON_LABELS) as [Season, string][]).map(([key, label]) => (
              <button key={key} className={`toggle-btn ${(draft.bestSeasons || []).includes(key) ? 'active' : ''}`}
                onClick={() => toggleSeason(key)}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Best times of day">
          <div className="toggle-group">
            {(Object.entries(TIME_OF_DAY_LABELS) as [TimeOfDay, string][]).map(([key, label]) => (
              <button key={key} className={`toggle-btn ${(draft.bestTimesOfDay || []).includes(key) ? 'active' : ''}`}
                onClick={() => toggleTimeOfDay(key)}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Good for">
          <div className="toggle-group">
            {([
              ['solo', 'Solo'],
              ['couple', 'Couple'],
              ['friends', 'Friends'],
              ['kids', 'With kids'],
            ] as [GroupType, string][]).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${(draft.groupSuitability || []).includes(val) ? 'active' : ''}`}
                onClick={() => toggleGroupType(val)}>{label}</button>
            ))}
          </div>
        </Section>

        {/* Tag picker — text-only, user-driven (no inference). Category-eligible
            pool only. Soft 5-tag cap; further taps after the cap show a hint
            but don't block (existing items can keep more than 5). */}
        {draft.category && (
          <Section label="Tags">
            <TagPicker
              category={draft.category}
              selected={(draft.tags || []) as Tag[]}
              onChange={(next) => updateDraft({ tags: next })}
            />
          </Section>
        )}

        <Section label="Accessibility">
          <div className="toggle-group">
            <button className={`toggle-btn ${draft.dogFriendly === true ? 'active' : ''}`}
              onClick={() => updateDraft({ dogFriendly: draft.dogFriendly === true ? undefined : true })}>
              <span className="inline-flex items-center gap-1.5"><Dog size={16} /> Dog-friendly</span>
            </button>
            <button className={`toggle-btn ${draft.wheelchairAccessible === true ? 'active' : ''}`}
              onClick={() => updateDraft({ wheelchairAccessible: draft.wheelchairAccessible === true ? undefined : true })}>
              <span className="inline-flex items-center gap-1.5"><Wheelchair size={16} /> Wheelchair</span>
            </button>
            <button className={`toggle-btn ${draft.strollerFriendly === true ? 'active' : ''}`}
              onClick={() => updateDraft({ strollerFriendly: draft.strollerFriendly === true ? undefined : true })}>
              <span className="inline-flex items-center gap-1.5"><Baby size={16} /> Stroller</span>
            </button>
          </div>
        </Section>

        <Section label="Priority">
          <div className="toggle-group">
            {([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${draft.priority === val ? 'active' : ''}`}
                onClick={() => updateDraft({ priority: val as Priority })}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Personal notes">
          <textarea value={draft.personalNotes || ''} onChange={(e) => updateDraft({ personalNotes: e.target.value })}
            placeholder="Any notes about this place..."
            rows={2}
            className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 resize-none bg-white" />
        </Section>

        <button onClick={() => onSave(draft as BucketListItem)}
          className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-base hover:bg-sand-800 transition mt-2 mb-4">
          Save to bucket list
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-xs font-medium text-sand-600 mb-2 uppercase tracking-wide">{label}</label>
      {children}
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
      <div className="toggle-group">
        {all.map(t => (
          <button key={t} className={`toggle-btn text-xs ${selected.includes(t) ? 'active' : ''}`}
            onClick={() => toggle(t)}>
            {TAG_INFO[t].label}
          </button>
        ))}
      </div>
      <p className={`text-[10px] mt-1 ${overCap ? 'text-terra-600' : 'text-sand-600'}`}>
        {overCap
          ? `${selected.length} selected — best to keep it under ${TAG_SOFT_CAP}.`
          : `Pick the ones that make this place worth recommending. Up to ${TAG_SOFT_CAP}.`}
      </p>
    </div>
  );
}
