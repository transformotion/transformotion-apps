import { useState } from 'react';
import { signIn } from 'aws-amplify/auth';
import { useAuth } from '../../contexts/AuthContext';
import { SignIn } from './SignIn';
import { SignUp } from './SignUp';
import { ConfirmEmail } from './ConfirmEmail';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';

type Screen = 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset';

/**
 * AuthPage — orchestrates all auth screens via local state.
 * Mounted by App.tsx when the user is not authenticated.
 */
export function AuthPage() {
  const { refresh } = useAuth();
  const [screen, setScreen]       = useState<Screen>('signin');
  const [pendingEmail, setPending] = useState('');

  async function handleConfirmSuccess() {
    // After email confirmation, auto sign-in is not triggered — user needs to
    // sign in manually. Redirect them to sign-in with the email pre-noted.
    setScreen('signin');
  }

  async function handleResetSuccess() {
    setScreen('signin');
  }

  async function handleSignInSuccess() {
    await refresh();
  }

  async function handleSignUpSuccess(email: string) {
    setPending(email);
    setScreen('confirm');
  }

  function handleConfirmRequired(email: string) {
    setPending(email);
    setScreen('confirm');
  }

  function handleForgotPasswordCodeSent(email: string) {
    setPending(email);
    setScreen('reset');
  }

  // After confirming email, auto-attempt sign-in isn't possible without the
  // password, so we just go back to sign-in. The sign-in screen will handle
  // cases where the user needs to sign in after confirming.
  void signIn; // suppress unused import warning — may be used in future

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
