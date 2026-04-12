import { useState } from 'react';
import { signIn } from 'aws-amplify/auth';
import { AuthCard } from './AuthCard';
import { FormField } from './FormField';

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

      <p className="text-sm text-[var(--color-text-muted)] text-center pt-2 border-t border-[var(--color-border)]">
        No account?{' '}
        <button onClick={onSignUp} className="text-[var(--color-accent)] hover:underline font-medium">
          Create one
        </button>
      </p>
    </AuthCard>
  );
}
