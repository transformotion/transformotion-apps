import { useState } from 'react';
import { confirmResetPassword } from 'aws-amplify/auth';
import { AuthCard } from './AuthCard';
import { FormField } from './FormField';

interface ResetPasswordProps {
  email: string;
  onSuccess: () => void;
  onSignIn: () => void;
}

export function ResetPassword({ email, onSuccess, onSignIn }: ResetPasswordProps) {
  const [code, setCode]         = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(false);

  function validate() {
    const errs: Record<string, string> = {};
    if (!code.trim())         errs.code     = 'Code is required';
    if (password.length < 8)  errs.password = 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) errs.password = 'Password needs an uppercase letter';
    if (!/[0-9]/.test(password)) errs.password = 'Password needs a number';
    if (confirm !== password) errs.confirm  = 'Passwords do not match';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setError('');
    setLoading(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code.trim(),
        newPassword: password,
      });
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      if (msg.includes('Invalid verification code')) {
        setError('That code is incorrect or has expired.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Set new password"
      subtitle={`Enter the code sent to ${email}`}
      error={error}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="reset-code"
          label="Reset code"
          type="text"
          value={code}
          onChange={setCode}
          placeholder="123456"
          autoComplete="one-time-code"
          disabled={loading}
          error={fieldErrors.code}
        />
        <FormField
          id="reset-password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          autoComplete="new-password"
          disabled={loading}
          error={fieldErrors.password}
        />
        <FormField
          id="reset-confirm"
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="••••••••"
          autoComplete="new-password"
          disabled={loading}
          error={fieldErrors.confirm}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Setting password…' : 'Set new password'}
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
