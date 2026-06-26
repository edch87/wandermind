import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { fetchGooglePlacePhoto, fetchGooglePlaceOpeningHours, HERE_TILE_URL, HERE_TILE_ATTRIBUTION } from '../utils/api';
import type {
  UserProfile, BucketListItem, Category, Setting, WeatherSuitability, DurationEstimate,
  CostLevel, Season, TimeOfDay, GroupType, Priority, Tag, PreferredTransport,
} from '../types';
import { CATEGORY_INFO, DURATION_LABELS, COST_LABELS, SEASON_LABELS, TIME_OF_DAY_LABELS, TAG_INFO } from '../types';
import { formatOpeningHours, getOpeningHoursStatus } from '../utils/openingHours';
import PlaceholderImage from './PlaceholderImage';
import { TagPicker } from './AddPlace';
import {
  Sun, CloudRain, CloudSun,
  Clock, Coins, Users, Dog, Wheelchair, Baby,
  Flower, SunHorizon, MapPin, Star, ArrowRight, Trash, Check, PencilSimple, X,
  Buildings, TreeEvergreen, ArrowsClockwise,
  Car, Train, Bicycle, Footprints, ArrowSquareOut,
} from '@phosphor-icons/react';
import { formatDuration } from '../types';

interface Props {
  item: BucketListItem;
  profile: UserProfile;
  onBack: () => void;
  onSave: (item: BucketListItem) => void;
  onDelete: (id: string) => void;
}

/** Walking auto-override threshold: at ≤15 min the place is essentially next
 *  door — surface walking instead of the user's preferred mode regardless of
 *  the profile preference. */
const WALK_OVERRIDE_MAX_MIN = 15;
/** Travel block is hidden below this — the place is essentially at home. */
const TRAVEL_HIDE_MIN_KM = 0.1;
/** Opening hours TTL — refresh in background on detail-page open if older. */
const OPENING_HOURS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TRANSPORT_META: Record<'car' | 'transit' | 'bike' | 'walk', {
  label: string;
  icon: React.ReactNode;
  googleTravelMode: string;
}> = {
  car:     { label: 'By car',     icon: <Car size={16} />,        googleTravelMode: 'driving' },
  transit: { label: 'By transit', icon: <Train size={16} />,      googleTravelMode: 'transit' },
  bike:    { label: 'By bike',    icon: <Bicycle size={16} />,    googleTravelMode: 'bicycling' },
  walk:    { label: 'On foot',    icon: <Footprints size={16} />, googleTravelMode: 'walking' },
};

/** Pick the mode that should surface on the detail page given the user's
 *  profile preference + the item's stored per-mode minutes.
 *  - Walking auto-override when walkMinutes ≤ 15 (place is essentially next door).
 *  - Otherwise the user's preferredTransport, unless that mode's minutes are
 *    null (e.g. no practical transit) — in which case return the preferred
 *    mode anyway so the caller can render an explicit fallback line. */
function pickDisplayMode(
  item: BucketListItem,
  preferred: PreferredTransport,
): { mode: 'car' | 'transit' | 'bike' | 'walk'; minutes: number | null; walkOverride: boolean } {
  if (item.walkMinutes != null && item.walkMinutes <= WALK_OVERRIDE_MAX_MIN) {
    return { mode: 'walk', minutes: item.walkMinutes, walkOverride: true };
  }
  const minutes = preferred === 'car' ? item.carMinutes
    : preferred === 'transit' ? item.transitMinutes
    : item.bikeMinutes;
  return { mode: preferred, minutes, walkOverride: false };
}

