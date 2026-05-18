import { useState, useEffect } from 'react';
import type { UserProfile, BucketListItem, WeatherForecast } from '../types';
import { CATEGORY_INFO } from '../types';
import { fetchWeatherForecast } from '../utils/api';
import { getRecommendations } from '../utils/recommendation';
import {
  Sun, CloudSun, CloudRain, Snowflake, CloudFog,
  Feather, Shuffle, Plus, MapPin,
} from '@phosphor-icons/react';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onNavigate: (s: { name: string; itemId?: string }) => void;
  onSaveProfile: (p: UserProfile) => void;
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

  const todayWeather = weather[0];
  const outdoorCount = todoItems.filter(i => i.setting === 'outdoor' || i.setting === 'mixed').length;
  const indoorCount = todoItems.filter(i => i.weatherSuitability === 'any' || i.weatherSuitability === 'bad_weather_ideal').length;
  const isBadWeather = todayWeather && ['rainy', 'snowy', 'foggy'].includes(todayWeather.weatherType);

  const handleSpontaneous = () => {
    const dayWeather = weather[0] || null;
    // "I'm feeling spontaneous" — random pick from list, capped at full day (480 min)
    const scored = getRecommendations(items, {
      date: new Date().toISOString().split('T')[0],
      timeAvailableMinutes: 480,
      groupTypes: [],
      energy: 'surprise_me',
      vibes: ['flexible'],
      maxCostLevel: 'expensive',
      travelFrom: 'home',
      transportMode: 'car',
      dogComing: false,
      needsAccessibility: false,
      strollerNeeded: false,
    }, dayWeather);
    if (scored.length > 0) {
      const randomIdx = Math.floor(Math.random() * Math.min(scored.length, 5));
      setSurprise(scored[randomIdx].item);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  const weatherIconEl = (() => {
    if (!todayWeather) return <CloudSun size={28} />;
    switch (todayWeather.weatherType) {
      case 'sunny': return <Sun size={28} className="text-amber-500" />;
      case 'cloudy': return <CloudSun size={28} className="text-sand-500" />;
      case 'rainy': return <CloudRain size={28} className="text-blue-500" />;
      case 'snowy': return <Snowflake size={28} className="text-sky-400" />;
      case 'foggy': return <CloudFog size={28} className="text-sand-400" />;
      default: return <CloudSun size={28} />;
    }
  })();

  return (
    <div className="page-enter pb-24">
      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: ['#B8945C', '#C65D3A', '#4A7C59', '#7A5C3A', '#D4B896'][i % 5],
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
      <div className="px-6 pt-8 pb-4">
        <h1 className="text-2xl font-semibold text-sand-900">
          Hello {profile.displayName}, let's go on a <span className="heading-accent">lark</span>
        </h1>
      </div>

      {/* Weather card */}
      {todayWeather && (
        <div className="mx-6 mb-5">
          <div className="rounded-[20px] p-4 bg-sand-100">
            <div className="flex items-center gap-3">
              {weatherIconEl}
              <div className="flex-1">
                <p className="text-sm font-medium text-sand-900">
                  {todayWeather.description}, {todayWeather.tempMax}°C
                </p>
                <p className="text-xs text-sand-700 mt-0.5">
                  {isBadWeather
                    ? `Perfect for ${indoorCount > 0 ? `one of your ${indoorCount} indoor spots` : 'something cosy'}`
                    : `${outdoorCount > 0 ? `${outdoorCount} outdoor spots` : 'Great weather to'} explore!`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="px-6 mb-6">
        <div className="flex gap-3">
          <button onClick={() => onNavigate({ name: 'recommend' })}
            className="flex-1 bg-sand-900 text-sand-100 rounded-[20px] py-4 text-center hover:bg-sand-800 transition">
            <div className="flex justify-center mb-1"><Feather size={20} /></div>
            <div className="text-xs font-medium">Suggest something</div>
          </button>
          <button onClick={handleSpontaneous}
            className="flex-1 bg-terra-500 text-white rounded-[20px] py-4 text-center hover:bg-terra-600 transition">
            <div className="flex justify-center mb-1"><Shuffle size={20} /></div>
            <div className="text-xs font-medium">I'm feeling spontaneous</div>
          </button>
          <button onClick={() => onNavigate({ name: 'add' })}
            className="flex-1 bg-sand-200 text-sand-900 rounded-[20px] py-4 text-center hover:bg-sand-300 transition">
            <div className="flex justify-center mb-1"><Plus size={20} /></div>
            <div className="text-xs font-medium">Add place</div>
          </button>
        </div>
      </div>

      {/* Surprise result */}
      {surprise && (
        <div className="mx-6 mb-5">
          <div className="card overflow-hidden">
            {surprise.photoUrl && (
              <div className="place-img-container h-32">
                <img src={surprise.photoUrl} alt={surprise.name} className="place-img"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="badge bg-terra-500 text-white">Spontaneous pick!</span>
                <button onClick={() => setSurprise(null)} className="text-sand-400 text-xs">✕</button>
              </div>
              <h3 className="font-semibold text-sand-900 text-lg">{surprise.name}</h3>
              <p className="text-xs text-sand-700 mt-1">
                {surprise.travelDistanceKm} km away · {surprise.costLevel === 'free' ? 'Free' : surprise.costLevel}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => onNavigate({ name: 'detail', itemId: surprise.id })}
                  className="flex-1 py-2 rounded-full bg-sand-100 text-sand-700 text-xs font-medium border border-sand-200">
                  Details
                </button>
                <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${surprise.latitude},${surprise.longitude}`, '_blank')}
                  className="flex-1 py-2 rounded-full bg-sand-900 text-sand-100 text-xs font-medium">
                  Navigate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="px-6 mb-6">
        <div className="flex gap-3">
          <button onClick={() => onNavigate({ name: 'list' })}
            className="flex-1 bg-white rounded-[20px] p-4 border border-sand-200 text-center hover:border-sand-400 transition">
            <div className="flex justify-center mb-1"><MapPin size={18} className="text-sand-600" /></div>
            <div className="text-2xl font-semibold text-sand-900">{todoItems.length}</div>
            <div className="text-[11px] text-sand-700 mt-1">To explore</div>
          </button>
          <button onClick={() => onNavigate({ name: 'list' })}
            className="flex-1 bg-white rounded-[20px] p-4 border border-sand-200 text-center hover:border-sand-400 transition">
            <div className="flex justify-center mb-1"><Feather size={18} className="text-forest-500" /></div>
            <div className="text-2xl font-semibold text-forest-500">{doneItems.length}</div>
            <div className="text-[11px] text-sand-700 mt-1">Visited</div>
          </button>
        </div>
      </div>

      {/* Recently added */}
      {recentItems.length > 0 && (
        <div className="mb-6">
          <h3 className="px-6 text-sm font-semibold text-sand-900 mb-3">Recently added</h3>
          <div className="flex gap-3 overflow-x-auto px-6 pb-2 scrollbar-hide">
            {recentItems.map(item => {
              const cat = CATEGORY_INFO[item.category];
              return (
                <button key={item.id} onClick={() => onNavigate({ name: 'detail', itemId: item.id })}
                  className="flex-shrink-0 w-40 card text-left">
                  <div className="place-img-container h-24">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={item.name} className="place-img"
                        onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-medium text-sand-500 bg-sand-200">{cat.label}</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-medium text-sand-900 truncate">{item.name}</div>
                    <div className="text-[10px] text-sand-700 mt-1">{item.travelDistanceKm} km · {item.costLevel === 'free' ? 'Free' : item.costLevel}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center px-6 py-12">
          <div className="flex justify-center mb-4"><Feather size={40} className="text-sand-400" /></div>
          <h3 className="text-lg font-semibold text-sand-900 mb-2">Your adventure starts here</h3>
          <p className="text-sm text-sand-700 mb-6">Add places you'd love to visit and we'll help you decide when to go.</p>
          <button onClick={() => onNavigate({ name: 'add' })}
            className="px-8 py-3 bg-sand-900 text-sand-100 rounded-full font-medium">
            Add your first place
          </button>
        </div>
      )}
    </div>
  );
}
