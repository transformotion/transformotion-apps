'use client'

// Importing cognito-auth triggers Amplify.configure() at module load.
// This component ensures that happens before any auth calls in the tree.
import '@/lib/services/auth/cognito-auth'

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
