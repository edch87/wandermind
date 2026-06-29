import { useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setMessage('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (mode === 'new-password' && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

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
    ? mode === 'login'
      ? 'Signing in…'
      : mode === 'signup'
        ? 'Creating account…'
        : mode === 'reset'
          ? 'Sending link…'
          : 'Updating…'
    : mode === 'login'
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'reset'
          ? 'Send reset link'
          : 'Update password';

  const showMarketing = mode === 'login' || mode === 'signup';
  const resetSent = mode === 'reset' && !!message;

  const labelClass = 'text-xs font-medium text-sand-700 uppercase tracking-wider mb-1.5 block';
  const inputClass =
    'w-full px-4 py-3 border border-sand-200 rounded-[12px] text-base text-sand-900 placeholder:text-sand-400 focus:outline-none focus:ring-2 focus:ring-sand-700 focus:border-sand-700 bg-white';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 bg-gradient-to-b from-sand-100 to-sand-50">
      <div className="w-full max-w-xs">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <KiteIcon size={56} className="text-sand-900" animate />
          </div>
          <h1 className="text-3xl font-semibold text-sand-900 mb-1">{title}</h1>
          <p className="text-sand-700 text-sm italic mb-3">{tagline}</p>
          {showMarketing && (
            <p className="text-sand-700 text-sm leading-relaxed max-w-[260px] mx-auto">
              Save places you want to visit. When you have free time, we'll suggest the perfect one based on weather, mood, and who you're with.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className={labelClass}>Your name</label>
              <input
                id="auth-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                required
                autoComplete="name"
                autoCapitalize="words"
                className={inputClass}
              />
            </div>
          )}

          {mode !== 'new-password' && (
            <div>
              <label htmlFor="auth-email" className={labelClass}>Email</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputClass}
              />
            </div>
          )}

          {(mode === 'login' || mode === 'signup' || mode === 'new-password') && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor="auth-password" className="text-xs font-medium text-sand-700 uppercase tracking-wider block">
                  {mode === 'new-password' ? 'New password' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-sm text-sand-700 underline underline-offset-2 hover:text-sand-900 px-2 -mr-2 min-h-[44px] inline-flex items-center rounded focus:outline-none focus:ring-2 focus:ring-sand-700"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className={inputClass + ' pr-12'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-sand-700 hover:text-sand-900 rounded-md focus:outline-none focus:ring-2 focus:ring-sand-700"
                >
                  {showPassword ? <EyeSlash size={20} weight="regular" /> : <Eye size={20} weight="regular" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'new-password' && (
            <div>
              <label htmlFor="auth-confirm" className={labelClass}>Confirm new password</label>
              <div className="relative">
                <input
                  id="auth-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type it again"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputClass + ' pr-12'}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  aria-pressed={showConfirm}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-sand-700 hover:text-sand-900 rounded-md focus:outline-none focus:ring-2 focus:ring-sand-700"
                >
                  {showConfirm ? <EyeSlash size={20} weight="regular" /> : <Eye size={20} weight="regular" />}
                </button>
              </div>
            </div>
          )}

          <div aria-live="polite" className="space-y-2">
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-[10px] px-3 py-2 text-sm leading-snug">
                {error}
              </div>
            )}
            {message && !error && (
              <div className="bg-forest-50 border border-forest-100 text-forest-600 rounded-[10px] px-3 py-2 text-sm leading-snug">
                {message}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sand-900 text-sand-100 py-4 rounded-full font-semibold text-base hover:bg-sand-800 disabled:opacity-50 transition mt-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-sand-700 focus:ring-offset-2 focus:ring-offset-sand-50"
          >
            {submitLabel}
          </button>

          {mode === 'signup' && (
            <p className="text-xs text-sand-600 text-center leading-relaxed mt-2">
              We'll send a confirmation email before your first sign-in.
            </p>
          )}
        </form>

        {resetSent && (
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="w-full mt-3 py-3 rounded-full border border-sand-300 text-sand-900 font-medium text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-sand-700"
          >
            Back to sign in
          </button>
        )}

        <p className="text-center text-base text-sand-700 mt-6">
          {mode === 'login' && (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-sand-900 font-medium underline underline-offset-2 px-2 py-2 rounded focus:outline-none focus:ring-2 focus:ring-sand-700"
              >
                Sign up
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-sand-900 font-medium underline underline-offset-2 px-2 py-2 rounded focus:outline-none focus:ring-2 focus:ring-sand-700"
              >
                Sign in
              </button>
            </>
          )}
          {mode === 'reset' && (
            <>
              Remembered it?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-sand-900 font-medium underline underline-offset-2 px-2 py-2 rounded focus:outline-none focus:ring-2 focus:ring-sand-700"
              >
                Back to sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
