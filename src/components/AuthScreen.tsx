import { useState } from 'react';
import { supabase } from '../utils/supabase';
import KiteIcon from './KiteIcon';

interface Props {
  onAuthSuccess: () => void;
}

// Lark is invite-only while testing with friends and family — public signups
// are disabled in the Supabase dashboard (Authentication → Sign In / Up), so
// this screen only offers sign-in. New testers get an account from Edward.
export default function AuthScreen({ onAuthSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      onAuthSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 bg-sand-50">
      <div className="w-full max-w-xs">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <KiteIcon size={40} className="text-sand-900" />
          </div>
          <h1 className="text-3xl font-semibold text-sand-900 mb-1">Lark</h1>
          <p className="text-sand-700 text-sm italic mb-3">An activity done for enjoyment or amusement</p>
          <p className="text-sand-700 text-sm leading-relaxed max-w-[260px] mx-auto">
            Save places you want to visit. When you have free time, we'll suggest the perfect one based on weather, mood, and who you're with.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 px-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-base hover:bg-sand-800 disabled:opacity-50 transition mt-2"
          >
            {loading ? 'Please wait...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-sand-700 mt-6">
          Lark is currently invite-only while we test with friends and family. Want in? Ask Edward for an account.
        </p>
      </div>
    </div>
  );
}
