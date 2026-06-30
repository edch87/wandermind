import { useState, useEffect, useRef } from 'react';
import type { UserProfile, BucketListItem, WeatherForecast, HereSearchResult, PreferredTransport } from '../types';

import { fetchWeatherForecast } from '../utils/api';
import { getRecommendations, getRemainingSlotsToday } from '../utils/recommendation';
import { getDiscoverPlaces, toSearchResult, type DiscoverPlace } from '../utils/discover';
import { isHomePinRefined, markHomePinRefined } from '../utils/homePinPrompt';
import { formatTravelShort } from '../utils/travelDisplay';
import { DiscoverCard } from './Discover';
import {
  Sun, CloudSun, CloudRain, Snowflake, CloudFog,
  Shuffle, Plus, MapPin, X,
} from '@phosphor-icons/react';
import KiteIcon from './KiteIcon';
import PlaceImg from './PlaceImg';
import CuratedLists from './CuratedLists';
import HeaderAvatar from './HeaderAvatar';
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

/** Number of wind streaks emitted on a "Surprise me" pick. */
const WIND_STREAK_COUNT = 9;
/** How long the gust persists before unmounting. Matches the streak animation
 *  duration plus the largest stagger so every streak completes. */
const WIND_GUST_MS = 1800;

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Good morning, ${name}`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${name}`;
  if (hour >= 17 && hour < 22) return `Good evening, ${name}`;
  return `Hello ${name}`; // 22:00-04:59 — late night, keep it neutral
}

