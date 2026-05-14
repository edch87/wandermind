import { useState } from 'react';
import type { UserProfile, BucketListItem, GroupType, Mood, CostLevel, WeatherForecast, ScoredItem } from '../types';
import { DURATION_LABELS, COST_LABELS } from '../types';
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

export default function RecommendationFlow({ profile, items, onBack, onViewItem }: Props) {
  const [step, setStep] = useState<Step>('input');
  const [dateOffset, setDateOffset] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(180);
  const [groupTypes, setGroupTypes] = useState<GroupType[]>(['solo']);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [maxCost, setMaxCost] = useState<CostLevel>('expensive');
  const [dogComing, setDogComing] = useState(false);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [results, setResults] = useState<ScoredItem[]>([]);
  const [combos, setCombos] = useState<ReturnType<typeof findCombos>>([]);

  const toggleGroup = (g: GroupType) => setGroupTypes(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  const toggleMood = (m: Mood) => setMoods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const handleGetRecommendations = async () => {
    setStep('loading');
    const forecasts = await fetchWeatherForecast(profile.homeLatitude, profile.homeLongitude);
    const targetDate = getDateString(dateOffset);
    const dayWeather = forecasts.find(f => f.date === targetDate) || forecasts[0] || null;
    setWeather(dayWeather);
    const scored = getRecommendations(items, { date: targetDate, timeAvailableMinutes: timeMinutes,
      groupTypes, moods, maxCostLevel: maxCost, travelFrom: 'home', dogComing }, dayWeather);
    setResults(scored);
    setCombos(findCombos(scored, timeMinutes));
    setStep('results');
  };

  const weekend = getWeekendOffsets();

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
        </Section>

        <Section label="How much time?">
          <div className="toggle-group">
            {[{ min: 60, label: '1 hour' }, { min: 120, label: '2 hours' }, { min: 180, label: '3 hours' },
              { min: 240, label: 'Half day' }, { min: 480, label: 'Full day' }].map(({ min, label }) => (
              <button key={min} className={`toggle-btn ${timeMinutes === min ? 'active' : ''}`}
                onClick={() => setTimeMinutes(min)}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="Who's coming?">
          <div className="toggle-group">
            {([['solo','👤 Solo'],['couple','👫 Partner'],['friends','👥 Friends'],['family','👨‍👩‍👧 Family'],['kids','👶 Kids']] as const)
              .map(([val, label]) => (
              <button key={val} className={`toggle-btn ${groupTypes.includes(val) ? 'active' : ''}`}
                onClick={() => toggleGroup(val)}>{label}</button>
            ))}
          </div>
        </Section>

        <Section label="How are you feeling?">
          <div className="toggle-group">
            {([['adventurous','🏔️ Adventurous'],['cultural','🎨 Cultural'],['relaxed','🧘 Relaxed'],['fun','🎢 Fun']] as const)
              .map(([val, label]) => (
              <button key={val} className={`toggle-btn ${moods.includes(val) ? 'active' : ''}`}
                onClick={() => toggleMood(val)}>{label}</button>
            ))}
          </div>
          <p className="text-[10px] text-sand-400 mt-1">Select multiple or skip for all</p>
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

        {profile.hasDog && (
          <Section label="Bringing the dog?">
            <div className="toggle-group">
              <button className={`toggle-btn ${!dogComing ? 'active' : ''}`} onClick={() => setDogComing(false)}>No</button>
              <button className={`toggle-btn ${dogComing ? 'active' : ''}`} onClick={() => setDogComing(true)}>🐕 Yes</button>
            </div>
          </Section>
        )}

        <button onClick={handleGetRecommendations}
          className="w-full bg-sand-900 text-sand-100 py-4 rounded-2xl font-semibold text-base hover:bg-sand-800 transition mt-4">
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
        <p className="text-sm text-sand-600 font-medium">Checking the weather...</p>
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
        <div className="bg-sand-100 rounded-2xl p-4 mb-5 flex items-center gap-3">
          <span className="text-2xl">
            {weather.weatherType === 'sunny' ? '☀️' : weather.weatherType === 'cloudy' ? '⛅' :
             weather.weatherType === 'rainy' ? '🌧️' : weather.weatherType === 'snowy' ? '❄️' : '🌫️'}
          </span>
          <div>
            <p className="text-sm font-medium text-sand-900">{getDateLabel(dateOffset)}: {weather.description}</p>
            <p className="text-xs text-sand-500">{weather.tempMin}°C – {weather.tempMax}°C
              {weather.precipitation > 0 && ` · ${weather.precipitation}mm rain`}</p>
          </div>
        </div>
      )}

      {top3.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🤔</div>
          <p className="text-sm text-sand-600 mb-2">No matches for these filters.</p>
          <p className="text-xs text-sand-400 mb-4">Try widening your time or budget, or add more places!</p>
          <button onClick={() => setStep('input')}
            className="px-6 py-2.5 bg-sand-900 text-sand-100 rounded-xl text-sm font-medium">Adjust filters</button>
        </div>
      ) : (
        <div className="space-y-4">
          {top3.map((scored, idx) => {
            const { item, reasons } = scored;
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
                    <span className="badge bg-sand-100 text-sand-700">{item.travelTimeMinutes} min</span>
                    <span className="badge bg-sand-100 text-sand-700">{DURATION_LABELS[item.durationEstimate]}</span>
                    <span className="badge bg-sand-100 text-sand-700">{COST_LABELS[item.costLevel]}</span>
                  </div>
                  {reasons.length > 0 && (
                    <p className="text-xs text-sand-600 mt-3 bg-sand-50 rounded-xl p-3 border border-sand-100">
                      {reasons.slice(0, 3).join(' · ')}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => onViewItem(item.id)}
                      className="flex-1 py-2.5 rounded-xl bg-sand-100 text-sand-700 text-xs font-medium border border-sand-200">Details</button>
                    <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`, '_blank')}
                      className="flex-1 py-2.5 rounded-xl bg-sand-900 text-sand-100 text-xs font-medium">Let's go!</button>
                  </div>
                </div>
              </div>
            );
          })}
          {combos.length > 0 && (
            <div className="bg-sand-100 rounded-2xl border border-sand-200 p-4">
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
