import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { searchPlaces } from '../utils/api';
import { supabase } from '../utils/supabase';
import type { UserProfile, TransportMode, NominatimResult } from '../types';
import { Feather, MapPin, Target, CloudSun, Car, Bike, Train, Footprints, Baby, Dog, Accessibility } from 'lucide-react';

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
  const [needsAccessibility, setNeedsAccessibility] = useState(false);
  const [searching, setSearching] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

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

  const selectSearchResult = (result: NominatimResult) => {
    setSelectedLocation({ lat: parseFloat(result.lat), lng: parseFloat(result.lon), address: result.display_name });
    setSearchResults([]);
    setSearchQuery(result.display_name.split(',').slice(0, 2).join(','));
  };

  const handleComplete = async () => {
    if (!selectedLocation) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    onComplete({
      id: user.id, displayName: name,
      homeLatitude: selectedLocation.lat, homeLongitude: selectedLocation.lng,
      homeAddress: selectedLocation.address, preferredTransport: transport,
      hasDog, hasKids, needsAccessibility, onboardingComplete: true,
    });
  };

  const transportOptions: { val: TransportMode; label: string; icon: React.ReactNode }[] = [
    { val: 'car', label: 'Car', icon: <Car size={16} strokeWidth={1.5} /> },
    { val: 'bike', label: 'Bike', icon: <Bike size={16} strokeWidth={1.5} /> },
    { val: 'transit', label: 'Transit', icon: <Train size={16} strokeWidth={1.5} /> },
    { val: 'walk', label: 'Walk', icon: <Footprints size={16} strokeWidth={1.5} /> },
  ];

  // Welcome
  if (step === 0) {
    const features: { icon: React.ReactNode; text: string }[] = [
      { icon: <MapPin size={18} strokeWidth={1.5} />, text: 'Save places with smart auto-categorisation' },
      { icon: <Target size={18} strokeWidth={1.5} />, text: 'Get personalised recommendations' },
      { icon: <CloudSun size={18} strokeWidth={1.5} />, text: 'Weather-aware suggestions' },
    ];

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-sand-50">
        <Feather size={48} strokeWidth={1.5} className="text-sand-900 mb-6" />
        <h1 className="text-3xl font-semibold text-sand-900 mb-2">Lark</h1>
        <p className="heading-accent text-lg mb-2">Do it on a lark</p>
        <p className="text-sand-500 text-sm mb-10 max-w-xs leading-relaxed">
          Save places you want to visit. When you have free time, we'll recommend the perfect one based on weather, time, and mood.
        </p>
        <div className="space-y-4 w-full max-w-xs mb-10 text-left">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-sand-200 flex items-center justify-center text-sand-700 flex-shrink-0">{f.icon}</div>
              <span className="text-sm text-sand-700">{f.text}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setStep(1)}
          className="w-full max-w-xs bg-sand-900 text-sand-100 py-4 rounded-2xl font-semibold text-lg hover:bg-sand-800 transition">
          Get started
        </button>
      </div>
    );
  }

  // Location setup
  if (step === 1) {
    return (
      <div className="min-h-screen px-6 py-8 bg-sand-50">
        <div className="mb-1">
          <p className="text-sm text-sand-500">Step 1 of 2</p>
          <h2 className="text-xl font-semibold text-sand-900 mt-1">Where's <span className="heading-accent">home?</span></h2>
          <p className="text-sm text-sand-500 mt-1">We'll use this to calculate travel times.</p>
        </div>

        <div className="mt-5">
          <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">Your name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Edward"
            className="w-full px-4 py-3 border border-sand-200 rounded-2xl mb-5 text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white" />

          <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">Home location</label>
          <div className="flex gap-2 mb-3">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for your city..."
              className="flex-1 px-4 py-3 border border-sand-200 rounded-2xl text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white" />
            <button onClick={handleSearch} disabled={searching}
              className="px-5 py-3 bg-sand-900 text-sand-100 rounded-2xl text-sm font-medium hover:bg-sand-800 disabled:opacity-50">
              {searching ? '...' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="bg-white border border-sand-200 rounded-2xl mb-3 max-h-40 overflow-auto">
              {searchResults.map((r) => (
                <button key={r.place_id} onClick={() => selectSearchResult(r)}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-sand-50 border-b border-sand-100 last:border-0 text-sand-800">
                  {r.display_name}
                </button>
              ))}
            </div>
          )}

          <div ref={mapRef} className="w-full h-52 rounded-2xl mb-3 border border-sand-200" />

          {selectedLocation && (
            <p className="text-xs text-forest-600 mb-4 px-1">
              ✓ {selectedLocation.address.substring(0, 60)}...
            </p>
          )}
        </div>

        <button onClick={() => setStep(2)} disabled={!name.trim() || !selectedLocation}
          className="w-full bg-sand-900 text-sand-100 py-4 rounded-2xl font-semibold hover:bg-sand-800 disabled:opacity-30 disabled:cursor-not-allowed transition mt-2">
          Continue
        </button>
      </div>
    );
  }

  // Preferences
  return (
    <div className="min-h-screen px-6 py-8 bg-sand-50">
      <p className="text-sm text-sand-500">Step 2 of 2</p>
      <h2 className="text-xl font-semibold text-sand-900 mt-1 mb-6">A few <span className="heading-accent">preferences</span></h2>

      <div className="mb-6">
        <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-2 block">How do you usually travel?</label>
        <div className="toggle-group">
          {transportOptions.map(({ val, label, icon }) => (
            <button key={val} className={`toggle-btn ${transport === val ? 'active' : ''}`}
              onClick={() => setTransport(val)}>
              <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-3 block">Your household</label>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={hasKids} onChange={(e) => setHasKids(e.target.checked)}
              className="w-5 h-5 rounded border-sand-300 text-sand-900 focus:ring-sand-500" />
            <span className="inline-flex items-center gap-2 text-sm text-sand-700"><Baby size={16} strokeWidth={1.5} /> I have kids</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={hasDog} onChange={(e) => setHasDog(e.target.checked)}
              className="w-5 h-5 rounded border-sand-300 text-sand-900 focus:ring-sand-500" />
            <span className="inline-flex items-center gap-2 text-sm text-sand-700"><Dog size={16} strokeWidth={1.5} /> I have a dog</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={needsAccessibility} onChange={(e) => setNeedsAccessibility(e.target.checked)}
              className="w-5 h-5 rounded border-sand-300 text-sand-900 focus:ring-sand-500" />
            <span className="inline-flex items-center gap-2 text-sm text-sand-700"><Accessibility size={16} strokeWidth={1.5} /> I need accessible options</span>
          </label>
        </div>
      </div>

      <button onClick={handleComplete}
        className="w-full bg-sand-900 text-sand-100 py-4 rounded-2xl font-semibold text-lg hover:bg-sand-800 transition">
        Start exploring
      </button>
    </div>
  );
}