export default function Dashboard({ profile, items, onNavigate }: Props) {
  const [weather, setWeather] = useState<WeatherForecast[]>([]);
  const [surprise, setSurprise] = useState<BucketListItem | null>(null);
  const [showGust, setShowGust] = useState(false);
  const [discover, setDiscover] = useState<DiscoverPlace[]>([]);
  // One-time prompt for existing users to refine their home with the new pin
  // flow. New users complete the pin step in onboarding and never see this.
  const [showRefineHomeBanner, setShowRefineHomeBanner] = useState(false);
  const surpriseRef = useRef<HTMLDivElement>(null);

  const preferred: PreferredTransport = profile.preferredTransport || 'car';

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

  // Scroll the surprise card into view once it appears. Without this the card
  // renders below the quick actions and is offscreen on most phones.
  useEffect(() => {
    if (surprise && surpriseRef.current) {
      surpriseRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [surprise]);

  const todoItems = items.filter(i => i.status === 'want_to_do');
  const doneItems = items.filter(i => i.status === 'done');

  const todayWeather = weather[0];
  const outdoorCount = todoItems.filter(i => i.setting === 'outdoor' || i.setting === 'mixed').length;
  const indoorCount = todoItems.filter(i => i.setting === 'indoor').length;
  const isBadWeather = todayWeather && ['rainy', 'snowy', 'foggy'].includes(todayWeather.weatherType);

  const handleSpontaneous = () => {
    const dayWeather = weather[0] || null;
    // "Surprise me" — random pick from list, capped at full day (480 min).
    // Uses the engine's surprise-me path (added 2026-06-24) so the weighted-random
    // shuffle is applied; the old `energy: 'surprise_me'` enum value is gone.
    const scored = getRecommendations(items, {
      date: new Date().toISOString().split('T')[0],
      // Spontaneous = "right now" — only consider slots still available today.
      selectedSlots: getRemainingSlotsToday(),
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
      setShowGust(true);
      setTimeout(() => setShowGust(false), WIND_GUST_MS);
    }
  };

  const weatherIconEl = (() => {
    if (!todayWeather) return <CloudSun size={28} aria-hidden="true" />;
    switch (todayWeather.weatherType) {
      case 'sunny': return <Sun size={28} className="text-amber-500" aria-hidden="true" />;
      case 'cloudy': return <CloudSun size={28} className="text-sand-500" aria-hidden="true" />;
      case 'rainy': return <CloudRain size={28} className="text-blue-500" aria-hidden="true" />;
      case 'snowy': return <Snowflake size={28} className="text-sky-400" aria-hidden="true" />;
      case 'foggy': return <CloudFog size={28} className="text-sand-400" aria-hidden="true" />;
      default: return <CloudSun size={28} aria-hidden="true" />;
    }
  })();

  const surpriseTravelLabel = surprise ? formatTravelShort(surprise, preferred) : '';

  return (
    <main className="page-enter pb-24" aria-label="Dashboard">
      {/* Wind gust — celebration on "Surprise me" pick. Decorative, hidden from
          assistive tech; the surprise card itself announces via aria-live below. */}
      {showGust && (
        <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
          {Array.from({ length: WIND_STREAK_COUNT }).map((_, i) => (
            <div key={i} className="wind-streak"
              style={{
                top: `${10 + (i * (80 / WIND_STREAK_COUNT))}%`,
                width: `${30 + Math.random() * 25}vw`,
                animationDelay: `${i * 0.08}s`,
                animationDuration: `${1.2 + Math.random() * 0.4}s`,
                opacity: 0.5 + Math.random() * 0.4,
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <header className="px-6 pt-8 pb-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-sand-900">
            {getGreeting(profile.displayName)}, let's go on a <span className="heading-accent">lark</span>
          </h1>
          {items.length > 0 && (
            <p className="text-xs text-sand-700 mt-1">
              {todoItems.length} to explore · {doneItems.length} visited
            </p>
          )}
        </div>
        {/* Initials avatar opens Settings. Settings was removed from the bottom
            nav in the 2026-06-30 audit; the avatar replaces it across every
            primary tab. Shared as `HeaderAvatar`. */}
        <HeaderAvatar profile={profile} onOpen={() => onNavigate({ name: 'settings' })} />
      </header>

      {/* One-time prompt for users whose home is still city-level. New users
          completed the pin step in onboarding and won't see this. */}
      {showRefineHomeBanner && (
        <section
          aria-labelledby="refine-home-title"
          className="mx-6 mb-4 rounded-[20px] bg-sand-100 border border-sand-200 p-3 flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-sand-900 text-sand-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <MapPin size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p id="refine-home-title" className="text-sm font-medium text-sand-900">Fine-tune your home location</p>
            <p className="text-xs text-sand-700 mt-0.5 leading-snug">
              We can give better travel times with a more precise pin. Takes a few seconds.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { markHomePinRefined(profile.id); setShowRefineHomeBanner(false); onNavigate({ name: 'settings' }); }}
                className="text-xs font-semibold text-terra-600 hover:text-terra-700 min-h-[44px] px-2 -mx-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-100 rounded"
              >
                Update home
              </button>
              <button
                onClick={dismissRefineHomeBanner}
                className="text-xs font-medium text-sand-700 hover:text-sand-900 min-h-[44px] px-2 -mx-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-100 rounded"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={dismissRefineHomeBanner}
            aria-label="Dismiss home location prompt"
            className="w-11 h-11 -mt-1 -mr-1 flex items-center justify-center text-sand-700 hover:text-sand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-100 rounded-full"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </section>
      )}

      {/* Weather card */}
      {todayWeather && (
        <section className="mx-6 mb-5" aria-label="Today's weather">
          <div className="rounded-[20px] p-4 bg-sand-100">
            <div className="flex items-center gap-3">
              {weatherIconEl}
              <div className="flex-1">
                <p className="text-sm font-medium text-sand-900">
                  {todayWeather.description}, {todayWeather.tempMax}°C
                </p>
                <p className="text-xs text-sand-700 mt-0.5">
                  {isBadWeather
                    ? (indoorCount > 0
                        ? `Perfect for one of your ${indoorCount} indoor spot${indoorCount === 1 ? '' : 's'}`
                        : 'Perfect for something cosy')
                    : (outdoorCount > 0
                        ? `${outdoorCount} outdoor spot${outdoorCount === 1 ? '' : 's'} to explore`
                        : 'Great weather to explore')
                  }
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Quick actions — "Suggest something" is the hero (tall terra card,
          large centred kite), Surprise me + Add place are slim secondary pills
          beneath. Visual hierarchy reads "one main thing, two utilities". */}
      <div className="px-6 mb-6">
        <button
          onClick={() => onNavigate({ name: 'recommend' })}
          className="w-full bg-terra-500 text-white rounded-[20px] py-6 px-4 text-center hover:bg-terra-600 transition mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
        >
          <div className="flex justify-center mb-2"><KiteIcon size={32} aria-hidden="true" /></div>
          <div className="text-base font-semibold">Suggest something</div>
          <div className="text-xs text-white/80 mt-0.5">Find the right place for right now</div>
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleSpontaneous}
            className="flex-1 min-h-[44px] bg-sand-200 text-sand-900 rounded-full px-4 py-2 hover:bg-sand-300 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Shuffle size={18} aria-hidden="true" />
              <span className="text-sm font-medium">Surprise me</span>
            </div>
          </button>
          <button
            onClick={() => onNavigate({ name: 'add' })}
            className="flex-1 min-h-[44px] bg-sand-200 text-sand-900 rounded-full px-4 py-2 hover:bg-sand-300 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Plus size={18} aria-hidden="true" />
              <span className="text-sm font-medium">Add place</span>
            </div>
          </button>
        </div>
      </div>

      {/* Surprise result — aria-live so VoiceOver announces the pick. */}
      <div ref={surpriseRef} aria-live="polite" aria-atomic="true">
        {surprise && (
          <section className="mx-6 mb-5" aria-label="Spontaneous pick">
            <div className="card overflow-hidden">
              <div className="place-img-container h-32 overflow-hidden">
                <PlaceImg
                  src={surprise.photoUrl}
                  alt=""
                  name={surprise.name}
                  category={surprise.category}
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge bg-terra-500 text-white">Spontaneous pick!</span>
                  <button
                    onClick={() => setSurprise(null)}
                    aria-label="Dismiss spontaneous pick"
                    className="w-11 h-11 -mr-2 flex items-center justify-center text-sand-700 hover:text-sand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-full"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <h2 className="font-semibold text-sand-900 text-lg">{surprise.name}</h2>
                <p className="text-xs text-sand-700 mt-1">
                  {surpriseTravelLabel} · {surprise.costLevel === 'free' ? 'Free' : surprise.costLevel}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onNavigate({ name: 'detail', itemId: surprise.id })}
                    className="flex-1 min-h-[44px] rounded-full bg-sand-100 text-sand-900 text-xs font-medium border border-sand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${surprise.latitude},${surprise.longitude}`, '_blank')}
                    className="flex-1 min-h-[44px] rounded-full bg-sand-900 text-sand-100 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    Navigate
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Discover nearby — organic feed teaser (community + Wikidata) */}
      {discover.length > 0 && (
        <section className="mb-6" aria-labelledby="discover-nearby-title">
          <div className="px-6 flex items-baseline justify-between mb-3">
            <h2 id="discover-nearby-title" className="text-sm font-semibold text-sand-900">Discover nearby</h2>
            <button
              onClick={() => onNavigate({ name: 'discover' })}
              className="text-xs text-sand-700 hover:text-sand-900 transition min-h-[44px] px-2 -mx-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50 rounded"
            >
              See all
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-6 pb-2 scrollbar-hide" role="list">
            {discover.slice(0, 10).map(p => (
              <div key={p.key} className="flex-shrink-0 w-40" role="listitem">
                <DiscoverCard
                  place={p}
                  preferred={preferred}
                  onAdd={() => onNavigate({ name: 'add', initialPlace: toSearchResult(p), initialCategory: p.category })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Curated lists — Top of your list, Recently added, smart context rails, 3 random category rails */}
      <CuratedLists items={items} profile={profile} todayWeather={todayWeather} onNavigate={onNavigate} />

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center px-6 py-12">
          <div className="flex justify-center mb-4"><KiteIcon size={40} className="text-sand-400" aria-hidden="true" /></div>
          <h2 className="text-lg font-semibold text-sand-900 mb-2">Your adventure starts here</h2>
          <p className="text-sm text-sand-700 mb-6">Add places you'd love to visit and we'll help you decide when to go.</p>
          <button
            onClick={() => onNavigate({ name: 'add' })}
            className="px-8 min-h-[44px] bg-sand-900 text-sand-100 rounded-full font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
          >
            Add your first place
          </button>
        </div>
      )}
    </main>
  );
}
