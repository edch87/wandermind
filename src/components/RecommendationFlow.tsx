import { useState } from 'react';
import type { UserProfile, BucketListItem, GroupType, Mood, CostLevel, WeatherForecast, ScoredItem } from '../types';
import { CATEGORY_INFO, DURATION_LABELS, COST_LABELS } from '../types';
import { fetchWeatherForecast } from '../utils/api';
import { getRecommendations, findCombos } from '../utils/recommendation';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onBack: () => void;
  onViewItem: (id: string) => void;
}

type Step = 'input' | 'loading' | 'results';

function getDateLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return days[d.getDay()];
}

function getDateString(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

// Find next Saturday/Sunday offsets
function getWeekendOffsets(): { sat: number; sun: number } {
  const today = new Date().getDay();
  const satOffset = (6 - today + 7) % 7 || 7;
  return { sat: satOffset, sun: satOffset + 1 };
}

export default function RecommendationFlow({ profile, items, onBack, onViewItem }: Props) {
  const [step, setStep] = useState<Step>('input');

  // Constraints
  const [dateOffset, setDateOffset] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(180);
  const [groupTypes, setGroupTypes] = useState<GroupType[]>(['solo']);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [maxCost, setMaxCost] = useState<CostLevel>('expensive');
  const [dogComing, setDogComing] = useState(false);

  // Results
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [results, setResults] = useState<ScoredItem[]>([]);
  const [combos, setCombos] = useState<ReturnType<typeof findCombos>>([]);

  const toggleGroup = (g: GroupType) => {
    setGroupTypes(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const toggleMood = (m: Mood) => {
    setMoods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const handleGetRecommendations = async () => {
    setStep('loading');

    // Fetch weather
    const forecasts = await fetchWeatherForecast(profile.homeLatitude, profile.homeLongitude);
    const targetDate = getDateString(dateOffset);
    const dayWeather = forecasts.find(f => f.date === targetDate) || forecasts[0] || null;
    setWeather(dayWeather);

    // Run recommendation engine
    const scored = getRecommendations(items, {
      date: targetDate,
      timeAvailableMinutes: timeMinutes,
      groupTypes,
      moods,
      maxCostLevel: maxCost,
      travelFrom: 'home',
      dogComing,
    }, dayWeather);

    setResults(scored);

    // Find combos
    const comboResults = findCombos(scored, timeMinutes);
    setCombos(comboResults);

    setStep('results');
  };

  const weekend = getWeekendOffsets();

  // Input screen
  if (step === 'input') {
    return (
      <div className="px-5 py-6 pb-24">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
          <h2 className="text-xl font-bold text-gray-900">What fits right now?</h2>
        </div>

        {/* When */}
        <Section label="When?">
          <div className="toggle-group">
            {[
              { offset: 0, label: 'Today' },
              { offset: 1, label: 'Tomorrow' },
              { offset: weekend.sat, label: 'Saturday' },
              { offset: weekend.sun, label: 'Sunday' },
            ].map(({ offset, label }) => (
              <button key={offset} className={`toggle-btn ${dateOffset === offset ? 'active' : ''}`}
                onClick={() => setDateOffset(offset)}>
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Time */}
        <Section label="How much time do you have?">
          <div className="toggle-group">
            {[
              { min: 60, label: '1 hour' },
              { min: 120, label: '2 hours' },
              { min: 180, label: '3 hours' },
              { min: 240, label: 'Half day' },
              { min: 480, label: 'Full day' },
            ].map(({ min, label }) => (
              <button key={min} className={`toggle-btn ${timeMinutes === min ? 'active' : ''}`}
                onClick={() => setTimeMinutes(min)}>
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Group */}
        <Section label="Who's coming?">
          <div className="toggle-group">
            {([
              ['solo', '👤 Solo'], ['couple', '👫 With partner'], ['friends', '👥 With friends'],
              ['family', '👨‍👩‍👧 Family'], ['kids', '👶 With kids'],
            ] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${groupTypes.includes(val) ? 'active' : ''}`}
                onClick={() => toggleGroup(val)}>
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Mood */}
        <Section label="How are you feeling?">
          <div className="toggle-group">
            {([
              ['adventurous', '🏔️ Adventurous'],
              ['cultural', '🎨 Cultural'],
              ['relaxed', '🧘 Relaxed'],
              ['fun', '🎢 Fun'],
            ] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${moods.includes(val) ? 'active' : ''}`}
                onClick={() => toggleMood(val)}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">Select multiple or skip to see all</p>
        </Section>

        {/* Budget */}
        <Section label="Max budget?">
          <div className="toggle-group">
            {([
              ['free', '🆓 Free only'],
              ['cheap', '💰 Under €10'],
              ['moderate', '💰💰 Under €25'],
              ['expensive', '💎 Any budget'],
            ] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${maxCost === val ? 'active' : ''}`}
                onClick={() => setMaxCost(val as CostLevel)}>
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Dog */}
        {profile.hasDog && (
          <Section label="Bringing the dog?">
            <div className="toggle-group">
              <button className={`toggle-btn ${!dogComing ? 'active' : ''}`} onClick={() => setDogComing(false)}>No</button>
              <button className={`toggle-btn ${dogComing ? 'active' : ''}`} onClick={() => setDogComing(true)}>🐕 Yes</button>
            </div>
          </Section>
        )}

        <button onClick={handleGetRecommendations}
          className="w-full bg-teal-500 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-teal-600 transition mt-4">
          Find recommendations
        </button>
      </div>
    );
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-4xl mb-4 animate-pulse">🌤️</div>
        <p className="text-sm text-gray-500">Checking the weather & finding your best options...</p>
      </div>
    );
  }

  // Results
  const top3 = results.slice(0, 3);
  const labels = ['🏆 Top Pick', '🥈 Also Great', '🥉 Consider'];

  return (
    <div className="px-5 py-6 pb-24">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setStep('input')} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
        <h2 className="text-xl font-bold text-gray-900">Recommendations</h2>
      </div>

      {/* Weather banner */}
      {weather && (
        <div className="bg-blue-50 rounded-xl p-4 mb-5 flex items-center gap-3">
          <span className="text-2xl">
            {weather.weatherType === 'sunny' ? '☀️' : weather.weatherType === 'cloudy' ? '⛅' :
             weather.weatherType === 'rainy' ? '🌧️' : weather.weatherType === 'snowy' ? '❄️' : '🌫️'}
          </span>
          <div>
            <div className="text-sm font-medium text-gray-800">
              {getDateLabel(dateOffset)}: {weather.description}
            </div>
            <div className="text-xs text-gray-500">
              {weather.tempMin}°C - {weather.tempMax}°C
              {weather.precipitation > 0 && ` · ${weather.precipitation}mm rain`}
            </div>
          </div>
        </div>
      )}

      {top3.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🤔</div>
          <p className="text-sm text-gray-500 mb-2">No matches for these filters.</p>
          <p className="text-xs text-gray-400">Try widening your time or budget, or add more places to your list!</p>
          <button onClick={() => setStep('input')}
            className="mt-4 px-6 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium">
            Adjust filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {top3.map((scored, idx) => {
            const { item, reasons } = scored;
            const cat = CATEGORY_INFO[item.category];
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 pt-4 pb-1">
                  <span className="text-xs font-bold text-teal-600">{labels[idx]}</span>
                </div>
                <div className="px-5 pb-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ backgroundColor: cat.color + '15' }}>
                      {cat.emoji}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{item.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>🚗 {item.travelTimeMinutes} min</span>
                        <span>·</span>
                        <span>{DURATION_LABELS[item.durationEstimate]}</span>
                        <span>·</span>
                        <span>{COST_LABELS[item.costLevel]}</span>
                      </div>
                    </div>
                  </div>
                  {reasons.length > 0 && (
                    <div className="bg-teal-50 rounded-lg p-3 text-xs text-teal-700">
                      {reasons.slice(0, 3).join(' · ')}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => onViewItem(item.id)}
                      className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                      View details
                    </button>
                    <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`, '_blank')}
                      className="flex-1 py-2 rounded-lg bg-teal-500 text-white text-xs font-medium">
                      Let's go!
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Combo suggestion */}
          {combos.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
              <span className="text-xs font-bold text-amber-600">🔗 Combo suggestion</span>
              <p className="text-sm text-gray-700 mt-2">
                Do both! <strong>{combos[0].itemA.name}</strong> → {combos[0].walkingMinutes} min walk → <strong>{combos[0].itemB.name}</strong>
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
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      {children}
    </div>
  );
}
