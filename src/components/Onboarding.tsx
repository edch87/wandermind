import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { searchPlaces } from '../utils/api';
import { generateId } from '../utils/storage';
import type { UserProfile, TransportMode, NominatimResult } from '../types';

interface Props {
  onComplete: (profile: UserProfile) => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [transport, setTransport] = useState<TransportMode>('car');
  const [hasDog, setHasDog] = useState(false);
  const [hasKids, setHasKids] = useState(false);
  const [searching, setSearching] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize map on step 1
  useEffect(() => {
    if (step === 1 && mapRef.current && !mapInstance.current) {
      const map = L.map(mapRef.current).setView([48.137, 11.576], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      mapInstance.current = map;

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setSelectedLocation({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        if (markerRef.current) map.removeLayer(markerRef.current);
        markerRef.current = L.marker([lat, lng]).addTo(map);
      });
    }
    return () => {
      if (step !== 1 && mapInstance.current) {
        // Keep map alive while on step 1
      }
    };
  }, [step]);

  // Update marker when location is selected from search
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

  const selectSearchResult = (result: NominatimResult) => {
    setSelectedLocation({
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      address: result.display_name,
    });
    setSearchResults([]);
    setSearchQuery(result.display_name.split(',').slice(0, 2).join(','));
  };

  const handleComplete = () => {
    if (!selectedLocation) return;
    onComplete({
      id: generateId(),
      displayName: name,
      homeLatitude: selectedLocation.lat,
      homeLongitude: selectedLocation.lng,
      homeAddress: selectedLocation.address,
      preferredTransport: transport,
      hasDog,
      hasKids,
      onboardingComplete: true,
    });
  };

  // Step 0: Welcome
  if (step === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">🧭</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">WanderMind</h1>
        <p className="text-gray-500 mb-2 text-lg">Your smart bucket list</p>
        <p className="text-gray-400 text-sm mb-8 max-w-xs">
          Save places you want to visit. When you have free time, we'll recommend
          the perfect activity based on weather, time, and mood.
        </p>
        <div className="space-y-3 w-full max-w-xs mb-8">
          {['Save places with smart auto-categorisation', 'Get personalised recommendations', 'Weather-aware suggestions'].map((text, i) => (
            <div key={i} className="flex items-center gap-3 text-left">
              <span className="text-teal-500 text-lg">{['📍', '🎯', '🌤️'][i]}</span>
              <span className="text-sm text-gray-600">{text}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setStep(1)}
          className="w-full max-w-xs bg-teal-500 text-white py-3 rounded-xl font-semibold text-lg hover:bg-teal-600 transition"
        >
          Get started
        </button>
      </div>
    );
  }

  // Step 1: Name + Home location
  if (step === 1) {
    return (
      <div className="min-h-screen px-5 py-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Set up your profile</h2>
        <p className="text-sm text-gray-500 mb-5">We'll use your home location to calculate travel times.</p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Edward"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl mb-4 text-sm focus:outline-none focus:border-teal-500"
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">Home location</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for your city or address..."
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2.5 bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 disabled:opacity-50"
          >
            {searching ? '...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl mb-3 max-h-40 overflow-auto">
            {searchResults.map((r) => (
              <button
                key={r.place_id}
                onClick={() => selectSearchResult(r)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 border-b border-gray-50 last:border-0"
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}

        <div ref={mapRef} className="w-full h-56 rounded-xl mb-3 border border-gray-200" />

        {selectedLocation && (
          <p className="text-xs text-teal-600 mb-4">
            Selected: {selectedLocation.address.substring(0, 60)}...
          </p>
        )}

        <button
          onClick={() => setStep(2)}
          disabled={!name.trim() || !selectedLocation}
          className="w-full bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Continue
        </button>
      </div>
    );
  }

  // Step 2: Preferences
  return (
    <div className="min-h-screen px-5 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Preferences</h2>
      <p className="text-sm text-gray-500 mb-6">A few quick settings to personalise your experience.</p>

      <label className="block text-sm font-medium text-gray-700 mb-2">How do you usually travel?</label>
      <div className="toggle-group mb-6">
        {([['car', '🚗 Car'], ['bike', '🚲 Bike'], ['transit', '🚆 Transit'], ['walk', '🚶 Walk']] as const).map(([val, label]) => (
          <button
            key={val}
            className={`toggle-btn ${transport === val ? 'active' : ''}`}
            onClick={() => setTransport(val as TransportMode)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium text-gray-700 mb-3">Your household</label>
      <div className="space-y-3 mb-8">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={hasKids} onChange={(e) => setHasKids(e.target.checked)}
            className="w-5 h-5 rounded text-teal-500 focus:ring-teal-500" />
          <span className="text-sm text-gray-700">👶 I have kids</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={hasDog} onChange={(e) => setHasDog(e.target.checked)}
            className="w-5 h-5 rounded text-teal-500 focus:ring-teal-500" />
          <span className="text-sm text-gray-700">🐕 I have a dog</span>
        </label>
      </div>

      <button
        onClick={handleComplete}
        className="w-full bg-teal-500 text-white py-3 rounded-xl font-semibold text-lg hover:bg-teal-600 transition"
      >
        Start exploring!
      </button>
    </div>
  );
}
