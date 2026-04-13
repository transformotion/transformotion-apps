import { useState } from 'react';
import { signIn, signInWithRedirect } from 'aws-amplify/auth';
import { AuthCard } from './AuthCard';
import { FormField } from './FormField';
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

      {/* ── Social sign-in ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pt-2 border-t border-[var(--color-border)]">
        <p
          className="text-xs text-center"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}
        >
          Or continue with
        </p>

        <div className="grid grid-cols-2 gap-2">
          {/* Google */}
          <SocialButton
            label="Google"
            bg="#ffffff"
            textColor="#3c4043"
            onClick={() => signInWithRedirect({ provider: 'Google' })}
          >
            <GoogleIcon size={18} />
          </SocialButton>

          {/* Microsoft */}
          <SocialButton
            label="Microsoft"
            bg="#ffffff"
            textColor="#3c4043"
            onClick={() => signInWithRedirect({ provider: { custom: 'Microsoft' } })}
          >
            <MicrosoftIcon size={18} />
          </SocialButton>

          {/* Facebook */}
          <SocialButton
            label="Facebook"
            bg="#1877F2"
            textColor="#ffffff"
            onClick={() => signInWithRedirect({ provider: 'Facebook' })}
          >
            <FacebookIcon size={18} />
          </SocialButton>

          {/* Apple — coming soon */}
          <SocialButton
            label="Apple"
            bg="var(--color-navy3)"
            textColor="var(--color-text-muted)"
            disabled
            title="Apple Sign-In coming soon"
          >
            <AppleIcon size={18} />
          </SocialButton>
        </div>
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

interface SocialButtonProps {
  label: string;
  bg: string;
  textColor: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}

function SocialButton({ label, bg, textColor, onClick, disabled, title, children }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background:  bg,
        color:       textColor,
        fontFamily:  'var(--font-body)',
        border:      '1px solid transparent',
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