const weatherIconEl = (suitability: string) => {
  switch (suitability) {
    case 'good_weather': return <Sun size={16} />;
    case 'bad_weather_ideal': return <CloudRain size={16} />;
    default: return <CloudSun size={16} />;
  }
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-xs font-medium text-sand-600 mb-2 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export default function ItemDetail({ item, profile, onBack, onSave, onDelete }: Props) {
  const [showComplete, setShowComplete] = useState(false);
  const [rating, setRating] = useState(0);
  const [completionNotes, setCompletionNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BucketListItem>({ ...item });
  const [showAllHours, setShowAllHours] = useState(false);
  // Google photos can't be stored (ToS — URLs expire), so fetch a fresh one at
  // display time. Falls back to the stored photoUrl until/unless it arrives.
  const [livePhotoUrl, setLivePhotoUrl] = useState<string | null>(null);

  // Embedded travel-block map. Built only when the travel block is visible.
  const travelMapRef = useRef<HTMLDivElement>(null);
  const travelMapInstance = useRef<L.Map | null>(null);

  const preferredTransport: PreferredTransport = profile.preferredTransport || 'car';
  const display = pickDisplayMode(item, preferredTransport);
  const meta = TRANSPORT_META[display.mode];
  const showTravelBlock = item.travelDistanceKm >= TRAVEL_HIDE_MIN_KM;

  const handleNavigate = () => {
    // Use the displayed mode (preferred or walking-override) so the Google
    // Maps handoff matches what the user saw on the card.
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}&travelmode=${meta.googleTravelMode}`,
      '_blank',
    );
  };

  useEffect(() => {
    let active = true;
    if (item.googlePlaceId) {
      fetchGooglePlacePhoto(item.googlePlaceId).then(url => {
        if (active && url) setLivePhotoUrl(url);
      });
    }
    return () => { active = false; };
  }, [item.googlePlaceId]);

  // Lazy 30-day TTL refresh for Google opening hours. Runs in the background
  // when the detail page opens. Updates the stored value + timestamp without
  // triggering a navigation. Bounded by `item.googlePlaceId` — if there's no
  // Google match for this place we can't refresh anyway.
  useEffect(() => {
    if (editing || !item.googlePlaceId) return;
    const last = item.openingHoursLastRefreshedAt ? Date.parse(item.openingHoursLastRefreshedAt) : 0;
    if (Date.now() - last < OPENING_HOURS_TTL_MS) return;
    let active = true;
    fetchGooglePlaceOpeningHours(item.googlePlaceId).then(fresh => {
      if (!active) return;
      // Treat undefined as "no hours data" — still mark refreshed so we don't
      // re-hit Google on every visit. Only persist when something changed.
      const nextHours = fresh ?? item.openingHours;
      onSave({
        ...item,
        openingHours: nextHours,
        openingHoursLastRefreshedAt: new Date().toISOString(),
      });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.googlePlaceId, editing]);

  // Build the small destination map embedded in the Getting There card.
  useEffect(() => {
    if (editing || !showTravelBlock) return;
    if (!travelMapRef.current || travelMapInstance.current) return;
    const map = L.map(travelMapRef.current, {
      // Non-interactive: this is a static preview, taps fall through to
      // handleNavigate via the overlay button.
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
      attributionControl: false,
    }).setView([item.latitude, item.longitude], 14);
    L.tileLayer(HERE_TILE_URL, { attribution: HERE_TILE_ATTRIBUTION }).addTo(map);
    L.marker([item.latitude, item.longitude]).addTo(map);
    travelMapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      travelMapInstance.current = null;
    };
  }, [editing, showTravelBlock, item.latitude, item.longitude]);

  const photoUrl = livePhotoUrl || item.photoUrl;

  const cat = CATEGORY_INFO[item.category];

  const handleMarkDone = () => {
    onSave({ ...item, status: 'done', completedAt: new Date().toISOString(),
      completionRating: rating || undefined, completionNotes: completionNotes || undefined });
    setShowComplete(false);
  };

  const startEditing = () => {
    setDraft({ ...item });
    setEditing(true);
  };

  const handleSaveEdit = () => {
    onSave(draft);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft({ ...item });
    setEditing(false);
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
      updateDraft({ bestSeasons: current.includes('any') ? [] : ['any'] });
    } else {
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

  // ── EDIT MODE ──
  if (editing) {
    return (
      <div className="page-enter pb-24">
        {/* Hero */}
        <div className="relative">
          {(livePhotoUrl || draft.photoUrl) ? (
            <div className="place-img-container h-48 rounded-none">
              <img src={livePhotoUrl || draft.photoUrl} alt={draft.name} className="place-img"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          ) : (
            <div className="place-img-container h-32 rounded-none">
              <PlaceholderImage category={draft.category} className="absolute inset-0" />
            </div>
          )}
          <button onClick={cancelEdit}
            className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-sand-700 text-sm shadow-sm">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pt-5">
          <h2 className="text-lg font-semibold text-sand-900 mb-1">Edit: {draft.name}</h2>
          <p className="text-xs text-sand-700 mb-5">{draft.address?.split(',').slice(0, 3).join(',')}</p>

          <Section label="Category">
            <div className="toggle-group">
              {(Object.entries(CATEGORY_INFO) as [Category, { label: string; icon: string; color: string }][]).map(([key, info]) => (
                <button key={key} className={`toggle-btn text-xs ${draft.category === key ? 'active' : ''}`}
                  onClick={() => updateDraft({ category: key })}>{info.label}</button>
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

          <Section label="Tags">
            <TagPicker
              category={draft.category}
              selected={(draft.tags || []) as Tag[]}
              onChange={(next) => updateDraft({ tags: next })}
            />
          </Section>

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

          <div className="flex gap-2 mt-2 mb-4">
            <button onClick={cancelEdit}
              className="flex-1 py-3.5 rounded-full bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
            <button onClick={handleSaveEdit}
              className="flex-1 py-3.5 rounded-full bg-sand-900 text-sand-100 font-medium text-sm hover:bg-sand-800 transition">Save changes</button>
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW MODE ──
  // "Any" rows hide entirely (information by omission). The full set of
  // group types also hides — "Solo, Couple, Friends, With kids" doesn't tell
  // the user anything beyond what omission would.
  const seasonRow = !(item.bestSeasons || []).includes('any') && (item.bestSeasons || []).length > 0
    ? (item.bestSeasons || []).map(s => SEASON_LABELS[s]).join(', ')
    : null;
  const timesRow = !(item.bestTimesOfDay || []).includes('any') && (item.bestTimesOfDay || []).length > 0
    ? (item.bestTimesOfDay || []).map(t => TIME_OF_DAY_LABELS[t]).join(', ')
    : null;
  const groups = item.groupSuitability || [];
  const ALL_GROUPS: GroupType[] = ['solo', 'couple', 'friends', 'kids'];
  const showGroupRow = groups.length > 0 && groups.length < ALL_GROUPS.length;
  const weatherRow = item.weatherSuitability !== 'any'
    ? (item.weatherSuitability === 'good_weather' ? 'Best in good weather' : 'Great for bad weather')
    : null;

  // Accessibility chip: a single row with ✓/✗ markers per defined slot. Undefined
  // slots are omitted entirely (no signal). Negative states stay because
  // "✗ Dogs" is useful planning info when you're bringing one.
  const a11yChips: { icon: React.ReactNode; label: string; positive: boolean }[] = [];
  if (item.dogFriendly !== undefined)
    a11yChips.push({ icon: <Dog size={13} />, label: 'Dogs', positive: item.dogFriendly });
  if (item.wheelchairAccessible !== undefined)
    a11yChips.push({ icon: <Wheelchair size={13} />, label: 'Wheelchair', positive: item.wheelchairAccessible });
  if (item.strollerFriendly !== undefined)
    a11yChips.push({ icon: <Baby size={13} />, label: 'Stroller', positive: item.strollerFriendly });

  const openingStatus = getOpeningHoursStatus(item.openingHours);

  return (
    <div className="page-enter pb-24">
      {/* Hero */}
      <div className="relative">
        {photoUrl ? (
          <div className="place-img-container h-56 rounded-none">
            <img src={photoUrl} alt={item.name} className="place-img"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        ) : (
          <div className="place-img-container h-40 rounded-none">
            <PlaceholderImage category={item.category} className="absolute inset-0" />
          </div>
        )}
        <button onClick={onBack}
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-sand-700 text-sm shadow-sm">
          ←
        </button>
      </div>

      <div className="px-6 -mt-6 relative z-10">
        {/* Title card */}
        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-sand-100 mb-4">
          <div className="flex items-start justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge text-xs" style={{ backgroundColor: cat.color + '15', color: cat.color }}>{cat.label}</span>
              <span className="badge bg-sand-100 text-sand-600 text-xs">{item.priority} priority</span>
            </div>
            {/* 44×44px hit area to meet iOS minimum touch target; the visible
                pencil chip stays at 32px via inner span. */}
            <button onClick={startEditing} aria-label="Edit details"
              className="-mr-2 -mt-2 w-11 h-11 flex items-center justify-center text-sand-500 hover:text-sand-700 transition">
              <span className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center hover:bg-sand-200 transition">
                <PencilSimple size={14} />
              </span>
            </button>
          </div>
          <h2 className="text-xl font-semibold text-sand-900">{item.name}</h2>
          <p className="text-xs text-sand-700 mt-1 inline-flex items-center gap-1">
            <MapPin size={12} /> {item.address?.split(',').slice(0, 3).join(',')}
          </p>
          {(item.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(item.tags || []).filter((t): t is Tag => t in TAG_INFO).map(t => (
                <span key={t} className="badge bg-sand-100 text-sand-700 text-[11px]">
                  {TAG_INFO[t].label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Getting there — single mode + embedded map. Tap the map to launch
            Google Maps in the same mode. Hidden when the place is essentially
            at home (travelDistanceKm < 0.1). */}
        {showTravelBlock && (
          <div className="bg-white rounded-[20px] p-4 border border-sand-100 mb-4">
            <p className="text-[10px] font-medium text-sand-700 uppercase tracking-wider mb-3">Getting there</p>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-6 flex justify-center text-sand-500">{meta.icon}</span>
              {display.minutes != null ? (
                <span className="text-sm text-sand-700">
                  {formatDuration(display.minutes)} {meta.label.toLowerCase()}
                  <span className="text-sand-500"> · {item.travelDistanceKm} km away</span>
                </span>
              ) : (
                // Preferred mode has no practical route (most commonly: transit).
                // Show an explicit fallback line — don't silently swap to another mode.
                <span className="text-sm text-sand-500">
                  Not practical {meta.label.toLowerCase()}
                  {item.carMinutes != null && ` — ${formatDuration(item.carMinutes)} by car`}
                </span>
              )}
            </div>
            {/* Inline height with minHeight fallback — Leaflet collapses with
                vh inside App's wrapper, see leaflet-layout-in-app-wrapper. */}
            <button onClick={handleNavigate}
              aria-label="Open in Google Maps"
              className="relative block w-full rounded-[14px] overflow-hidden border border-sand-100 hover:opacity-90 transition">
              <div
                ref={travelMapRef}
                className="w-full"
                style={{ height: '10rem', minHeight: '160px' }}
              />
              <span className="pointer-events-none absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full px-2.5 py-1 text-[11px] font-medium text-sand-700 inline-flex items-center gap-1 shadow-sm">
                <ArrowSquareOut size={11} /> Maps
              </span>
            </button>
          </div>
        )}

        {/* Info rows — promoted (duration + cost + weather when set) on top,
            secondary rows below. Accessibility folded into a single chip row. */}
        <div className="bg-white rounded-[20px] p-4 border border-sand-100 mb-4">
          {/* Promoted: duration + cost + (weather when set). Larger text, sand-900. */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sand-500"><Clock size={16} /></span>
              <span className="text-sm font-medium text-sand-900">{DURATION_LABELS[item.durationEstimate]}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sand-500"><Coins size={16} /></span>
              <span className="text-sm font-medium text-sand-900">
                {COST_LABELS[item.costLevel]}{item.specificCost ? ` (~${item.specificCost})` : ''}
              </span>
            </div>
            {weatherRow && (
              <div className="flex items-center gap-2">
                <span className="text-sand-500">{weatherIconEl(item.weatherSuitability)}</span>
                <span className="text-sm font-medium text-sand-900">{weatherRow}</span>
              </div>
            )}
          </div>

          {/* Secondary: groups, accessibility chips, seasons, times — only when present */}
          {(showGroupRow || a11yChips.length > 0 || seasonRow || timesRow) && (
            <div className="space-y-2.5 pt-3 border-t border-sand-100">
              {showGroupRow && (
                <div className="flex items-center gap-3">
                  <span className="w-5 flex justify-center text-sand-500"><Users size={14} /></span>
                  <span className="text-[13px] text-sand-700">
                    Good for {groups.map(g => g === 'kids' ? 'kids' : g).join(', ')}
                  </span>
                </div>
              )}
              {a11yChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-8">
                  {a11yChips.map(c => (
                    <span key={c.label} className={`inline-flex items-center gap-1 text-[12px] ${c.positive ? 'text-forest-600' : 'text-sand-500'}`}>
                      <span className="font-semibold">{c.positive ? '✓' : '✗'}</span>
                      {c.icon} {c.label}
                    </span>
                  ))}
                </div>
              )}
              {seasonRow && (
                <div className="flex items-center gap-3">
                  <span className="w-5 flex justify-center text-sand-500"><Flower size={14} /></span>
                  <span className="text-[13px] text-sand-700">{seasonRow}</span>
                </div>
              )}
              {timesRow && (
                <div className="flex items-center gap-3">
                  <span className="w-5 flex justify-center text-sand-500"><SunHorizon size={14} /></span>
                  <span className="text-[13px] text-sand-700">{timesRow}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Opening hours — status line + dot, full week behind toggle, lazy
            refresh handled in the useEffect above. */}
        {item.openingHours && (
          <div className="bg-sand-100 rounded-[20px] p-4 mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-medium text-sand-700 uppercase tracking-wider">Opening hours</p>
            </div>
            {openingStatus ? (
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${openingStatus.isOpen ? 'bg-forest-500' : 'bg-sand-400'}`} />
                <span className="text-sm font-medium text-sand-900">{openingStatus.label}</span>
              </div>
            ) : (
              // Hours present but unparseable — fall back to the raw formatted view
              <div className="space-y-1">
                {formatOpeningHours(item.openingHours).split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-sand-800">{line}</p>
                ))}
              </div>
            )}
            {openingStatus && (
              <button onClick={() => setShowAllHours(v => !v)}
                className="mt-2 text-[12px] font-medium text-sand-700 hover:text-sand-900">
                {showAllHours ? 'Hide hours' : 'Show all hours'}
              </button>
            )}
            {openingStatus && showAllHours && (
              <div className="mt-2 space-y-0.5 pt-2 border-t border-sand-200">
                {formatOpeningHours(item.openingHours).split('\n').map((line, i) => (
                  <p key={i} className="text-[13px] text-sand-700">{line}</p>
                ))}
              </div>
            )}
            <p className="text-[11px] text-sand-600 mt-2">
              Hours can change — worth a quick check before you go.
            </p>
            {item.googlePlaceId && (
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${item.googlePlaceId}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-terra-500 hover:text-terra-600 mt-1"
              >
                Check on Google <ArrowSquareOut size={11} />
              </a>
            )}
          </div>
        )}

        {/* Notes */}
        {item.personalNotes && (
          <div className="bg-sand-100 rounded-[20px] p-4 mb-4">
            <p className="text-[10px] font-medium text-sand-700 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-sand-800">{item.personalNotes}</p>
          </div>
        )}

        {/* Completion */}
        {item.status === 'done' && (
          <div className="bg-forest-50 rounded-[20px] p-4 mb-4">
            <p className="text-[10px] font-medium text-forest-600 uppercase tracking-wider mb-1">
              Completed {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : ''}
            </p>
            {item.completionRating && (
              <div className="flex gap-1 mb-1">
                {Array.from({ length: item.completionRating }).map((_, i) => (
                  <Star key={i} size={14} weight="fill" className="text-amber-500" />
                ))}
              </div>
            )}
            {item.completionNotes && <p className="text-sm text-sand-700">{item.completionNotes}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 mt-4">
          <button onClick={handleNavigate}
            className="w-full py-3.5 rounded-full font-medium text-sm bg-sand-900 text-sand-100 hover:bg-sand-800 transition inline-flex items-center justify-center gap-2">
            Navigate <ArrowRight size={16} />
          </button>
          {item.status === 'want_to_do' && (
            <button onClick={() => setShowComplete(true)}
              className="w-full py-3.5 rounded-full font-medium text-sm bg-forest-500 text-white hover:bg-forest-600 transition inline-flex items-center justify-center gap-2">
              Mark as done <Check size={16} />
            </button>
          )}
          <button onClick={() => setConfirmDelete(true)}
            className="w-full py-3.5 rounded-full font-medium text-sm text-terra-500 border border-terra-500/20 hover:bg-terra-500/5 transition inline-flex items-center justify-center gap-2">
            <Trash size={16} /> Delete
          </button>
        </div>
      </div>

      {/* Mark as done modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-sand-900/50 flex items-end z-50">
          <div className="bg-white w-full max-w-[480px] mx-auto rounded-t-3xl p-6 pb-24">
            <h3 className="text-lg font-semibold text-sand-900 mb-4">How was it?</h3>
            <div className="mb-4">
              <label className="text-xs font-medium text-sand-600 mb-2 block uppercase tracking-wider">Rating</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setRating(n)}
                    className={`transition ${n <= rating ? 'text-amber-500' : 'text-sand-300'}`}>
                    <Star size={24} weight={n <= rating ? 'fill' : 'regular'} />
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-medium text-sand-600 mb-2 block uppercase tracking-wider">Notes (optional)</label>
              <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="How was the experience?"
                rows={2}
                className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base focus:outline-none focus:border-sand-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowComplete(false)}
                className="flex-1 py-3 rounded-full bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
              <button onClick={handleMarkDone}
                className="flex-1 py-3 rounded-full bg-forest-500 text-white font-medium text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-sand-900/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-sand-900 mb-2">Delete this place?</h3>
            <p className="text-sm text-sand-700 mb-5">This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-full bg-sand-100 text-sand-600 font-medium text-sm">Cancel</button>
              <button onClick={() => onDelete(item.id)}
                className="flex-1 py-2.5 rounded-full bg-terra-500 text-white font-medium text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
