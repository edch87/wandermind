import { useState, useRef, useCallback, useEffect } from 'react';
import type { UserProfile, BucketListItem, GroupType, EnergyLevel, Vibe, CostLevel, TransportMode, WeatherForecast, ScoredItem, Category, HereSearchResult } from '../types';
import { DURATION_LABELS, COST_LABELS, formatDuration } from '../types';
import { fetchWeatherForecast, calculateBatchTravelTimes } from '../utils/api';
import { getRecommendations, findCombos, viableModes } from '../utils/recommendation';
import { getOpeningHoursWarning } from '../utils/openingHours';
import { getDiscoverPlaces, toSearchResult, type DiscoverPlace } from '../utils/discover';
import { DiscoverCard } from './Discover';
import {
  Car, Bicycle, Footprints, Dog, Wheelchair, Baby, Warning,
  User, Heart, Users, House,
  Shuffle, Lightning, Fire, Leaf,
  ArrowsLeftRight, ForkKnife, Lightbulb, Tree, Confetti, Wind, Compass,
  Sun, CloudSun, CloudRain, Snowflake, Cloud,
  MagnifyingGlass,
} from '@phosphor-icons/react';

const TIME_SNAPS = [
  { min: 60, label: '1 hr' },
  { min: 120, label: '2 hrs' },
  { min: 180, label: '3 hrs' },
  { min: 240, label: 'Half day' },
  { min: Infinity, label: 'Full day' },
];

/** Walk auto-include cutoff for the UI batch fetch (must match recommendation.ts) */
const WALK_AUTO_CUTOFF_KM = 1.5;

const MODE_LABEL: Record<TransportMode, string> = {
  car: 'car', bike: 'bike', walk: 'walk', transit: 'transit',
};

function TimeRangeSlider({ range, onChange }: { range: [number, number]; onChange: (r: [number, number]) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'min' | 'max' | null>(null);
  const count = TIME_SNAPS.length;

  const indexFromX = useCallback((clientX: number): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(pct * (count - 1));
  }, [count]);

  const handlePointerDown = (thumb: 'min' | 'max') => (e: React.PointerEvent) => {
    dragging.current = thumb;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const idx = indexFromX(e.clientX);
    if (dragging.current === 'min') {
      onChange([Math.min(idx, range[1]), range[1]]);
    } else {
      onChange([range[0], Math.max(idx, range[0])]);
    }
  };

  const handlePointerUp = () => { dragging.current = null; };

  const leftPct = (range[0] / (count - 1)) * 100;
  const rightPct = (range[1] / (count - 1)) * 100;

  return (
    <div className="pt-2 pb-1">
      <div className="relative h-10 flex items-center" ref={trackRef}
        onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-sand-200" />
        {/* Active range */}
        <div className="absolute h-1.5 rounded-full bg-sand-900"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }} />
        {/* Snap dots */}
        {TIME_SNAPS.map((_, i) => (
          <div key={i} className={`absolute w-2 h-2 rounded-full -translate-x-1 ${
            i >= range[0] && i <= range[1] ? 'bg-sand-900' : 'bg-sand-300'
          }`} style={{ left: `${(i / (count - 1)) * 100}%` }} />
        ))}
        {/* Min thumb */}
        <div className="absolute w-7 h-7 rounded-full bg-white border-2 border-sand-900 shadow-md -translate-x-1/2 cursor-grab active:cursor-grabbing z-10 touch-none"
          style={{ left: `${leftPct}%` }}
          onPointerDown={handlePointerDown('min')} />
        {/* Max thumb */}
        <div className="absolute w-7 h-7 rounded-full bg-white border-2 border-sand-900 shadow-md -translate-x-1/2 cursor-grab active:cursor-grabbing z-10 touch-none"
          style={{ left: `${rightPct}%` }}
          onPointerDown={handlePointerDown('max')} />
      </div>
      {/* Labels */}
      <div className="relative h-5">
        {TIME_SNAPS.map((snap, i) => (
          <span key={i} className={`absolute text-[10px] -translate-x-1/2 ${
            i >= range[0] && i <= range[1] ? 'text-sand-900 font-medium' : 'text-sand-400'
          }`} style={{ left: `${(i / (count - 1)) * 100}%` }}>{snap.label}</span>
        ))}
      </div>
    </div>
  );
}

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onBack: () => void;
  onViewItem: (id: string) => void;
  onNavigate: (s: {
    name: string;
    initialPlace?: HereSearchResult;
    initialCategory?: Category;
  }) => void;
}

