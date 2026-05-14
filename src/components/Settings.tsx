import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { searchPlaces } from '../utils/api';
import type { UserProfile, TransportMode, NominatimResult } from '../types';

interface Props {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onBack: () => void;
}

export default function Settings({ profile, onSave, onBack }: Props) {
  const [name, setName] = useState(profile.displayName);
  const [transport, setTransport] = useState<TransportMode>(profile.preferredTransport);
  const [hasDog, setHasDog] = useState(profile.hasDog);
  const [hasKids, setHasKids] = useState(profile.hasKids);
  const [homeAddress, setHomeAddress] = useState(profile.homeAddress);
  const [homeLat, setHomeLat] = useState(profile.homeLatitude);
  const [homeLng, setHomeLng] = useState(profile.homeLongitude);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [showLocationEdit, setShowLocationEdit] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (showLocationEdit && mapRef.current && !mapInstance.current) {
      const map = L.map(mapRef.current).setView([homeLat, homeLng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM',
      }).addTo(map);
      markerRef.current = L.marker([homeLat, homeLng]).addTo(map);
      mapInstance.current = map;

      map.on('click', (e: L.LeafletMouseEvent) => {
        setHomeLat(e.latlng.lat);
        setHomeLng(e.latlng.lng);
        setHomeAddress(`${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
        if (markerRef.current) map.removeLayer(markerRef.current);
        markerRef.current = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
      });
    }
    return () => {
      if (!showLocationEdit && mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [showLocationEdit]);

  const handleSearchLocation = async () => {
    if (!searchQuery.trim()) return;
    const results = await searchPlaces(searchQuery);
    setSearchResults(results);
  };

  const selectResult = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    setHomeLat(lat);
    setHomeLng(lng);
    setHomeAddress(r.display_name);
    setSearchResults([]);
    setSearchQuery('');
    if (mapInstance.current) {
      mapInstance.current.setView([lat, lng], 14);
      if (markerRef.current) mapInstance.current.removeLayer(markerRef.current);
      markerRef.current = L.marker([lat, lng]).addTo(mapInstance.current);
    }
  };

  const handleSave = () => {
    onSave({
      ...profile,
      displayName: name,
      preferredTransport: transport,
      hasDog,
      hasKids,
      homeLatitude: homeLat,
      homeLongitude: homeLng,
      homeAddress,
    });
    onBack();
  };

  const handleResetApp = () => {
    if (confirm('This will delete all your data. Are you sure?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="px-5 py-6 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
      </div>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
        </div>

        {/* Transport */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred transport</label>
          <div className="toggle-group">
            {([['car', '🚗 Car'], ['bike', '🚲 Bike'], ['transit', '🚆 Transit'], ['walk', '🚶 Walk']] as const).map(([val, label]) => (
              <button key={val} className={`toggle-btn ${transport === val ? 'active' : ''}`}
                onClick={() => setTransport(val as TransportMode)}>{label}</button>
            ))}
          </div>
        </div>

        {/* Household */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Household</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={hasKids} onChange={(e) => setHasKids(e.target.checked)}
                className="w-5 h-5 rounded text-teal-500" />
              <span className="text-sm text-gray-700">👶 I have kids</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={hasDog} onChange={(e) => setHasDog(e.target.checked)}
                className="w-5 h-5 rounded text-teal-500" />
              <span className="text-sm text-gray-700">🐕 I have a dog</span>
            </label>
          </div>
        </div>

        {/* Home location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Home location</label>
          <p className="text-xs text-gray-500 mb-2">{homeAddress.substring(0, 50)}{homeAddress.length > 50 ? '...' : ''}</p>
          <button onClick={() => setShowLocationEdit(!showLocationEdit)}
            className="text-sm text-teal-500 font-medium">
            {showLocationEdit ? 'Hide map' : 'Change location'}
          </button>

          {showLocationEdit && (
            <div className="mt-3">
              <div className="flex gap-2 mb-2">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchLocation()}
                  placeholder="Search for new location..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal-500" />
                <button onClick={handleSearchLocation}
                  className="px-3 py-2 bg-teal-500 text-white rounded-lg text-sm">Search</button>
              </div>
              {searchResults.length > 0 && (
                <div className="bg-white border rounded-lg mb-2 max-h-32 overflow-auto">
                  {searchResults.map(r => (
                    <button key={r.place_id} onClick={() => selectResult(r)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 border-b last:border-0">
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
              <div ref={mapRef} className="w-full h-48 rounded-xl border border-gray-200" />
            </div>
          )}
        </div>

        {/* Save */}
        <button onClick={handleSave}
          className="w-full bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 transition">
          Save changes
        </button>

        {/* Reset */}
        <div className="pt-4 border-t border-gray-100">
          <button onClick={handleResetApp}
            className="w-full py-3 rounded-xl text-red-500 text-sm font-medium border border-red-200 hover:bg-red-50">
            Reset all data
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">This will delete all your saved places and settings.</p>
        </div>

        {/* About */}
        <div className="text-center pt-4">
          <p className="text-xs text-gray-400">WanderMind v1.0</p>
          <p className="text-xs text-gray-400 mt-1">Made with 🧭 for explorers</p>
        </div>
      </div>
    </div>
  );
}
