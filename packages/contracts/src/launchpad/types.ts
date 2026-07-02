import type { AccountId, EmailAddress, ISODateTime, UnixSeconds, UserId } from '../_shared/api';
import type { AccountRole, EntitledAppSlug, UserPreferences, UserProfile } from '../_shared/auth';
import type {
  AiConfigAppSlug,
  AiRuntimeConfigRecord,
  AiRuntimeConfigResponse,
  AiRuntimeConfigUpdate,
  ResolvedAiRuntimeConfig,
} from '../_shared/ai-runtime';

export type LaunchpadContractVersion = 'm16.1.0';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type AccountPlan = 'free' | 'standard' | 'enterprise';
export type AppAvailability = 'available' | 'unavailable';

export interface CognitoAppClientContract {
  appSlug: 'launchpad' | EntitledAppSlug;
  callbackPaths: string[];
  logoutPath: string;
  oauthScopes: readonly ['openid', 'email', 'profile'];
  publicClient: true;
}

/**
 * App-scoped account. M16 invariant: every account belongs to exactly one
 * entitled app. `appSlug` remains optional in the type for backwards
 * compatibility with pre-M16 records, but the control-plane MUST set it on
 * all new accounts and MUST treat it as required for invitation,
 * provisioning, and membership operations.
 */
export interface AccountSummary {
  accountId: AccountId;
  appSlug?: EntitledAppSlug;
  name: string;
  ownerId?: UserId;
  plan?: AccountPlan;
  createdAt?: ISODateTime;
  updatedAt?: ISODateTime;
}

export interface AccountMember {
  accountId?: AccountId;
  userId: UserId;
  email?: EmailAddress;
  role: AccountRole;
  joinedAt: ISODateTime;
}

export interface Invitation {
  invitationId: string;
  accountId: AccountId;
  email: EmailAddress;
  invitedBy: UserId;
  createdAt: ISODateTime;
  expiresAt: UnixSeconds;
  status: InvitationStatus;
}

export interface LookupProviderRequest {
  email: EmailAddress;
}

export interface LookupProviderResponse {
  message: string;
}

export interface AccountSetupRequest {
  kind: 'id-token-derived';
}

/**
 * M16 D11: `/auth/setup` is profile-bootstrap only — it ensures the user's
 * profile record exists and NEVER auto-provisions an account. Access is
 * acquired exclusively via invitation-bundle redemption.
 */
export interface AccountSetupResponse {
  /**
   * Omitted for a fresh profile-only bootstrap (user has no account yet).
   * When the user already holds memberships, the control-plane MAY surface a
   * convenience account id here. Absence means "no account", NOT an error.
   */
  accountId?: AccountId;
  /** True when THIS call created the user's profile record (first login). */
  userCreated: boolean;
  /** False until first-time profile setup completes (parity with redemption). */
  profileComplete: boolean;
}

export interface AppRegistryEntry {
  slug: EntitledAppSlug;
  label: string;
  href: string;
  availability: AppAvailability;
}

export interface LaunchpadTile {
  app: AppRegistryEntry;
  visible: boolean;
  reason: 'entitled' | 'site-admin' | 'unavailable';
}

export interface SiteAdminSettingsState {
  canManageAiRuntimeConfig: boolean;
  canManageAccounts: boolean;
  canManageInvitations: boolean;
}

export type LaunchpadAiRuntimeConfigRecord = AiRuntimeConfigRecord;
export type LaunchpadAiRuntimeConfigUpdate = AiRuntimeConfigUpdate;
export type LaunchpadAiRuntimeConfigResponse = AiRuntimeConfigResponse;
export type LaunchpadResolvedAiRuntimeConfig = ResolvedAiRuntimeConfig;
export type LaunchpadAiConfigAppSlug = AiConfigAppSlug;

export const launchpadContractVersion = 'm16.1.0' as const satisfies LaunchpadContractVersion;

export const exampleCognitoAppClient = {
  appSlug: 'stock-analyser',
  callbackPaths: ['/stock-analyser/callback'],
  logoutPath: '/signed-out/',
  oauthScopes: ['openid', 'email', 'profile'],
  publicClient: true,
} as const satisfies CognitoAppClientContract;

export const exampleUserProfile = {
  userId: 'user-123',
  email: 'owner@example.com',
  displayName: 'Account Owner',
  status: 'active',
  preferences: {
    notificationsEnabled: true,
  },
  profileComplete: true,
  updatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies UserProfile;

export const exampleUserPreferences = {
  notificationsEnabled: true,
} as const satisfies UserPreferences;

export const exampleAccount = {
  accountId: 'acct-123',
  appSlug: 'budget-tracker',
  name: 'Household',
  ownerId: 'user-123',
  plan: 'standard',
  createdAt: '2026-06-07T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies AccountSummary;

export const exampleAccountMember = {
  accountId: 'acct-123',
  userId: 'user-456',
  email: 'member@example.com',
  role: 'member',
  joinedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies AccountMember;

export const exampleInvitation = {
  invitationId: 'inv-123',
  accountId: 'acct-123',
  email: 'invitee@example.com',
  invitedBy: 'user-123',
  createdAt: '2026-06-07T00:00:00.000Z',
  expiresAt: 1798761600,
  status: 'pending',
} as const satisfies Invitation;

export const exampleLaunchpadTile = {
  app: {
    slug: 'stock-analyser',
    label: 'Stock Analyser',
    href: '/stock-analyser',
    availability: 'available',
  },
  visible: true,
  reason: 'entitled',
} as const satisfies LaunchpadTile;
