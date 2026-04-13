import { Amplify } from 'aws-amplify';

/**
 * Configure Amplify once at app startup (imported by main.tsx before rendering).
 * Values come from Vite env vars — set in .env.local for dev, injected by
 * the CD pipeline for prod.
 *
 * OAuth is configured for social IDP sign-in via Cognito Hosted UI.
 * window.location.origin is used for redirects so the same build works on
 * both localhost:3001 (dev) and dev.apps.transformotion.com.au (deployed).
 * Both origins must be listed in the Cognito client's allowed callback URLs.
 */
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:       import.meta.env.VITE_USER_POOL_ID       as string,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
      loginWith: {
        email: true,
        oauth: {
          domain:          import.meta.env.VITE_COGNITO_DOMAIN as string,
          scopes:          ['openid', 'email', 'profile'],
          redirectSignIn:  [`${window.location.origin}/callback`],
          redirectSignOut: [window.location.origin],
          responseType:    'code',
        },
      },
    },
  },
});
