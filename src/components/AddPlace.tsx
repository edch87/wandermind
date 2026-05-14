import { useState, useRef } from 'react';
import { searchPlaces, fetchOsmTags, calculateTravelTime } from '../utils/api';
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

  // Review fields
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

    setLoadingMsg('Fetching place details...');
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    // Fetch OSM tags
    let tags: Record<string, string> = {};
    if (result.osm_id) {
      setLoadingMsg('Analysing this place...');
      tags = await fetchOsmTags(result.osm_type, result.osm_id);
    }

    // Calculate travel time
    setLoadingMsg('Calculating travel time...');
    const travel = await calculateTravelTime(
      profile.homeLatitude, profile.homeLongitude,
      lat, lng, profile.preferredTransport
    );

    // Run inference engine
    setLoadingMsg('Auto-categorising...');
    const inferred = inferDefaults(tags);

    const address = result.display_name;
    const parts = address.split(',').map(s => s.trim());

    setDraft({
      id: generateId(),
      status: 'want_to_do',
      createdAt: new Date().toISOString(),
      name: parts[0] || result.display_name,
      description: '',
      latitude: lat,
      longitude: lng,
      osmId: `${result.osm_type}/${result.osm_id}`,
      osmTags: tags,
      address: result.display_name,
      country: result.address?.country || '',
      region: result.address?.state || '',
      city: result.address?.city || result.address?.town || '',
      openingHours: tags['opening_hours'] || undefined,
      travelTimeMinutes: travel.durationMinutes,
      travelDistanceKm: travel.distanceKm,
      transportMode: profile.preferredTransport,
      category: inferred.category,
      setting: inferred.setting,
      weatherSuitability: inferred.weatherSuitability,
      durationEstimate: inferred.durationEstimate,
      costLevel: inferred.costLevel,
      bestSeason: inferred.bestSeason,
      bestTimeOfDay: inferred.bestTimeOfDay,
      groupSuitability: inferred.groupSuitability,
      dogFriendly: inferred.dogFriendly,
      wheelchairAccessible: inferred.wheelchairAccessible,
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
    if (current.includes(g)) {
      updateDraft({ groupSuitability: current.filter(x => x !== g) });
    } else {
      updateDraft({ groupSuitability: [...current, g] });
    }
  };

  const handleSave = () => {
    onSave(draft as BucketListItem);
  };

  // Search screen
  if (step === 'search') {
    return (
      <div className="px-5 py-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
          <h2 className="text-xl font-bold text-gray-900">Add a place</h2>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search for a place..."
          autoFocus
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 mb-3"
        />

        {searching && <p className="text-sm text-gray-400 mb-2">Searching...</p>}

        <div className="space-y-1">
          {results.map((r) => (
            <button
              key={r.place_id}
              onClick={() => selectPlace(r)}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-teal-50 transition"
            >
              <div className="text-sm font-medium text-gray-900">{r.display_name.split(',')[0]}</div>
              <div className="text-xs text-gray-500 mt-0.5">{r.display_name.split(',').slice(1, 3).join(',')}</div>
            </button>
          ))}
        </div>

        {!searching && results.length === 0 && query.length >= 3 && (
          <p className="text-sm text-gray-400 mt-4 text-center">No results found. Try a different search.</p>
        )}
      </div>
    );
  }

  // Loading screen
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-4xl mb-4 animate-pulse">✨</div>
        <p className="text-sm text-gray-500">{loadingMsg}</p>
      </div>
    );
  }

  // Review & Edit screen
  const catInfo = CATEGORY_INFO[draft.category as Category];
  return (
    <div className="px-5 py-6 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setStep('search')} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
        <h2 className="text-xl font-bold text-gray-900">Review & save</h2>
      </div>

      {/* Place header */}
      <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-2xl p-5 mb-5">
        <div className="text-3xl mb-2">{catInfo?.emoji || '📍'}</div>
        <h3 className="text-lg font-bold text-gray-900">{draft.name}</h3>
        <p className="text-xs text-gray-500 mt-1">{draft.address?.split(',').slice(1, 3).join(',')}</p>
        {draft.travelTimeMinutes! > 0 && (
          <div className="flex items-center gap-2 mt-3 text-sm text-teal-700">
            <span>{draft.transportMode === 'car' ? '🚗' : draft.transportMode === 'bike' ? '🚲' : draft.transportMode === 'transit' ? '🚆' : '🚶'}</span>
            <span>{draft.travelTimeMinutes} min</span>
            <span className="text-gray-400">·</span>
            <span>{draft.travelDistanceKm} km from home</span>
          </div>
        )}
        {draft.openingHours && (
          <div className="text-xs text-gray-500 mt-2">🕐 {draft.openingHours}</div>
        )}
      </div>

      {/* Category */}
      <Section label="Category">
        <div className="toggle-group">
          {(Object.entries(CATEGORY_INFO) as [Category, typeof catInfo][]).map(([key, info]) => (
            <button
              key={key}
              className={`toggle-btn text-xs ${draft.category === key ? 'active' : ''}`}
              onClick={() => updateDraft({ category: key })}
            >
              {info.emoji} {info.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Setting */}
      <Section label="Setting">
        <div className="toggle-group">
          {(['indoor', 'outdoor', 'mixed'] as Setting[]).map(s => (
            <button key={s} className={`toggle-btn ${draft.setting === s ? 'active' : ''}`}
              onClick={() => updateDraft({ setting: s })}>
              {s === 'indoor' ? '🏢' : s === 'outdoor' ? '🌿' : '🔄'} {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      {/* Weather */}
      <Section label="Weather suitability">
        <div className="toggle-group">
          {([['any', '🌤️ Any weather'], ['good_weather', '☀️ Good weather'], ['bad_weather_ideal', '☔ Great for bad weather']] as const).map(([val, label]) => (
            <button key={val} className={`toggle-btn ${draft.weatherSuitability === val ? 'active' : ''}`}
              onClick={() => updateDraft({ weatherSuitability: val as WeatherSuitability })}>
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Duration */}
      <Section label="Duration">
        <div className="toggle-group">
          {(Object.entries(DURATION_LABELS) as [DurationEstimate, string][]).map(([key, label]) => (
            <button key={key} className={`toggle-btn ${draft.durationEstimate === key ? 'active' : ''}`}
              onClick={() => updateDraft({ durationEstimate: key })}>
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Cost */}
      <Section label="Cost">
        <div className="toggle-group">
          {(Object.entries(COST_LABELS) as [CostLevel, string][]).map(([key, label]) => (
            <button key={key} className={`toggle-btn ${draft.costLevel === key ? 'active' : ''}`}
              onClick={() => updateDraft({ costLevel: key })}>
              {key === 'free' ? '🆓' : key === 'cheap' ? '💰' : key === 'moderate' ? '💰💰' : '💰💰💰'} {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Season */}
      <Section label="Best season">
        <div className="toggle-group">
          {(Object.entries(SEASON_LABELS) as [Season, string][]).map(([key, label]) => (
            <button key={key} className={`toggle-btn ${draft.bestSeason === key ? 'active' : ''}`}
              onClick={() => updateDraft({ bestSeason: key })}>
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Time of day */}
      <Section label="Best time of day">
        <div className="toggle-group">
          {([['any', '🕐 Any'], ['morning', '🌅 Morning'], ['afternoon', '☀️ Afternoon'], ['evening', '🌆 Evening']] as const).map(([val, label]) => (
            <button key={val} className={`toggle-btn ${draft.bestTimeOfDay === val ? 'active' : ''}`}
              onClick={() => updateDraft({ bestTimeOfDay: val as TimeOfDay })}>
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Group */}
      <Section label="Good for">
        <div className="toggle-group">
          {([['solo', '👤 Solo'], ['couple', '👫 Couple'], ['friends', '👥 Friends'], ['family', '👨‍👩‍👧 Family'], ['kids', '👶 Kids']] as const).map(([val, label]) => (
            <button key={val}
              className={`toggle-btn ${(draft.groupSuitability || []).includes(val as GroupType) ? 'active' : ''}`}
              onClick={() => toggleGroupType(val as GroupType)}>
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Accessibility */}
      <Section label="Accessibility">
        <div className="toggle-group">
          <button className={`toggle-btn ${draft.dogFriendly === true ? 'active' : ''}`}
            onClick={() => updateDraft({ dogFriendly: draft.dogFriendly === true ? undefined : true })}>
            🐕 Dog-friendly
          </button>
          <button className={`toggle-btn ${draft.wheelchairAccessible === true ? 'active' : ''}`}
            onClick={() => updateDraft({ wheelchairAccessible: draft.wheelchairAccessible === true ? undefined : true })}>
            ♿ Wheelchair
          </button>
          <button className={`toggle-btn ${draft.strollerFriendly === true ? 'active' : ''}`}
            onClick={() => updateDraft({ strollerFriendly: draft.strollerFriendly === true ? undefined : true })}>
            🍼 Stroller
          </button>
        </div>
      </Section>

      {/* Priority */}
      <Section label="Priority">
        <div className="toggle-group">
          {([['low', '⭐'], ['medium', '⭐⭐'], ['high', '⭐⭐⭐']] as const).map(([val, label]) => (
            <button key={val} className={`toggle-btn ${draft.priority === val ? 'active' : ''}`}
              onClick={() => updateDraft({ priority: val as Priority })}>
              {label} {val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      {/* Notes */}
      <Section label="Personal notes">
        <textarea
          value={draft.personalNotes || ''}
          onChange={(e) => updateDraft({ personalNotes: e.target.value })}
          placeholder="Any notes about this place..."
          rows={2}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 resize-none"
        />
      </Section>

      {/* Save button */}
      <button
        onClick={handleSave}
        className="w-full bg-teal-500 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-teal-600 transition mt-4"
      >
        Save to bucket list
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      {children}
    </div>
  );
}
