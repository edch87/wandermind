import { useState } from 'react';
import { supabase } from '../utils/supabase';
import KiteIcon from './KiteIcon';

type Mode = 'login' | 'signup' | 'reset' | 'new-password';

interface Props {
  onAuthSuccess: () => void;
  initialMode?: Mode;
  onPasswordUpdated?: () => void;
}

export default function AuthScreen({ onAuthSuccess, initialMode = 'login', onPasswordUpdated }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (signUpError) throw signUpError;
        setMessage('Check your email for a confirmation link, then sign in.');
        setMode('login');
      } else if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        onAuthSuccess();
      } else if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        });
        if (resetError) throw resetError;
        setMessage("If an account exists for that email, we've sent a reset link.");
      } else if (mode === 'new-password') {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage('Password updated. You can keep going.');
        onPasswordUpdated?.();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'new-password' ? 'Set a new password' : mode === 'reset' ? 'Reset your password' : 'Lark';
  const tagline = mode === 'new-password'
    ? 'Pick something memorable. At least 6 characters.'
    : mode === 'reset'
      ? "Enter your email and we'll send you a link."
      : 'An activity done for enjoyment or amusement';

  const submitLabel = loading
    ? 'Please wait...'
    : mode === 'login'
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'reset'
          ? 'Send reset link'
          : 'Update password';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 bg-sand-50">
      <div className="w-full max-w-xs">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <KiteIcon size={40} className="text-sand-900" />
          </div>
          <h1 className="text-3xl font-semibold text-sand-900 mb-1">{title}</h1>
          <p className="text-sand-700 text-sm italic mb-3">{tagline}</p>
          {mode === 'login' && (
            <p className="text-sand-700 text-sm leading-relaxed max-w-[260px] mx-auto">
              Save places you want to visit. When you have free time, we'll suggest the perfect one based on weather, mood, and who you're with.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="text-xs font-medium text-sand-600 uppercase tracking-wider mb-1.5 block">
                What should we call you?
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                required
                className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white"
              />
            </div>
          )}

          {mode !== 'new-password' && (
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
                className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white"
              />
            </div>
          )}

          {(mode === 'login' || mode === 'signup' || mode === 'new-password') && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-xs font-medium text-sand-600 uppercase tracking-wider block">
                  {mode === 'new-password' ? 'New password' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs text-sand-700 underline underline-offset-2 hover:text-sand-900"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                className="w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:border-sand-500 bg-white"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 px-1">{error}</p>
          )}
          {message && (
            <p className="text-xs text-forest-600 px-1">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-base hover:bg-sand-800 disabled:opacity-50 transition mt-2"
          >
            {submitLabel}
          </button>
        </form>

        <p className="text-center text-sm text-sand-700 mt-6">
          {mode === 'login' && (
            <>
              Don't have an account?{' '}
              <button onClick={() => switchMode('signup')}
                className="text-sand-900 font-medium underline underline-offset-2">
                Sign up
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              Already have an account?{' '}
              <button onClick={() => switchMode('login')}
                className="text-sand-900 font-medium underline underline-offset-2">
                Sign in
              </button>
            </>
          )}
          {mode === 'reset' && (
            <>
              Remembered it?{' '}
              <button onClick={() => switchMode('login')}
                className="text-sand-900 font-medium underline underline-offset-2">
                Back to sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
