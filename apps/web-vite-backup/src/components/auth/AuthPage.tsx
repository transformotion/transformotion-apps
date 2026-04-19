import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SignIn } from './SignIn';
import { SignUp } from './SignUp';
import { ConfirmEmail } from './ConfirmEmail';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';

type Screen = 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset';

/**
 * AuthPage — orchestrates all auth screens via local state.
 * Mounted at /auth by AppRouter when the user is not authenticated.
 *
 * After successful sign-in, navigates to location.state.from (the page
 * the user was trying to reach) or falls back to '/'.
 */
export function AuthPage() {
  const { isAuthenticated, isLoading, refresh } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();
  const from        = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const [screen, setScreen]        = useState<Screen>('signin');
  const [pendingEmail, setPending]  = useState('');

  // Navigate once the auth state has been committed to React — avoids a race
  // where navigate() is called before ProtectedRoute sees the new session.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  async function handleSignInSuccess() {
    await refresh();
    // Navigation is handled by the effect above once React commits the new session.
  }

  function handleSignUpSuccess(email: string) {
    setPending(email);
    setScreen('confirm');
  }

  function handleConfirmSuccess() {
    // After email confirmation the user still needs to sign in
    setScreen('signin');
  }

  function handleResetSuccess() {
    setScreen('signin');
  }

  function handleConfirmRequired(email: string) {
    setPending(email);
    setScreen('confirm');
  }

  function handleForgotPasswordCodeSent(email: string) {
    setPending(email);
    setScreen('reset');
  }

  switch (screen) {
    case 'signin':
      return (
        <SignIn
          onSuccess={handleSignInSuccess}
          onSignUp={() => setScreen('signup')}
          onForgotPassword={() => setScreen('forgot')}
          onConfirmRequired={handleConfirmRequired}
        />
      );
    case 'signup':
      return (
        <SignUp
          onSuccess={handleSignUpSuccess}
          onSignIn={() => setScreen('signin')}
        />
      );
    case 'confirm':
      return (
        <ConfirmEmail
          email={pendingEmail}
          onSuccess={handleConfirmSuccess}
          onSignIn={() => setScreen('signin')}
        />
      );
    case 'forgot':
      return (
        <ForgotPassword
          onCodeSent={handleForgotPasswordCodeSent}
          onSignIn={() => setScreen('signin')}
        />
      );
    case 'reset':
      return (
        <ResetPassword
          email={pendingEmail}
          onSuccess={handleResetSuccess}
          onSignIn={() => setScreen('signin')}
        />
      );
  }
}
