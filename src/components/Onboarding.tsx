import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { searchPlaces, HERE_TILE_URL, HERE_TILE_ATTRIBUTION } from '../utils/api';
import { supabase } from '../utils/supabase';
import type { UserProfile, HereSearchResult } from '../types';
import { Feather, MapPin, Target, BookOpen, Shuffle } from '@phosphor-icons/react';

interface Props {
  displayName: string;
  onComplete: (profile: UserProfile) => void;
}

const CAROUSEL_SLIDES = [
  {
    icon: <MapPin size={28} />,
    title: 'Add a place',
    description: 'Search for anywhere you\'d like to visit. We fill in the details.',
  },
  {
    icon: <Target size={28} />,
    title: 'Get a recommendation',
    description: 'Tell us your mood, how long you\'ve got, and who\'s coming. We\'ll pick the best spot — weather and all.',
  },
  {
    icon: <BookOpen size={28} />,
    title: 'Track your adventures',
    description: 'Mark places as done, rate them, and add notes so that you can share and revisit the ones you love.',
  },
  {
    icon: <Shuffle size={28} />,
    title: 'Feeling spontaneous?',
    description: 'No time to plan? Hit shuffle and we\'ll pick something for you based on what\'s nearby and what the weather\'s doing.',
  },
];

type Step = 'welcome' | 'carousel' | 'location';

export default function Onboarding({ displayName, onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [slideIndex, setSlideIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HereSearchResult[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [searching, setSearching] = useState(false);

  // Swipe handling
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (step === 'location' && mapRef.current && !mapInstance.current) {
      const map = L.map(mapRef.current).setView([48.137, 11.576], 10);
      L.tileLayer(HERE_TILE_URL, {
        attribution: HERE_TILE_ATTRIBUTION,
      }).addTo(map);
      mapInstance.current = map;
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setSelectedLocation({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        if (markerRef.current) map.removeLayer(markerRef.current);
        markerRef.current = L.marker([lat, lng]).addTo(map);
      });
    }
  }, [step]);

  useEffect(() => {
    if (selectedLocation && mapInstance.current) {
      const { lat, lng } = selectedLocation;
      mapInstance.current.setView([lat, lng], 14);
      if (markerRef.current) mapInstance.current.removeLayer(markerRef.current);
      markerRef.current = L.marker([lat, lng]).addTo(mapInstance.current);
    }
  }, [selectedLocation]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchPlaces(searchQuery);
    setSearchResults(results);
    setSearching(false);
  };

  const selectSearchResult = (result: HereSearchResult) => {
    setSelectedLocation({ lat: result.position.lat, lng: result.position.lng, address: result.address.label });
    setSearchResults([]);
    setSearchQuery(result.title);
  };

  const handleComplete = async () => {
    if (!selectedLocation) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    onComplete({
      id: user.id,
      displayName: displayName,
      homeLatitude: selectedLocation.lat,
      homeLongitude: selectedLocation.lng,
      homeAddress: selectedLocation.address,
      preferredTransport: 'car',
      hasDog: false,
      hasKids: false,
      needsAccessibility: false,
      onboardingComplete: true,
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && slideIndex < CAROUSEL_SLIDES.length - 1) {
        setSlideIndex(slideIndex + 1);
      } else if (diff < 0 && slideIndex > 0) {
        setSlideIndex(slideIndex - 1);
      }
    }
  };

  // Welcome screen
  if (step === 'welcome') {
    const firstName = displayName.split(' ')[0] || 'there';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-sand-50">
        <Feather size={48} className="text-sand-900 mb-6" />
        <h1 className="text-3xl font-semibold text-sand-900 mb-2">Welcome, {firstName}!</h1>
        <p className="text-sand-700 text-sm mb-10 max-w-xs leading-relaxed">
          Here's how Lark works — it only takes a minute.
        </p>
        <button
          onClick={() => setStep('carousel')}
          className="w-full max-w-xs bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 transition"
        >
          Show me
        </button>
      </div>
    );
  }

  // Feature carousel
  if (step === 'carousel') {
    const slide = CAROUSEL_SLIDES[slideIndex];
    const isLast = slideIndex === CAROUSEL_SLIDES.length - 1;

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-sand-50"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Skip link */}
        <button
          onClick={() => setStep('location')}
          className="absolute top-6 right-6 text-sm text-sand-600 hover:text-sand-700 transition"
        >
          Skip
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-[20px] bg-sand-200 flex items-center justify-center text-sand-700 mb-8">
          {slide.icon}
        </div>

        {/* Content */}
        <h2 className="text-2xl font-semibold text-sand-900 mb-3">{slide.title}</h2>
        <p className="text-sand-700 text-sm leading-relaxed max-w-xs mb-10">
          {slide.description}
        </p>

        {/* Dot indicators */}
        <div className="flex gap-2 mb-8">
          {CAROUSEL_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === slideIndex ? 'bg-sand-900 w-6' : 'bg-sand-300'
              }`}
            />
          ))}
        </div>

        {/* Navigation button */}
        <button
          onClick={() => {
            if (isLast) {
              setStep('location');
            } else {
              setSlideIndex(slideIndex + 1);
            }
          }}
          className="w-full max-w-xs bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 transition"
        >
          {isLast ? 'Get started' : 'Next'}
        </button>
      </div>
    );
  }

  // Location setup
  return (
    <div className="min-h-screen px-6 py-8 bg-sand-50">
      <div className="mb-1">
        <h2 className="text-xl font-semibold text-sand-900 mt-1">
          Where's <span className="heading-accent">home?</span>
        </h2>
        <p className="text-sm text-sand-700 mt-1">
          We'll use this to calculate travel times to your bucket list spots.
        </p>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">
          Home location
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for your city..."
            className="flex-1 px-4 py-3 border border-sand-200 rounded-[12px] text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-5 py-3 bg-sand-900 text-sand-100 rounded-full text-sm font-medium hover:bg-sand-800 disabled:opacity-50"
          >
            {searching ? '...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-white border border-sand-200 rounded-[20px] mb-3 max-h-40 overflow-auto">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => selectSearchResult(r)}
                className="w-full text-left px-4 py-3 text-sm hover:bg-sand-50 border-b border-sand-100 last:border-0 text-sand-800"
              >
                {r.address.label}
              </button>
            ))}
          </div>
        )}

        <div ref={mapRef} className="w-full h-52 rounded-[20px] mb-3 border border-sand-200" />

        {selectedLocation && (
          <p className="text-xs text-forest-600 mb-4 px-1">
            ✓ {selectedLocation.address.substring(0, 60)}...
          </p>
        )}
      </div>

      <button
        onClick={handleComplete}
        disabled={!selectedLocation}
        className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-lg hover:bg-sand-800 disabled:opacity-30 disabled:cursor-not-allowed transition mt-2"
      >
        Start exploring
      </button>
    </div>
  );
}
