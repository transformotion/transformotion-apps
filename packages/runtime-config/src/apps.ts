/**
 * Canonical app registry — single source of truth for app slugs, Cognito
 * groups, CloudFront URL prefixes, and display labels across the monorepo.
 *
 * Import this to eliminate hardcoded slug/group strings from platform Lambdas,
 * CDK stacks, launchpad, and app configs.
 *
 * Slug values are the JWT claim key used in `accounts[slug]` and the URL
 * prefix served by CloudFront.
 */

export const APPS = [
  {
    slug:             'stock-analyser',
    cognitoGroup:     'stock-app-access',
    groupDescription: 'User has access to Stock Signal',
    urlPrefix:        '/stock-analyser',
    label:            'Stock Signal Analyser',
  },
  {
    slug:             'budget-tracker',
    cognitoGroup:     'budget-app-access',
    groupDescription: 'User has access to Budget Tracker',
    urlPrefix:        '/budget-tracker',
    label:            'Budget Tracker',
  },
] as const;

export type AppDescriptor = typeof APPS[number];
export type AppSlug = AppDescriptor['slug'];
export const APP_SLUGS = APPS.map(app => app.slug);

/** Launchpad auth route paths (used as config fallbacks in app config files). */
export const LP_AUTH_ROUTES = {
  signIn:    '/sign-in/',
  signedOut: '/signed-out/',
} as const;
