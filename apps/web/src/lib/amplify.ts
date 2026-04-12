import { Amplify } from 'aws-amplify';

/**
 * Configure Amplify once at app startup (imported by main.tsx before rendering).
 * Values come from Vite env vars — set in .env.local for dev, injected by
 * the CD pipeline for prod.
 */
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:       import.meta.env.VITE_USER_POOL_ID as string,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
      loginWith: {
        email: true,
      },
    },
  },
});
