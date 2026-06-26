import { useState, useEffect } from 'react';
import type { UserProfile, BucketListItem, WeatherForecast, HereSearchResult } from '../types';

import { fetchWeatherForecast } from '../utils/api';
import { getRecommendations } from '../utils/recommendation';
import { getDiscoverPlaces, toSearchResult, type DiscoverPlace } from '../utils/discover';
import { isHomePinRefined, markHomePinRefined } from '../utils/homePinPrompt';
import { DiscoverCard } from './Discover';
import {
  Sun, CloudSun, CloudRain, Snowflake, CloudFog,
  Shuffle, Plus, MapPin, X,
} from '@phosphor-icons/react';
import KiteIcon from './KiteIcon';
import PlaceImg from './PlaceImg';
import CuratedLists from './CuratedLists';
import type { Category } from '../types';

interface Props {
  profile: UserProfile;
  items: BucketListItem[];
  onNavigate: (s: {
    name: string;
    itemId?: string;
    initialTab?: 'want_to_do' | 'done';
    initialCategory?: Category;
    initialPlace?: HereSearchResult;
  }) => void;
  onSaveProfile: (p: UserProfile) => void;
}

export default function Dashboard({ profile, items, onNavigate }: Props) {
  const [weather, setWeather] = useState<WeatherForecast[]>([]);
  const [surprise, setSurprise] = useState<BucketListItem | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [discover, setDiscover] = useState<DiscoverPlace[]>([]);
  // One-time prompt for existing users to refine their home with the new pin
  // flow. New users complete the pin step in onboarding and never see this.
  const [showRefineHomeBanner, setShowRefineHomeBanner] = useState(false);

  useEffect(() => {
    fetchWeatherForecast(profile.homeLatitude, profile.homeLongitude).then(setWeather);
  }, [profile.homeLatitude, profile.homeLongitude]);

  useEffect(() => {
    setShowRefineHomeBanner(!isHomePinRefined(profile.id));
  }, [profile.id]);

  const dismissRefineHomeBanner = () => {
    markHomePinRefined(profile.id);
    setShowRefineHomeBanner(false);
  };

  // Discover teaser rail — session-cached in discover.ts, so this is cheap on re-renders
  useEffect(() => {
    let cancelled = false;
    getDiscoverPlaces(profile, items).then(p => { if (!cancelled) setDiscover(p); });
    return () => { cancelled = true; };
  }, [profile, items]);

  const todoItems = items.filter(i => i.status === 'want_to_do');
  const doneItems = items.filter(i => i.status === 'done');

  const todayWeather = weather[0];
  const outdoorCount = todoItems.filter(i => i.setting === 'outdoor' || i.setting === 'mixed').length;
  const indoorCount = todoItems.filter(i => i.weatherSuitability === 'any' || i.weatherSuitability === 'bad_weather_ideal').length;
  const isBadWeather = todayWeather && ['rainy', 'snowy', 'foggy'].includes(todayWeather.weatherType);

  const handleSpontaneous = () => {
    const dayWeather = weather[0] || null;
    // "I'm feeling spontaneous" — random pick from list, capped at full day (480 min).
    // Uses the engine's surprise-me path (added 2026-06-24) so the weighted-random
    // shuffle is applied; the old `energy: 'surprise_me'` enum value is gone.
    const scored = getRecommendations(items, {
      date: new Date().toISOString().split('T')[0],
      timeAvailableMinutes: 480,
      groupTypes: [],
      energy: 'up_for_anything',
      vibes: ['flexible'],
      maxCostLevel: 'expensive',
      travelFrom: 'home',
      transportModes: ['car'],
      dogComing: false,
      needsAccessibility: false,
      strollerNeeded: false,
      surpriseMe: true,
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
        {items.length > 0 && (
          <p className="text-xs text-sand-700 mt-1">
            {todoItems.length} to explore · {doneItems.length} visited
          </p>
        )}
      </div>

      {/* One-time prompt for users whose home is still city-level. New users
          completed the pin step in onboarding and won't see this. */}
      {showRefineHomeBanner && (
        <div className="mx-6 mb-4 rounded-[20px] bg-sand-100 border border-sand-200 p-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-sand-900 text-sand-100 flex items-center justify-center flex-shrink-0">
            <MapPin size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sand-900">Fine-tune your home location</p>
            <p className="text-xs text-sand-700 mt-0.5 leading-snug">
              We can give better travel times with a more precise pin. Takes a few seconds.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { markHomePinRefined(profile.id); setShowRefineHomeBanner(false); onNavigate({ name: 'settings' }); }}
                className="text-xs font-semibold text-terra-500 hover:text-terra-600"
              >
                Update home
              </button>
              <button
                onClick={dismissRefineHomeBanner}
                className="text-xs font-medium text-sand-600 hover:text-sand-800"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={dismissRefineHomeBanner}
            aria-label="Dismiss"
            className="text-sand-500 hover:text-sand-800 -mt-0.5 -mr-0.5 p-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
            <div className="flex justify-center mb-1"><KiteIcon size={20} /></div>
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
            <div className="place-img-container h-32 overflow-hidden">
              <PlaceImg
                src={surprise.photoUrl}
                alt={surprise.name}
                name={surprise.name}
                category={surprise.category}
              />
            </div>
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

      {/* Discover nearby — moved above the fold; organic feed teaser (community + Wikidata) */}
      {discover.length > 0 && (
        <div className="mb-6">
          <div className="px-6 flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-sand-900">Discover nearby</h3>
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

      {/* Curated lists — Top of your list, Recently added, smart context rails, 3 random category rails */}
      <CuratedLists items={items} todayWeather={todayWeather} onNavigate={onNavigate} />

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center px-6 py-12">
          <div className="flex justify-center mb-4"><KiteIcon size={40} className="text-sand-400" /></div>
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
