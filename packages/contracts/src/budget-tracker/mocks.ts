import {
  exampleBudgetData,
  exampleBudgetSettings,
  exampleCategory,
  exampleCsvAnalysisResponse,
  exampleMatchingRule,
  exampleReviewBatchResult,
  exampleTransaction,
  type AiCsvAnalysisResponse,
  type BudgetData,
  type BudgetSettings,
  type Category,
  type MatchingRule,
  type ReviewBatchResult,
  type Transaction,
} from './types';
import {
  exampleBudgetTrackerWsBatchResultMessage,
  exampleBudgetTrackerWsConnectedMessage,
  type BudgetTrackerWsServerMessage,
} from './wss';
import {
  exampleAppAiRuntimeConfigResponse,
  resolveEffectiveAiRuntimeConfig,
  type AiRuntimeConfigUpdate,
  type AppAiRuntimeConfigResponse,
} from '../_shared/ai-runtime';
import {
  getAppOverride,
  getPlatformDefault,
  resetAppOverride as resetSharedAppOverride,
  setAppOverride,
} from '../_shared/ai-runtime-store';

export const mockTransactions = [exampleTransaction] satisfies Transaction[];
export const mockCategories = [exampleCategory] satisfies Category[];
export const mockRules = [exampleMatchingRule] satisfies MatchingRule[];
export const mockSettings = exampleBudgetSettings satisfies BudgetSettings;
export const mockBudgetData = exampleBudgetData satisfies BudgetData;
export const mockReviewBatchResults = [exampleReviewBatchResult] satisfies ReviewBatchResult[];
export const mockCsvAnalysisResponse = exampleCsvAnalysisResponse satisfies AiCsvAnalysisResponse;

export const mockBudgetTrackerWsMessages = [
  exampleBudgetTrackerWsConnectedMessage,
  exampleBudgetTrackerWsBatchResultMessage,
  {
    type: 'complete',
    jobId: 'job-bt-review-123',
  },
] as const satisfies readonly BudgetTrackerWsServerMessage[];

/**
 * App-owned AI config mock handlers (M15.1).
 *
 * Treat as the in-memory server for Budget Tracker's own provider/model
 * override. The platform default is read-only here (owned by Launchpad);
 * effective resolution uses the shared resolver.
 */
export interface BudgetTrackerAiConfigMockHandlers {
  getAiConfig(): AppAiRuntimeConfigResponse;
  updateOverride(update: AiRuntimeConfigUpdate): AppAiRuntimeConfigResponse;
  resetOverride(): AppAiRuntimeConfigResponse;
}

const BUDGET_APP_SLUG = 'budget-tracker' as const;

const mockBudgetAiConfigBase = {
  ...exampleAppAiRuntimeConfigResponse,
  appSlug: BUDGET_APP_SLUG,
} satisfies AppAiRuntimeConfigResponse;

export function createBudgetTrackerAiConfigMockHandlers(): BudgetTrackerAiConfigMockHandlers {
  // Override state is owned here but persisted in the shared store so Launchpad
  // can read it. The platform default is read (never written) from the store.
  const snapshot = (): AppAiRuntimeConfigResponse => {
    const appOverride = getAppOverride(BUDGET_APP_SLUG);
    const platformDefault = getPlatformDefault();
    return {
      ...mockBudgetAiConfigBase,
      platformDefault,
      appOverride,
      effective: resolveEffectiveAiRuntimeConfig({ appOverride, platformDefault }),
    };
  };

  return {
    getAiConfig: () => snapshot(),
    updateOverride: (update) => {
      setAppOverride(BUDGET_APP_SLUG, update);
      return snapshot();
    },
    resetOverride: () => {
      resetSharedAppOverride(BUDGET_APP_SLUG);
      return snapshot();
    },
  };
}

export const budgetTrackerAiConfigMockHandlers = createBudgetTrackerAiConfigMockHandlers();
