import type { EntitledAppSlug } from './auth';

export type RuntimeProfile = 'mock' | 'live';
export type AuthProvider = 'mock' | 'cognito';
export type DataProvider = 'local' | 'dynamo';
export type LogProvider = 'console' | 'cloudwatch';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeProviderSelection {
  profile: RuntimeProfile;
  auth: AuthProvider;
  data: DataProvider;
  ai: 'mock' | 'live';
  logProvider?: LogProvider;
  logLevel?: LogLevel;
}

export interface CognitoFrontendConfig {
  userPoolId: string;
  appClientId: string;
  region: string;
  signInUrl: string;
  signOutUrl: string;
  callbackPath: string;
}

export interface AppFrontendRuntimeConfig {
  appSlug: EntitledAppSlug | 'launchpad';
  profile: RuntimeProfile;
  apiUrl?: string;
  wssUrl?: string;
  cognito?: CognitoFrontendConfig;
  launchpadUrl?: string;
}

export const exampleRuntimeProviderSelection = {
  profile: 'live',
  auth: 'cognito',
  data: 'dynamo',
  ai: 'live',
  logProvider: 'console',
  logLevel: 'info',
} as const satisfies RuntimeProviderSelection;