type Step = 'input' | 'loading' | 'results';

function getDateLabel(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() + offset);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

function getDateString(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function getWeekendOffsets(): { sat: number; sun: number } {
  const today = new Date().getDay();
  const satOffset = (6 - today + 7) % 7 || 7;
  return { sat: satOffset, sun: satOffset + 1 };
}

export default function RecommendationFlow({ profile, items, onBack, onViewItem, onNavigate }: Props) {
  const [step, setStep] = useState<Step>('input');
  const [discover, setDiscover] = useState<DiscoverPlace[]>([]);

  // Lazy-load the discover rail for the empty state — session-cached, so cheap.
  useEffect(() => {
    let cancelled = false;
    getDiscoverPlaces(profile, items).then(p => { if (!cancelled) setDiscover(p); });
    return () => { cancelled = true; };
  }, [profile, items]);
  const [dateOffset, setDateOffset] = useState(0);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 4]); // indices into TIME_SNAPS
  const [groupTypes, setGroupTypes] = useState<GroupType[]>(['solo']);
  const [energy, setEnergy] = useState<EnergyLevel>('surprise_me');
  const [vibes, setVibes] = useState<Vibe[]>(['flexible']);
  const [maxCost, setMaxCost] = useState<CostLevel>('expensive');
  const [transportModes, setTransportModes] = useState<TransportMode[]>([profile.preferredTransport || 'car']);
  const [dogComing, setDogComing] = useState(false);
  const [needsAccessibility, setNeedsAccessibility] = useState(false);
  const [strollerNeeded, setStrollerNeeded] = useState(false);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [results, setResults] = useState<ScoredItem[]>([]);
  const [combos, setCombos] = useState<ReturnType<typeof findCombos>>([]);
  const [loadingMsg, setLoadingMsg] = useState('');
  // Final constraints snapshot used to render results (so viableModes() matches what was scored).
  // The travelTimeOverrides field inside this snapshot also serves as the per-item per-mode display source.
  const [resultConstraints, setResultConstraints] = useState<Parameters<typeof viableModes>[1] | null>(null);

  const toggleGroup = (g: GroupType) => setGroupTypes(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  const toggleTransport = (m: TransportMode) => setTransportModes(prev =>
    prev.includes(m) ? (prev.length > 1 ? prev.filter(x => x !== m) : prev) : [...prev, m]
  );
  const toggleVibe = (v: Vibe) => {
    if (v === 'flexible') {
      setVibes(['flexible']);
    } else {
      setVibes(prev => {
        const without = prev.filter(x => x !== 'flexible' && x !== v);
        const toggled = prev.includes(v) ? without : [...without, v];
        return toggled.length === 0 ? ['flexible'] : toggled;
      });
    }
  };

  const handleGetRecommendations = async () => {
    setStep('loading');

    // Fetch weather
    setLoadingMsg('Checking the weather...');
    const forecasts = await fetchWeatherForecast(profile.homeLatitude, profile.homeLongitude);
    const targetDate = getDateString(dateOffset);
    const dayWeather = forecasts.find(f => f.date === targetDate) || forecasts[0] || null;
    setWeather(dayWeather);

    // Decide which modes to compute travel times for.
    // Always include the user's selected modes; auto-include walk for any item under 1.5 km.
    const candidates = items.filter(i => i.status === 'want_to_do');
    const modesToCompute: TransportMode[] = [...transportModes];
    const needsWalk = candidates.some(i => i.travelDistanceKm <= WALK_AUTO_CUTOFF_KM);
    if (needsWalk && !modesToCompute.includes('walk')) modesToCompute.push('walk');

    setLoadingMsg('Calculating travel times...');
    const overrides: Record<string, Partial<Record<TransportMode, number>>> = {};
    for (const mode of modesToCompute) {
      // For walk, only route items under the cutoff to keep API calls down
      const itemsForMode = mode === 'walk'
        ? candidates.filter(i => i.travelDistanceKm <= WALK_AUTO_CUTOFF_KM)
        : candidates;
      const batch = itemsForMode.map(i => ({ id: i.id, latitude: i.latitude, longitude: i.longitude }));
      const travelTimes = await calculateBatchTravelTimes(
        profile.homeLatitude, profile.homeLongitude, batch, mode
      );
      for (const [id, travel] of Object.entries(travelTimes)) {
        if (!overrides[id]) overrides[id] = {};
        overrides[id][mode] = travel.durationMinutes;
      }
    }

    setLoadingMsg('Finding your best options...');
    const timeMax = TIME_SNAPS[timeRange[1]].min; // may be Infinity for Full day
    const timeMin = TIME_SNAPS[timeRange[0]].min;
    const finalConstraints = {
      date: targetDate,
      timeAvailableMinutes: timeMax,
      timeMinMinutes: isFinite(timeMin) ? timeMin : undefined,
      groupTypes,
      energy,
      vibes,
      maxCostLevel: maxCost,
      travelFrom: 'home' as const,
      transportModes,
      dogComing,
      needsAccessibility,
      strollerNeeded,
      travelTimeOverrides: overrides,
    };
    const scored = getRecommendations(items, finalConstraints, dayWeather);
    setResults(scored);
    setCombos(findCombos(scored, timeMax, finalConstraints));
    setResultConstraints(finalConstraints);
    setStep('results');
  };

  // Past 22:00 today → suggest switching to tomorrow
  const now = new Date();
  const isTodayLate = dateOffset === 0 && now.getHours() >= 22;

  const weekend = getWeekendOffsets();

  const transportOptions: { mode: TransportMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'car', icon: <Car size={14} />, label: 'Car' },
    { mode: 'bike', icon: <Bicycle size={14} />, label: 'Bike' },
    { mode: 'walk', icon: <Footprints size={14} />, label: 'Walk' },
  ];

  if (step === 'input') {
    return (
      <div className="page-enter px-6 py-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-600 text-sm">←</button>
          <h2 className="text-xl font-semibold text-sand-900">What <span className="heading-accent">fits</span> right now?</h2>
        </div>

        <Section label="When?">
          <div className="toggle-group">
            {[{ offset: 0, label: 'Today' }, { offset: 1, label: 'Tomorrow' },
              { offset: weekend.sat, label: 'Saturday' }, { offset: weekend.sun, label: 'Sunday' }]
              .map(({ offset, label }) => (
              <button key={offset} className={`toggle-btn ${dateOffset === offset ? 'active' : ''}`}
                onClick={() => setDateOffset(offset)}>{label}</button>
            ))}
          </div>
          {isTodayLate && (
            <p className="text-[11px] text-terra-600 mt-2">It's late — try Tomorrow for more options.</p>
          )}
        </Section>

        <Section label="How are you getting there?">
          <div className="toggle-group">
            {transportOptions.map(({ mode, icon, label }) => (
              <button key={mode} className={`toggle-btn ${transportModes.includes(mode) ? 'active' : ''}`}
                onClick={() => toggleTransport(mode)}>
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-sand-600 mt-1">Pick one or more. We'll show whichever fits each place best.</p>
        </Section>

        <Section label="How much time do you have?">
          <TimeRangeSlider range={timeRange} onChange={setTimeRange} />
          <p className="text-[10px] text-sand-600 mt-1">Total time door to door — includes travel both ways. Full day has no upper limit.</p>
        </Section>

        <Section label="Who's coming?">
          <div className="toggle-group">
            {([
              { val: 'solo' as GroupType, icon: <User size={14} />, label: 'Solo' },
              { val: 'couple' as GroupType, icon: <Heart size={14} />, label: 'Partner' },
              { val: 'friends' as GroupType, icon: <Users size={14} />, label: 'Friends' },
              { val: 'family' as GroupType, icon: <House size={14} />, label: 'Family' },
              { val: 'kids' as GroupType, icon: <Baby size={14} />, label: 'Kids' },
            ]).map(({ val, icon, label }) => (
              <button key={val} className={`toggle-btn ${groupTypes.includes(val) ? 'active' : ''}`}
                onClick={() => toggleGroup(val)}>
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="How much energy do you have?">
          <div className="toggle-group">
            {([
              { val: 'surprise_me' as EnergyLevel, icon: <Shuffle size={14} />, label: 'Surprise me' },
              { val: 'up_for_anything' as EnergyLevel, icon: <Lightning size={14} />, label: 'Up for anything' },
              { val: 'got_some_energy' as EnergyLevel, icon: <Fire size={14} />, label: 'Got some energy' },
              { val: 'keep_it_easy' as EnergyLevel, icon: <Leaf size={14} />, label: 'Keep it easy' },
            ]).map(({ val, icon, label }) => (
              <button key={val} className={`toggle-btn ${energy === val ? 'active' : ''}`}
                onClick={() => setEnergy(val)}>
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="What's your vibe?">
          <div className="toggle-group">
            {([
              { val: 'flexible' as Vibe, icon: <ArrowsLeftRight size={14} />, label: 'Open to anything' },
              { val: 'foodie' as Vibe, icon: <ForkKnife size={14} />, label: 'Foodie' },
              { val: 'curious' as Vibe, icon: <Lightbulb size={14} />, label: 'Curious' },
              { val: 'outdoorsy' as Vibe, icon: <Tree size={14} />, label: 'Outdoorsy' },
              { val: 'playful' as Vibe, icon: <Confetti size={14} />, label: 'Playful' },
              { val: 'unwind' as Vibe, icon: <Wind size={14} />, label: 'Unwind' },
              { val: 'explore' as Vibe, icon: <Compass size={14} />, label: 'Explore' },
            ]).map(({ val, icon, label }) => (
              <button key={val} className={`toggle-btn ${vibes.includes(val) ? 'active' : ''}`}
                onClick={() => toggleVibe(val)}>
                <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-sand-600 mt-1">Pick one or more to filter, or stay open to anything</p>
        </Section>

        <Section label="Max budget?">
          <div className="toggle-group">
            {([['free','Free only'],['cheap','Under €10'],['moderate','Under €25'],['expensive','Any budget']] as const)
              .map(([val, label]) => (
              <button key={val} className={`toggle-btn ${maxCost === val ? 'active' : ''}`}
                onClick={() => setMaxCost(val as CostLevel)}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Anything else?">
          <div className="toggle-group">
            <button className={`toggle-btn ${dogComing ? 'active' : ''}`}
              onClick={() => setDogComing(!dogComing)}>
              <span className="inline-flex items-center gap-1.5"><Dog size={14} /> Bringing dog</span>
            </button>
            <button className={`toggle-btn ${strollerNeeded ? 'active' : ''}`}
              onClick={() => setStrollerNeeded(!strollerNeeded)}>
              <span className="inline-flex items-center gap-1.5"><Baby size={14} /> Need stroller access</span>
            </button>
            <button className={`toggle-btn ${needsAccessibility ? 'active' : ''}`}
              onClick={() => setNeedsAccessibility(!needsAccessibility)}>
              <span className="inline-flex items-center gap-1.5"><Wheelchair size={14} /> Wheelchair access</span>
            </button>
          </div>
        </Section>

        <button onClick={handleGetRecommendations}
          className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-base hover:bg-sand-800 transition mt-4">
          Find recommendations
        </button>
      </div>
    );
  }

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

  const top3 = results.slice(0, 3);
  const labels = ['Top pick', 'Also great', 'Consider'];

  return (
    <div className="page-enter px-6 py-6 pb-24">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setStep('input')} className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-600 text-sm">←</button>
        <h2 className="text-xl font-semibold text-sand-900">Your <span className="heading-accent">recommendations</span></h2>
      </div>

      {weather && (
        <div className="bg-sand-100 rounded-[20px] p-4 mb-5 flex items-center gap-3">
          <span className="flex-shrink-0">
            {weather.weatherType === 'sunny' ? <Sun size={24} weight="fill" className="text-amber-400" /> :
             weather.weatherType === 'cloudy' ? <CloudSun size={24} className="text-sand-500" /> :
             weather.weatherType === 'rainy' ? <CloudRain size={24} className="text-blue-400" /> :
             weather.weatherType === 'snowy' ? <Snowflake size={24} className="text-blue-300" /> :
             <Cloud size={24} className="text-sand-400" />}
          </span>
          <div>
            <p className="text-sm font-medium text-sand-900">{getDateLabel(dateOffset)}: {weather.description}</p>
            <p className="text-xs text-sand-700">{weather.tempMin}°C – {weather.tempMax}°C
              {weather.precipitation > 0 && ` · ${weather.precipitation}mm rain`}</p>
          </div>
        </div>
      )}

      {top3.length === 0 ? (
        <>
          <div className="text-center py-12">
            <div className="flex justify-center mb-3"><MagnifyingGlass size={32} className="text-sand-300" /></div>
            <p className="text-sm text-sand-600 mb-2">No matches for these filters.</p>
            <p className="text-xs text-sand-600 mb-4">Try widening your time or budget, or add more places.</p>
            <button onClick={() => setStep('input')}
              className="px-6 py-2.5 bg-sand-900 text-sand-100 rounded-full text-sm font-medium">Adjust filters</button>
          </div>

          {discover.length > 0 && (
            <div className="-mx-6">
              <div className="px-6 flex items-baseline justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-sand-900">Need more ideas?</h3>
                  <p className="text-[11px] text-sand-600">Nearby places to add to your list</p>
                </div>
                <button onClick={() => onNavigate({ name: 'discover' })}
                  className="text-xs text-sand-600 hover:text-sand-900 transition">
                  See all
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto px-6 pb-2 scrollbar-hide">
                {discover.slice(0, 10).map(p => (
                  <div key={p.key} className="flex-shrink-0 w-40">
                    <DiscoverCard place={p}
                      onAdd={() => onNavigate({ name: 'add', initialPlace: toSearchResult(p), initialCategory: p.category })} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {top3.map((scored, idx) => {
            const { item, reasons } = scored;
            const modeOptions = resultConstraints
              ? viableModes(item, resultConstraints).slice(0, 2)
              : [{ mode: (transportModes[0] || 'car') as TransportMode, minutes: item.travelTimeMinutes }];
            const travelLabel = modeOptions
              .map(m => `${formatDuration(m.minutes)} by ${MODE_LABEL[m.mode]}`)
              .join(' or ');
            const targetDate = getDateString(dateOffset);
            const hoursWarning = getOpeningHoursWarning(item.openingHours, targetDate);
            const nonHoursReasons = reasons.filter(r => !r.startsWith('Closed') && !r.startsWith('May be closed') && !r.startsWith('Only open') && !r.startsWith('Closes at') && !r.startsWith('Open until') && !r.startsWith('Opens at'));
            return (
              <div key={item.id} className="card overflow-hidden">
                {item.photoUrl && (
                  <div className="place-img-container h-36">
                    <img src={item.photoUrl} alt={item.name} className="place-img"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute top-3 left-3 z-10">
                      <span className={`badge text-white text-[10px] ${idx === 0 ? 'bg-terra-500' : 'bg-sand-900/70'}`}>
                        {labels[idx]}
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-4">
                  {!item.photoUrl && (
                    <span className={`badge text-white text-[10px] mb-2 ${idx === 0 ? 'bg-terra-500' : 'bg-sand-500'}`}>
                      {labels[idx]}
                    </span>
                  )}
                  <h3 className="font-semibold text-sand-900 text-base">{item.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="badge bg-sand-100 text-sand-700">{travelLabel}</span>
                    <span className="badge bg-sand-100 text-sand-700">{DURATION_LABELS[item.durationEstimate]}</span>
                    <span className="badge bg-sand-100 text-sand-700">{COST_LABELS[item.costLevel]}</span>
                  </div>
                  {hoursWarning && (
                    <div className={`flex items-center gap-2 mt-2.5 text-xs px-3 py-2 rounded-[12px] ${
                      hoursWarning.startsWith('Closed') || hoursWarning.startsWith('May be closed')
                        ? 'bg-terra-500/10 text-terra-600' : 'bg-amber-50 text-amber-700'
                    }`}>
                      <Warning size={13} className="flex-shrink-0" />
                      <span>{hoursWarning}</span>
                    </div>
                  )}
                  {nonHoursReasons.length > 0 && (
                    <p className="text-xs text-sand-600 mt-3 bg-sand-50 rounded-[12px] p-3 border border-sand-100">
                      {nonHoursReasons.slice(0, 3).join(' · ')}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => onViewItem(item.id)}
                      className="flex-1 py-2.5 rounded-full bg-sand-100 text-sand-700 text-xs font-medium border border-sand-200">Details</button>
                    <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`, '_blank')}
                      className="flex-1 py-2.5 rounded-full bg-sand-900 text-sand-100 text-xs font-medium">Let's go!</button>
                  </div>
                </div>
              </div>
            );
          })}
          {combos.length > 0 && (
            <div className="bg-sand-100 rounded-[20px] border border-sand-200 p-4">
              <span className="badge bg-sand-900 text-sand-100 text-[10px] mb-2">Combo suggestion</span>
              <p className="text-sm text-sand-800">
                <strong>{combos[0].itemA.name}</strong> → {combos[0].walkingMinutes} min walk → <strong>{combos[0].itemB.name}</strong>
              </p>
            </div>
          )}
        </div>
      )}
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
