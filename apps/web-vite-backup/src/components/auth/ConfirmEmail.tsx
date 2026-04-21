import { useState } from 'react';
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import { AuthCard } from './AuthCard';
import { FormField } from './FormField';

interface ConfirmEmailProps {
  email: string;
  onSuccess: () => void;
  onSignIn: () => void;
}

export function ConfirmEmail({ email, onSuccess, onSignIn }: ConfirmEmailProps) {
  const [code, setCode]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError('');
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code.trim() });
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed';
      if (msg.includes('Invalid verification code')) {
        setError('That code is incorrect. Please check and try again.');
      } else if (msg.includes('expired')) {
        setError('Code has expired. Request a new one below.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    try {
      await resendSignUpCode({ username: email });
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend code');
    }
  }

  return (
    <AuthCard
      title="Check your email"
      subtitle={`We sent a 6-digit code to ${email}`}
      error={error}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="confirm-code"
          label="Verification code"
          type="text"
          value={code}
          onChange={setCode}
          placeholder="123456"
          autoComplete="one-time-code"
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Verifying…' : 'Verify email'}
        </button>
      </form>

      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
        {resent && (
          <p className="text-xs text-[var(--color-success)] text-center">Code resent — check your inbox.</p>
        )}
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          Didn't get it?{' '}
          <button onClick={handleResend} className="text-[var(--color-accent)] hover:underline font-medium">
            Resend code
          </button>
        </p>
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          <button onClick={onSignIn} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs hover:underline">
            ← Back to sign in
          </button>
        </p>
      </div>
    </AuthCard>
  );
}
