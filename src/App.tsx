import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './utils/supabase';
import { getProfile, getItems, saveProfile, saveItem, deleteItem } from './utils/storage';
import type { UserProfile, BucketListItem } from './types';
import type { Session } from '@supabase/supabase-js';
import { House, ClipboardText, Plus, Gear } from '@phosphor-icons/react';
import KiteIcon from './components/KiteIcon';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import AddPlace from './components/AddPlace';
import BucketList from './components/BucketList';
import ItemDetail from './components/ItemDetail';
import RecommendationFlow from './components/RecommendationFlow';
import Settings from './components/Settings';

type Screen =
  | { name: 'dashboard' }
  | { name: 'add' }
  | { name: 'list'; initialTab?: 'want_to_do' | 'done' }
  | { name: 'detail'; itemId: string }
  | { name: 'recommend' }
  | { name: 'settings' };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<BucketListItem[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: 'dashboard' });
  const [dataLoading, setDataLoading] = useState(false);

  // Listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user data when authenticated
  const loadUserData = useCallback(async () => {
    if (!session) return;
    setDataLoading(true);
    const [p, i] = await Promise.all([getProfile(), getItems()]);
    setProfile(p);
    setItems(i);
    setDataLoading(false);
  }, [session]);

  useEffect(() => {
    if (session) loadUserData();
  }, [session, loadUserData]);

  // Scroll to top on every screen change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [screen]);

  const refreshItems = async () => {
    const i = await getItems();
    setItems(i);
  };

  const handleSaveProfile = async (p: UserProfile) => {
    await saveProfile(p);
    setProfile(p);
  };

  const handleSaveItem = async (item: BucketListItem) => {
    await saveItem(item);
    await refreshItems();
  };

  const handleDeleteItem = async (id: string) => {
    await deleteItem(id);
    await refreshItems();
    setScreen({ name: 'list' });
  };

  const handleSignOut = () => {
    setSession(null);
    setProfile(null);
    setItems([]);
    setScreen({ name: 'dashboard' });
  };

  // Auth loading
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand-50">
        <div className="text-sand-700 text-lg font-medium">Loading...</div>
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return <AuthScreen onAuthSuccess={() => {}} />;
  }

  // Data loading
  if (dataLoading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand-50">
        <div className="text-sand-700 text-lg font-medium">Loading your data...</div>
      </div>
    );
  }

  // Needs onboarding
  if (!profile || !profile.onboardingComplete) {
    return (
      <Onboarding
        displayName={session.user.user_metadata?.display_name || ''}
        onComplete={(p) => {
          handleSaveProfile(p);
          setScreen({ name: 'dashboard' });
        }}
      />
    );
  }

  const navigate = (s: Screen) => setScreen(s);

  // Navigation bar component
  const navItems: { Icon: React.ComponentType<{ size?: number; weight?: string }>; label: string; s: Screen }[] = [
    { Icon: House, label: 'Home', s: { name: 'dashboard' } },
    { Icon: ClipboardText, label: 'My List', s: { name: 'list' } },
    { Icon: Plus, label: 'Add', s: { name: 'add' } },
    { Icon: KiteIcon, label: 'Suggest', s: { name: 'recommend' } },
    { Icon: Gear, label: 'Settings', s: { name: 'settings' } },
  ];

  const NavBar = () => (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/95 backdrop-blur border-t border-sand-200 px-2 pt-2 z-50"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex justify-around">
        {navItems.map(({ Icon, label, s }) => {
          const isActive = screen.name === s.name;
          return (
            <button
              key={s.name}
              onClick={() => navigate(s)}
              className={`flex flex-col items-center py-2.5 px-3 rounded-lg transition-colors min-w-[56px] ${
                isActive ? 'text-sand-900' : 'text-sand-500 hover:text-sand-700'
              }`}
            >
              <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
              <span className="text-[10px] font-medium mt-1">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
      {screen.name === 'dashboard' && (
        <Dashboard
          profile={profile}
          items={items}
          onNavigate={(s) => navigate(s as Screen)}
          onSaveProfile={handleSaveProfile}
        />
      )}
      {screen.name === 'add' && (
        <AddPlace
          profile={profile}
          onSave={(item) => {
            handleSaveItem(item);
            setScreen({ name: 'list' });
          }}
          onBack={() => setScreen({ name: 'dashboard' })}
        />
      )}
      {screen.name === 'list' && (
        <BucketList
          items={items}
          initialTab={screen.initialTab}
          onSelectItem={(id) => setScreen({ name: 'detail', itemId: id })}
          onNavigate={(s) => navigate(s as Screen)}
        />
      )}
      {screen.name === 'detail' && (
        <ItemDetail
          item={items.find(i => i.id === screen.itemId)!}
          onBack={() => setScreen({ name: 'list' })}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
        />
      )}
      {screen.name === 'recommend' && (
        <RecommendationFlow
          profile={profile}
          items={items}
          onBack={() => setScreen({ name: 'dashboard' })}
          onViewItem={(id) => setScreen({ name: 'detail', itemId: id })}
        />
      )}
      {screen.name === 'settings' && (
        <Settings
          profile={profile}
          onSave={handleSaveProfile}
          onBack={() => setScreen({ name: 'dashboard' })}
          onSignOut={handleSignOut}
        />
      )}
      <NavBar />
    </div>
  );
}
