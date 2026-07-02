import {
  exampleAiRuntimeConfigResponse,
  resolveEffectiveAiRuntimeConfig,
  SUPPORTED_AI_CONFIG_APP_SLUGS,
  type AiConfigAppSlug,
  type AiRuntimeConfigResponse,
  type AiRuntimeConfigUpdate,
} from '../_shared/ai-runtime';
import {
  getAllAppOverrides,
  getPlatformDefault,
  resetAppOverride as resetSharedAppOverride,
  setAppOverride,
  setPlatformDefault,
} from '../_shared/ai-runtime-store';
import { exampleTokenClaims, type TransformotionTokenClaims } from '../_shared/auth';
import {
  exampleAccount,
  exampleAccountMember,
  exampleInvitation,
  exampleLaunchpadTile,
  exampleUserProfile,
  type AccountSummary,
  type LaunchpadAiConfigAppSlug,
  type LaunchpadTile,
} from './types';

// M16 — canonical invitation/membership/discovery mocks live alongside their
// contracts and are re-exported here as part of the mock entry point.
export * from './invitations.mocks';
export * from './invitations.examples';

export const mockLaunchpadClaims = exampleTokenClaims satisfies TransformotionTokenClaims;
export const mockLaunchpadAccounts = [exampleAccount] satisfies AccountSummary[];
export const mockLaunchpadTiles = [exampleLaunchpadTile] satisfies LaunchpadTile[];

export const mockLaunchpadState = {
  user: exampleUserProfile,
  accounts: mockLaunchpadAccounts,
  members: [exampleAccountMember],
  invitations: [exampleInvitation],
  tiles: mockLaunchpadTiles,
  aiRuntimeConfig: exampleAiRuntimeConfigResponse,
} as const;

export interface LaunchpadMockHandlers {
  getAiRuntimeConfig(): AiRuntimeConfigResponse;
  updatePlatformDefault(update: AiRuntimeConfigUpdate): AiRuntimeConfigResponse;
  /** @deprecated M15.1 — app override editing moved into each app's Settings tab. Retained for runtime transition. */
  updateAppOverride(appSlug: LaunchpadAiConfigAppSlug, update: AiRuntimeConfigUpdate): AiRuntimeConfigResponse;
  /** @deprecated M15.1 — app override reset moved into each app's Settings tab. Retained for runtime transition. */
  resetAppOverride(appSlug: LaunchpadAiConfigAppSlug): AiRuntimeConfigResponse;
}

export const launchpadMockHandlers = {
  getAiRuntimeConfig() {
    return composeAiRuntimeConfig();
  },
  updatePlatformDefault(update) {
    setPlatformDefault(update);
    return composeAiRuntimeConfig();
  },
  updateAppOverride(appSlug, update) {
    setAppOverride(appSlug, update);
    return composeAiRuntimeConfig();
  },
  resetAppOverride(appSlug) {
    resetSharedAppOverride(appSlug);
    return composeAiRuntimeConfig();
  },
} satisfies LaunchpadMockHandlers;

/**
 * Compose the platform-wide AI runtime config from the shared store.
 *
 * Launchpad owns the platform-default slot but only READS the per-app override
 * slots (each owned by its own app) so its "Effective App Settings" summary
 * reflects overrides saved inside Budget Tracker / Stock Analyser.
 */
function composeAiRuntimeConfig(): AiRuntimeConfigResponse {
  const platformDefault = getPlatformDefault();
  const appOverrides = getAllAppOverrides();

  const effective = Object.fromEntries(
    SUPPORTED_AI_CONFIG_APP_SLUGS.map((appSlug: AiConfigAppSlug) => [
      appSlug,
      resolveEffectiveAiRuntimeConfig({
        appOverride: appOverrides[appSlug],
        platformDefault,
      }),
    ]),
  ) as AiRuntimeConfigResponse['effective'];

  return {
    ...exampleAiRuntimeConfigResponse,
    platformDefault,
    appOverrides,
    effective,
  };
}
