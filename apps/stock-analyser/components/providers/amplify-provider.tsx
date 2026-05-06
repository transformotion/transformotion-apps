'use client'

// Importing authService triggers CognitoAuthService instantiation (and thus
// Amplify.configure()) when NEXT_PUBLIC_AUTH_PROVIDER === 'cognito'.
// This component ensures that happens before any auth calls in the tree.
import '@/lib/services/auth'

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
