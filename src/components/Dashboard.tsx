import { useState, useEffect } from 'react';
import type { UserProfile, BucketListItem, WeatherForecast } from '../types';
import { CATEGORY_INFO } from '../types';
import { fetchWeatherForecast } from '../utils/api';
import { getRecommendations } from '../utils/recommendation';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onNavigate: (s: { name: string; itemId?: string }) => void;
}

export default function Dashboard({ profile, items, onNavigate }: Props) {
  const [weather, setWeather] = useState<WeatherForecast[]>([]);
  const [surprise, setSurprise] = useState<BucketListItem | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    fetchWeatherForecast(profile.homeLatitude, profile.homeLongitude).then(setWeather);
  }, [profile.homeLatitude, profile.homeLongitude]);

  const todoItems = items.filter(i => i.status === 'want_to_do');
  const doneItems = items.filter(i => i.status === 'done');
  const recentItems = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  // Category stats
  const catCounts: Record<string, number> = {};
  todoItems.forEach(i => { catCounts[i.category] = (catCounts[i.category] || 0) + 1; });
  const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  // Seasonal banner logic
  const todayWeather = weather[0];
  const outdoorCount = todoItems.filter(i => i.setting === 'outdoor' || i.setting === 'mixed').length;
  const indoorCount = todoItems.filter(i => i.weatherSuitability === 'any' || i.weatherSuitability === 'bad_weather_ideal').length;
  const isBadWeather = todayWeather && ['rainy', 'snowy', 'foggy'].includes(todayWeather.weatherType);

  const handleSurpriseMe = () => {
    const dayWeather = weather[0] || null;
    const scored = getRecommendations(items, {
      date: new Date().toISOString().split('T')[0],
      timeAvailableMinutes: 480,
      groupTypes: [],
      moods: [],
      maxCostLevel: 'expensive',
      travelFrom: 'home',
      dogComing: false,
    }, dayWeather);

    if (scored.length > 0) {
      const randomIdx = Math.floor(Math.random() * Math.min(scored.length, 5));
      setSurprise(scored[randomIdx].item);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  return (
    <div className="px-5 py-6 pb-24">
      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: ['#f59e0b', '#0d7377', '#dc2626', '#7c3aed', '#16a34a'][i % 5],
                animationDelay: `${Math.random() * 0.5}s`,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                width: `${6 + Math.random() * 8}px`,
                height: `${6 + Math.random() * 8}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Hi, {profile.displayName}! 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">What will you explore next?</p>
      </div>

      {/* Weather banner */}
      {todayWeather && (
        <div className={`rounded-2xl p-4 mb-5 ${isBadWeather ? 'bg-blue-50' : 'bg-amber-50'}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">
              {todayWeather.weatherType === 'sunny' ? '☀️' : todayWeather.weatherType === 'cloudy' ? '⛅' :
               todayWeather.weatherType === 'rainy' ? '🌧️' : todayWeather.weatherType === 'snowy' ? '❄️' : '🌫️'}
            </span>
            <div>
              <div className="text-sm font-medium text-gray-800">
                {isBadWeather
                  ? `${todayWeather.description} today — perfect time for ${indoorCount > 0 ? `one of your ${indoorCount} indoor spots` : 'an indoor activity'}!`
                  : `${todayWeather.description}, ${todayWeather.tempMax}°C — ${outdoorCount > 0 ? `you have ${outdoorCount} outdoor spots waiting` : 'great day to explore'}!`
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <button onClick={() => onNavigate({ name: 'recommend' })}
          className="bg-teal-500 text-white rounded-2xl p-4 text-center hover:bg-teal-600 transition">
          <div className="text-2xl mb-1">🎯</div>
          <div className="text-xs font-medium">Recommend</div>
        </button>
        <button onClick={handleSurpriseMe}
          className="bg-amber-500 text-white rounded-2xl p-4 text-center hover:bg-amber-600 transition">
          <div className="text-2xl mb-1">🎲</div>
          <div className="text-xs font-medium">Surprise me</div>
        </button>
        <button onClick={() => onNavigate({ name: 'add' })}
          className="bg-gray-100 text-gray-700 rounded-2xl p-4 text-center hover:bg-gray-200 transition">
          <div className="text-2xl mb-1">➕</div>
          <div className="text-xs font-medium">Add place</div>
        </button>
      </div>

      {/* Surprise result */}
      {surprise && (
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl p-5 mb-5 relative">
          <button onClick={() => setSurprise(null)} className="absolute top-3 right-3 text-gray-400 text-sm">✕</button>
          <div className="text-xs font-bold text-amber-600 mb-2">🎲 Surprise pick!</div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{CATEGORY_INFO[surprise.category].emoji}</span>
            <div>
              <h3 className="font-bold text-gray-900">{surprise.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                🚗 {surprise.travelTimeMinutes} min · {surprise.costLevel === 'free' ? 'Free' : surprise.costLevel}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => onNavigate({ name: 'detail', itemId: surprise.id })}
              className="flex-1 py-2 rounded-lg bg-white text-gray-600 text-xs font-medium border border-gray-200">
              Details
            </button>
            <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${surprise.latitude},${surprise.longitude}`, '_blank')}
              className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium">
              Let's go!
            </button>
          </div>
        </div>
      )}

      {/* Stats card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Your progress</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-teal-500">{todoItems.length}</div>
            <div className="text-xs text-gray-500">To explore</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-500">{doneItems.length}</div>
            <div className="text-xs text-gray-500">Completed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-500">
              {topCategory ? CATEGORY_INFO[topCategory[0] as keyof typeof CATEGORY_INFO]?.emoji || '📍' : '—'}
            </div>
            <div className="text-xs text-gray-500">
              {topCategory ? `Top: ${CATEGORY_INFO[topCategory[0] as keyof typeof CATEGORY_INFO]?.label}` : 'No items yet'}
            </div>
          </div>
        </div>
      </div>

      {/* Recently added */}
      {recentItems.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-3">Recently added</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {recentItems.map(item => {
              const cat = CATEGORY_INFO[item.category];
              return (
                <button key={item.id} onClick={() => onNavigate({ name: 'detail', itemId: item.id })}
                  className="flex-shrink-0 w-36 bg-white rounded-xl border border-gray-100 p-3 text-left hover:border-teal-200 transition">
                  <div className="text-2xl mb-2">{cat.emoji}</div>
                  <div className="text-xs font-medium text-gray-900 truncate">{item.name}</div>
                  <div className="text-[10px] text-gray-500 mt-1">🚗 {item.travelTimeMinutes} min</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-8">
          <div className="text-5xl mb-4">🗺️</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Your bucket list is empty</h3>
          <p className="text-sm text-gray-500 mb-4">Start by adding places you'd love to visit!</p>
          <button onClick={() => onNavigate({ name: 'add' })}
            className="px-6 py-3 bg-teal-500 text-white rounded-xl font-medium">
            Add your first place
          </button>
        </div>
      )}
    </div>
  );
}
