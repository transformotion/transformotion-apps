import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Landing page for the OAuth2 /callback route.
 *
 * After a social sign-in, Cognito redirects back to /callback?code=...&state=...
 * Amplify automatically intercepts the code and exchanges it for tokens.
 * This component waits for the result via two mechanisms:
 *   1. AuthContext already loaded (fast path — Amplify finished before mount)
 *   2. Hub 'signedIn' event (normal path — async code exchange in progress)
 *
 * On signInWithRedirect_failure, redirects to /auth so the user can try again.
 */
export function OAuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  // Fast path: AuthContext already reflects the new session
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Normal path: Amplify fires Hub event once code exchange completes
  useEffect(() => {
    const cancel = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        navigate('/', { replace: true });
      } else if (payload.event === 'signInWithRedirect_failure') {
        navigate('/auth', { replace: true });
      }
    });
    return cancel;
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-navy)' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--color-teal)', borderTopColor: 'transparent' }}
        />
        <p
          className="text-sm"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}
        >
          Signing you in…
        </p>
      </div>
    </div>
  );
}
