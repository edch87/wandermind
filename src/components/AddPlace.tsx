import { useState, useRef } from 'react';
import { searchPlaces, fetchOsmTags, calculateTravelTime, fetchPlaceImage } from '../utils/api';
import { inferDefaults } from '../utils/inference';
import { generateId } from '../utils/storage';
import type {
  UserProfile, BucketListItem, NominatimResult, Category, Setting,
  WeatherSuitability, DurationEstimate, CostLevel, Season, TimeOfDay,
  GroupType, Priority
} from '../types';
import { CATEGORY_INFO, DURATION_LABELS, COST_LABELS, SEASON_LABELS } from '../types';

interface Props {
  profile: UserProfile;
  onSave: (item: BucketListItem) => void;
  onBack: () => void;
}

type Step = 'search' | 'loading' | 'review';

export default function AddPlace({ profile, onSave, onBack }: Props) {
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [draft, setDraft] = useState<Partial<BucketListItem>>({});

  const searchTimeout = useRef<number | null>(null);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (searchTimeout.current !== null) clearTimeout(searchTimeout.current);
    if (q.length < 3) { setResults([]); return; }
    searchTimeout.current = window.setTimeout(async () => {
      setSearching(true);
      const res = await searchPlaces(q);
      setResults(res);
      setSearching(false);
    }, 1000);
  };

  const selectPlace = async (result: NominatimResult) => {
    setStep('loading');
    setResults([]);
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    setLoadingMsg('Fetching place details...');
    let tags: Record<string, string> = {};
    if (result.osm_id) {
      tags = await fetchOsmTags(result.osm_type, result.osm_id);
    }

    setLoadingMsg('Calculating travel time...');
    const travel = await calculateTravelTime(
      profile.homeLatitude, profile.homeLongitude, lat, lng, profile.preferredTransport
    );

    setLoadingMsg('Finding photos...');
    const searchTags = { ...tags, name: result.display_name.split(',')[0] };
    const photoUrl = await fetchPlaceImage(searchTags, lat, lng);

    setLoadingMsg('Auto-categorising...');
    const inferred = inferDefaults(tags);
    const parts = result.display_name.split(',').map(s => s.trim());

    setDraft({
      id: generateId(),
      status: 'want_to_do',
      createdAt: new Date().toISOString(),
      name: parts[0] || result.display_name,
      latitude: lat,
      longitude: lng,
      osmId: `${result.osm_type}/${result.osm_id}`,
      osmTags: tags,
      photoUrl,
      address: result.display_name,
      country: result.address?.country || '',
      region: result.address?.state || '',
      city: result.address?.city || result.address?.town || '',
      openingHours: tags['opening_hours'] || undefined,
      travelTimeMinutes: travel.durationMinutes,
      travelDistanceKm: travel.distanceKm,
      transportMode: profile.preferredTransport,
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
            className="w-full px-4 py-3.5 bg-white border border-sand-200 rounded-2xl text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 focus:ring-1 focus:ring-sand-300" />
        </div>
        {searching && <p className="text-xs text-sand-400 mb-2 px-1">Searching...</p>}
        <div className="space-y-1">
          {results.map((r) => {
            const addr = r.address || {};
            const placeName = r.display_name.split(',')[0].trim();
            const locale = addr.city || addr.town || addr.village || addr.county || addr.state || '';
            const country = addr.country || '';
            const subtitle = [locale, country].filter(Boolean).join(', ');
            return (
              <button key={r.place_id} onClick={() => selectPlace(r)}
                className="w-full text-left px-4 py-3.5 rounded-2xl hover:bg-sand-100 transition">
                <div className="text-sm font-medium text-sand-900">{placeName}</div>
                {subtitle && <div className="text-xs text-sand-500 mt-0.5">{subtitle}</div>}
              </button>
            );
          })}
        </div>
        {!searching && results.length === 0 && query.length >= 3 && (
          <div className="text-center py-12">
            <p className="text-sm text-sand-400">No results found. Try a different search.</p>
          </div>
        )}
        {query.length < 3 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-sand-500">Search for museums, restaurants, parks, hikes, viewpoints...</p>
          </div>
        )}
      </div>
    );
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-12 h-12 rounded-full bg-sand-100 flex items-center justify-center mb-4">
          <div className="w-6 h-6 border-2 border-sand-300 border-t-sand-700 rounded-full animate-spin" />
        </div>
        <p className="text-sm text-sand-600 font-medium">{loadingMsg}</p>
      </div>
    );
  }

  // Review screen
  return (
    <div className="page-enter pb-24">
      {/* Hero image */}
      {draft.photoUrl && (
        <div className="place-img-container h-48 rounded-none">
          <img src={draft.photoUrl} alt={draft.name} className="place-img"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <button onClick={() => setStep('search')}
            className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-sand-700 text-sm">
            ←
          </button>
        </div>
      )}

      <div className="px-6 pt-5">
        {!draft.photoUrl && (
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setStep('search')} className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-600 text-sm">←</button>
            <h2 className="text-lg font-semibold text-sand-900">Review & save</h2>
          </div>
        )}

        {/* Place name & travel info */}
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-sand-900">{draft.name}</h2>
          <p className="text-xs text-sand-500 mt-1">{draft.address?.split(',').slice(1, 3).join(',')}</p>
          {draft.travelTimeMinutes! > 0 && (
            <div className="flex items-center gap-3 mt-3">
              <span className="badge bg-sand-100 text-sand-700">
                {draft.transportMode === 'car' ? '🚗' : draft.transportMode === 'bike' ? '🚲' : draft.transportMode === 'transit' ? '🚆' : '🚶'} {draft.travelTimeMinutes} min
              </span>
              <span className="badge bg-sand-100 text-sand-700">📍 {draft.travelDistanceKm} km</span>
            </div>
          )}
        </div>

        {/* Fields */}
        <Section label="Category">
          <div className="toggle-group">
            {(Object.entries(CATEGORY_INFO) as [Category, { label: string; emoji: string }][]).map(([key, info]) => (
              <button key={key} className={`toggle-btn text-xs ${draft.category === key ? 'active' : ''}`}
                onClick={() => updateDraft({ category: key })}>{info.emoji} {info.label}</button>
            ))}
          </div>
        </Section>

        <Section label="Setting">
          <div className="toggle-group">
            {(['indoor', 'outdoor', 'mixed'] as Setting[]).map(s => (
              <button key={s} className={`toggle-btn ${draft.setting === s ? 'active' : ''}`}
                onClick={() => updateDraft({ setting: s })}>
                {s === 'indoor' ? '🏢 Indoor' : s === 'outdoor' ? '🌿 Outdoor' : '🔄 Mixed'}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Weather">
          <div className="toggle-group">
            {([['any', '🌤️ Any weather'], ['good_weather', '☀️ Good weather only'], ['bad_weather_ideal', '☔ Great for bad weather']] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${draft.weatherSuitability === val ? 'active' : ''}`}
                onClick={() => updateDraft({ weatherSuitability: val as WeatherSuitability })}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Duration">
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

        <Section label="Best season">
          <div className="toggle-group">
            {(Object.entries(SEASON_LABELS) as [Season, string][]).map(([key, label]) => (
              <button key={key} className={`toggle-btn ${draft.bestSeason === key ? 'active' : ''}`}
                onClick={() => updateDraft({ bestSeason: key })}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Best time of day">
          <div className="toggle-group">
            {([['any', 'Any time'], ['morning', '🌅 Morning'], ['afternoon', '☀️ Afternoon'], ['evening', '🌆 Evening']] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${draft.bestTimeOfDay === val ? 'active' : ''}`}
                onClick={() => updateDraft({ bestTimeOfDay: val as TimeOfDay })}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Good for">
          <div className="toggle-group">
            {([['solo', '👤 Solo'], ['couple', '👫 Couple'], ['friends', '👥 Friends'], ['family', '👨‍👩‍👧 Family'], ['kids', '👶 Kids']] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${(draft.groupSuitability || []).includes(val as GroupType) ? 'active' : ''}`}
                onClick={() => toggleGroupType(val as GroupType)}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Accessibility">
          <div className="toggle-group">
            <button className={`toggle-btn ${draft.dogFriendly === true ? 'active' : ''}`}
              onClick={() => updateDraft({ dogFriendly: draft.dogFriendly === true ? undefined : true })}>🐕 Dog-friendly</button>
            <button className={`toggle-btn ${draft.wheelchairAccessible === true ? 'active' : ''}`}
              onClick={() => updateDraft({ wheelchairAccessible: draft.wheelchairAccessible === true ? undefined : true })}>♿ Wheelchair</button>
            <button className={`toggle-btn ${draft.strollerFriendly === true ? 'active' : ''}`}
              onClick={() => updateDraft({ strollerFriendly: draft.strollerFriendly === true ? undefined : true })}>🍼 Stroller</button>
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
            className="w-full px-4 py-3 border border-sand-200 rounded-2xl text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 resize-none bg-white" />
        </Section>

        <button onClick={() => onSave(draft as BucketListItem)}
          className="w-full bg-sand-900 text-sand-100 py-4 rounded-2xl font-semibold text-base hover:bg-sand-800 transition mt-2 mb-4">
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
