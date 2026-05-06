'use client'

// Importing authService triggers CognitoAuthService instantiation (and thus
// Amplify.configure()) when the runtime profile resolves to 'cognito'.
// This component ensures that happens before any auth calls in the tree.
import '@/lib/services/auth'

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
