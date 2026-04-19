import { useState } from 'react';
import { signIn, signInWithRedirect } from 'aws-amplify/auth';
import { AuthCard } from './AuthCard';
import { FormField } from './FormField';
import { SocialButton }  from './SocialButton';
import { GoogleIcon }    from '../icons/GoogleIcon';
import { MicrosoftIcon } from '../icons/MicrosoftIcon';
import { FacebookIcon }  from '../icons/FacebookIcon';
import { AppleIcon }     from '../icons/AppleIcon';

interface SignInProps {
  onSuccess: () => void;
  onSignUp: () => void;
  onForgotPassword: () => void;
  onConfirmRequired: (email: string) => void;
}

export function SignIn({ onSuccess, onSignUp, onForgotPassword, onConfirmRequired }: SignInProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Forgot-provider inline state
  const [showForgot, setShowForgot]     = useState(false);
  const [forgotEmail, setForgotEmail]   = useState('');
  const [forgotSent, setForgotSent]     = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      const result = await signIn({ username: email.trim().toLowerCase(), password });
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        onConfirmRequired(email.trim().toLowerCase());
        return;
      }
      if (result.isSignedIn) {
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      if (msg.includes('User is not confirmed')) {
        onConfirmRequired(email.trim().toLowerCase());
      } else if (msg.includes('Incorrect username or password')) {
        setError('Incorrect email or password.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotError('');
    setForgotLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_AUTH_API_URL as string | undefined;
      if (!apiUrl) throw new Error('API not configured');

      const res = await fetch(`${apiUrl}auth/lookup-provider`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      if (res.status === 429) {
        setForgotError('Too many requests. Please try again in 15 minutes.');
        return;
      }
      setForgotSent(true);
    } catch {
      setForgotError('Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to Transformotion Apps"
      error={error}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="signin-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={loading}
        />
        <FormField
          id="signin-password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={loading}
        />

        <button
          type="button"
          onClick={onForgotPassword}
          className="text-xs text-[var(--color-accent)] hover:underline text-left -mt-2"
        >
          Forgot password?
        </button>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* ── Social sign-in ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pt-2 border-t border-[var(--color-border)]">
        <p
          className="text-xs text-center"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}
        >
          Or continue with
        </p>

        <div className="grid grid-cols-2 gap-2">
          <SocialButton label="Google"    bg="#ffffff"            textColor="#3c4043" onClick={() => signInWithRedirect({ provider: 'Google' })}><GoogleIcon    size={18} /></SocialButton>
          <SocialButton label="Microsoft" bg="#ffffff"            textColor="#3c4043" onClick={() => signInWithRedirect({ provider: { custom: 'Microsoft' } })}><MicrosoftIcon size={18} /></SocialButton>
          <SocialButton label="Facebook"  bg="#1877F2"            textColor="#ffffff" onClick={() => signInWithRedirect({ provider: 'Facebook' })}><FacebookIcon  size={18} /></SocialButton>
          <SocialButton label="Apple"     bg="var(--color-navy3)" textColor="var(--color-text-muted)" disabled title="Apple Sign-In coming soon"><AppleIcon size={18} /></SocialButton>
        </div>

        {/* Forgot which provider ───────────────────────────────────── */}
        {!showForgot && (
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="text-xs text-center hover:underline"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}
          >
            Forgot how you signed in?
          </button>
        )}

        {showForgot && !forgotSent && (
          <form onSubmit={handleForgotProvider} className="flex flex-col gap-2">
            <FormField
              id="forgot-provider-email"
              label="Your email"
              type="email"
              value={forgotEmail}
              onChange={setForgotEmail}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={forgotLoading}
              error={forgotError}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={forgotLoading || !forgotEmail}
                className="flex-1 bg-[var(--color-navy3)] hover:bg-[var(--color-navy)] text-[var(--color-text-primary)] font-medium rounded-lg py-2 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: 'var(--font-body)', border: '1px solid var(--color-border)' }}
              >
                {forgotLoading ? 'Sending…' : 'Send me a hint'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForgot(false); setForgotEmail(''); setForgotError(''); }}
                className="px-3 rounded-lg text-xs transition-colors"
                style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', border: '1px solid var(--color-border)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showForgot && forgotSent && (
          <p
            className="text-xs text-center rounded-lg px-3 py-2.5"
            style={{
              color:      'var(--color-teal)',
              background: 'color-mix(in srgb, var(--color-teal) 10%, var(--color-ink))',
              border:     '1px solid color-mix(in srgb, var(--color-teal) 30%, transparent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            If we found an account with that email, we've sent you a hint.
          </p>
        )}
      </div>

      <p className="text-sm text-[var(--color-text-muted)] text-center pt-2 border-t border-[var(--color-border)]">
        No account?{' '}
        <button onClick={onSignUp} className="text-[var(--color-accent)] hover:underline font-medium">
          Create one
        </button>
      </p>
    </AuthCard>
  );
}
