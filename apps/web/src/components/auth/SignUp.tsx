import { useState } from 'react';
import { signUp } from 'aws-amplify/auth';
import { AuthCard } from './AuthCard';
import { FormField } from './FormField';
import { UserPlusIcon } from '../icons/UserPlusIcon';

interface SignUpProps {
  onSuccess: (email: string) => void;
  onSignIn: () => void;
}

export function SignUp({ onSuccess, onSignIn }: SignUpProps) {
  const [givenName, setGivenName] = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(false);

  function validate() {
    const errs: Record<string, string> = {};
    if (!givenName.trim()) errs.givenName = 'Name is required';
    if (!email.trim())     errs.email     = 'Email is required';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) errs.password = 'Password needs an uppercase letter';
    if (!/[0-9]/.test(password)) errs.password = 'Password needs a number';
    if (confirm !== password)   errs.confirm  = 'Passwords do not match';
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
      await signUp({
        username: email.trim().toLowerCase(),
        password,
        options: {
          userAttributes: {
            email: email.trim().toLowerCase(),
            given_name: givenName.trim(),
          },
        },
      });
      onSuccess(email.trim().toLowerCase());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed';
      if (msg.includes('already exists') || msg.includes('UsernameExistsException')) {
        setError('An account with this email already exists. Try signing in.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Join Transformotion Apps"
      icon={<UserPlusIcon size={28} />}
      error={error}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="signup-name"
          label="First name"
          value={givenName}
          onChange={setGivenName}
          placeholder="Alex"
          autoComplete="given-name"
          disabled={loading}
          error={fieldErrors.givenName}
        />
        <FormField
          id="signup-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={loading}
          error={fieldErrors.email}
        />
        <FormField
          id="signup-password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          autoComplete="new-password"
          disabled={loading}
          error={fieldErrors.password}
        />
        <FormField
          id="signup-confirm"
          label="Confirm password"
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
          className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-[var(--color-text-muted)] text-center pt-2 border-t border-[var(--color-border)]">
        Already have an account?{' '}
        <button onClick={onSignIn} className="text-[var(--color-accent)] hover:underline font-medium">
          Sign in
        </button>
      </p>
    </AuthCard>
  );
}
