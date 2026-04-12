import { useState } from 'react';
import { resetPassword } from 'aws-amplify/auth';
import { AuthCard } from './AuthCard';
import { FormField } from './FormField';

interface ForgotPasswordProps {
  onCodeSent: (email: string) => void;
  onSignIn: () => void;
}

export function ForgotPassword({ onCodeSent, onSignIn }: ForgotPasswordProps) {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setLoading(true);
    try {
      await resetPassword({ username: email.trim().toLowerCase() });
      onCodeSent(email.trim().toLowerCase());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      // Don't reveal whether the account exists
      if (msg.includes('UserNotFoundException') || msg.includes('User does not exist')) {
        onCodeSent(email.trim().toLowerCase()); // silently continue
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Enter your email and we'll send a reset code"
      error={error}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="forgot-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Sending…' : 'Send reset code'}
        </button>
      </form>

      <p className="text-sm text-[var(--color-text-muted)] text-center pt-2 border-t border-[var(--color-border)]">
        <button onClick={onSignIn} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs hover:underline">
          ← Back to sign in
        </button>
      </p>
    </AuthCard>
  );
}
