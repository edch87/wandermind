import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { searchPlaces, reverseGeocode, HERE_TILE_URL, HERE_TILE_ATTRIBUTION } from '../utils/api';
import { supabase } from '../utils/supabase';
import { markHomePinRefined } from '../utils/homePinPrompt';
import type { UserProfile, HereSearchResult } from '../types';

interface Props {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onBack: () => void;
  onSignOut: () => void;
}

export default function Settings({ profile, onSave, onBack, onSignOut }: Props) {
  const [name, setName] = useState(profile.displayName);
  const [homeAddress, setHomeAddress] = useState(profile.homeAddress);
  const [homeLat, setHomeLat] = useState(profile.homeLatitude);
  const [homeLng, setHomeLng] = useState(profile.homeLongitude);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HereSearchResult[]>([]);
  const [showLocationEdit, setShowLocationEdit] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (showLocationEdit && mapRef.current && !mapInstance.current) {
      const map = L.map(mapRef.current).setView([homeLat, homeLng], 14);
      L.tileLayer(HERE_TILE_URL, { attribution: HERE_TILE_ATTRIBUTION }).addTo(map);
      const marker = L.marker([homeLat, homeLng], { draggable: true }).addTo(map);
      markerRef.current = marker;
      mapInstance.current = map;

      // Reverse-geocode whenever the pin moves so the address text reflects
      // the new location instead of a raw lat,lng pair.
      const updateFromMap = async (lat: number, lng: number) => {
        setHomeLat(lat);
        setHomeLng(lng);
        const geo = await reverseGeocode(lat, lng);
        setHomeAddress(geo?.address.label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      };

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        void updateFromMap(lat, lng);
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        void updateFromMap(lat, lng);
      });

      // Leaflet sometimes mis-measures its container on first render inside a
      // toggled section. Force a re-measure on the next tick.
      setTimeout(() => map.invalidateSize(), 0);
    }
    return () => { if (!showLocationEdit && mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; markerRef.current = null; } };
  }, [showLocationEdit]);

  const handleSearchLocation = async () => {
    if (!searchQuery.trim()) return;
    const results = await searchPlaces(searchQuery);
    setSearchResults(results);
  };

  const selectResult = (r: HereSearchResult) => {
    const lat = r.position.lat; const lng = r.position.lng;
    setHomeLat(lat); setHomeLng(lng); setHomeAddress(r.address.label);
    setSearchResults([]); setSearchQuery('');
    if (mapInstance.current) {
      mapInstance.current.setView([lat, lng], 14);
      if (markerRef.current) mapInstance.current.removeLayer(markerRef.current);
      markerRef.current = L.marker([lat, lng]).addTo(mapInstance.current);
    }
  };

  const [shareSaves, setShareSaves] = useState(profile.shareSaves !== false);

  const handleSave = () => {
    onSave({ ...profile, displayName: name,
      homeLatitude: homeLat, homeLongitude: homeLng, homeAddress, shareSaves });
    markHomePinRefined(profile.id);
    onBack();
  };

  return (
    <div className="page-enter px-6 py-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-sand-600 text-sm">←</button>
        <h2 className="text-xl font-semibold text-sand-900">Settings</h2>
      </div>

      <div className="space-y-6">
        <div>
          <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">Your name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 focus:outline-none focus:border-sand-500 bg-white" />
        </div>

        <div>
          <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1 block">Home location</label>
          <p className="text-xs text-sand-700 mb-2">{homeAddress.substring(0, 50)}{homeAddress.length > 50 ? '...' : ''}</p>
          <button onClick={() => setShowLocationEdit(!showLocationEdit)}
            className="text-sm text-terra-500 font-medium">{showLocationEdit ? 'Hide map' : 'Change location'}</button>
          {showLocationEdit && (
            <div className="mt-3">
              <div className="flex gap-2 mb-2">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchLocation()}
                  placeholder="Search..."
                  className="flex-1 px-3 py-2.5 border border-sand-200 rounded-[12px] text-base focus:outline-none focus:border-sand-500 bg-white" />
                <button onClick={handleSearchLocation}
                  className="px-4 py-2.5 bg-sand-900 text-sand-100 rounded-full text-sm font-medium">Search</button>
              </div>
              {searchResults.length > 0 && (
                <div className="bg-white border border-sand-200 rounded-[12px] mb-2 max-h-32 overflow-auto">
                  {searchResults.map(r => (
                    <button key={r.id} onClick={() => selectResult(r)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-sand-50 border-b border-sand-100 last:border-0">{r.address.label}</button>
                  ))}
                </div>
              )}
              <div ref={mapRef} className="w-full h-48 rounded-[20px] border border-sand-200" />
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1 block">Privacy</label>
          <button onClick={() => setShareSaves(!shareSaves)}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-sand-200 rounded-[12px] text-left">
            <div className="flex-1 pr-3">
              <div className="text-sm font-medium text-sand-900">Share my saves anonymously</div>
              <div className="text-[11px] text-sand-600 mt-0.5">
                Helps other larkers discover places. Only the place and a count are ever shown
                ("Saved by 12 people") — never your name, notes, or anything else.
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full flex-shrink-0 transition-colors relative ${shareSaves ? 'bg-forest-500' : 'bg-sand-300'}`}>
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${shareSaves ? 'left-[22px]' : 'left-0.5'}`} />
            </div>
          </button>
        </div>

        <button onClick={handleSave}
          className="w-full bg-sand-900 text-sand-100 py-3.5 rounded-full font-semibold hover:bg-sand-800 transition">Save changes</button>

        <div className="pt-4 border-t border-sand-200 space-y-3">
          <button onClick={async () => { await supabase.auth.signOut(); onSignOut(); }}
            className="w-full py-3 rounded-full text-sand-700 text-sm font-medium border border-sand-200 hover:bg-sand-50 transition">Sign out</button>

          <button onClick={async () => {
            if (confirm('This will delete all your saved places. Are you sure?')) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase.from('bucket_list_items').delete().eq('user_id', user.id);
                await supabase.from('profiles').update({ onboarding_complete: false, display_name: '' }).eq('id', user.id);
              }
              window.location.reload();
            }
          }}
            className="w-full py-3 rounded-full text-terra-500 text-sm font-medium border border-terra-500/20 hover:bg-terra-500/5">Reset all data</button>
          <p className="text-[10px] text-sand-600 mt-2 text-center">Deletes all saved places and resets settings</p>
        </div>

        <p className="text-[10px] text-sand-400 text-center pb-4">Lark v1.0</p>
      </div>
    </div>
  );
}
