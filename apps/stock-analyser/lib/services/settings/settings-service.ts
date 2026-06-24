import { getConfig } from '@/lib/config';
import { stockAnalyserClient } from '@/lib/api';
import {
  AI_MODEL_ALLOWLIST,
  type AiProviderId,
  type AiRuntimeConfigUpdate,
  type AppAiRuntimeConfigResponse,
} from '@transformotion/contracts/_shared/ai-runtime';
import type { PatchSettingsRequest } from '@transformotion/contracts/stock-analyser/api';
import type {
  CacheFreshnessConfigRecord,
  StockAnalyserCacheFreshnessPolicy,
} from '@transformotion/contracts/stock-analyser/cache-freshness';
import {
  defaultCacheFreshnessConfigRecord,
  DEFAULT_CACHE_FRESHNESS_POLICY,
} from '@transformotion/contracts/stock-analyser/cache-freshness';
import type { StockAnalyserSettings } from '@transformotion/contracts/stock-analyser/types';

export type {
  AiConfigSource,
  AiProviderId,
  AiRuntimeConfigUpdate,
  AppAiRuntimeConfigResponse,
} from '@transformotion/contracts/_shared/ai-runtime';

export type { StockAnalyserSettings } from '@transformotion/contracts/stock-analyser/types';

export const SUPPORTED_AI_MODELS: Record<AiProviderId, readonly string[]> = {
  claude: AI_MODEL_ALLOWLIST.claude,
  openai: AI_MODEL_ALLOWLIST.openai,
};

const mockSettings: StockAnalyserSettings = {
  pk: 'SETTINGS',
  sk: 'APP#stock-analyser',
  explanatoryTextEnabled: true,
  defaultSearchMode: 'live',
  updatedAt: new Date().toISOString(),
};

const mockAiConfig: AppAiRuntimeConfigResponse = {
  appSlug: 'stock-analyser',
  platformDefault: {
    pk: 'AI_CONFIG',
    sk: 'PLATFORM#default',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    updatedAt: new Date().toISOString(),
  },
  appOverride: null,
  effective: { provider: 'claude', model: 'claude-sonnet-4-6', source: 'platform_default' },
  supportedModels: SUPPORTED_AI_MODELS,
};

let mockCacheFreshnessConfig: CacheFreshnessConfigRecord =
  defaultCacheFreshnessConfigRecord(new Date().toISOString());

function resolveMockAiConfig(): AppAiRuntimeConfigResponse {
  return {
    ...mockAiConfig,
    effective: mockAiConfig.appOverride
      ? { provider: mockAiConfig.appOverride.provider, model: mockAiConfig.appOverride.model, source: 'app_override' }
      : mockAiConfig.platformDefault
        ? { provider: mockAiConfig.platformDefault.provider, model: mockAiConfig.platformDefault.model, source: 'platform_default' }
        : { provider: 'claude', model: 'claude-sonnet-4-6', source: 'environment_fallback' },
  };
}

const mockService = {
  async getSettings(): Promise<StockAnalyserSettings> {
    return { ...mockSettings };
  },
  async patchSettings(updates: PatchSettingsRequest): Promise<StockAnalyserSettings> {
    if (typeof updates.explanatoryTextEnabled === 'boolean') {
      mockSettings.explanatoryTextEnabled = updates.explanatoryTextEnabled;
    }
    if (updates.defaultSearchMode === 'fast' || updates.defaultSearchMode === 'live') {
      mockSettings.defaultSearchMode = updates.defaultSearchMode;
    }
    mockSettings.updatedAt = new Date().toISOString();
    return { ...mockSettings };
  },
  async getAiConfig(): Promise<AppAiRuntimeConfigResponse> {
    return resolveMockAiConfig();
  },
  async updateAiOverride(update: AiRuntimeConfigUpdate): Promise<AppAiRuntimeConfigResponse> {
    mockAiConfig.appOverride = {
      pk: 'AI_CONFIG',
      sk: 'APP#stock-analyser',
      provider: update.provider,
      model: update.model,
      updatedAt: new Date().toISOString(),
    };
    return resolveMockAiConfig();
  },
  async resetAiOverride(): Promise<AppAiRuntimeConfigResponse> {
    mockAiConfig.appOverride = null;
    return resolveMockAiConfig();
  },
  async getCacheFreshnessConfig(): Promise<CacheFreshnessConfigRecord> {
    return { ...mockCacheFreshnessConfig, activePolicy: { ...mockCacheFreshnessConfig.activePolicy }, presets: mockCacheFreshnessConfig.presets.map(p => ({ ...p, policy: { ...p.policy } })) };
  },
  async updateCacheFreshnessConfig(update: { activePolicy?: StockAnalyserCacheFreshnessPolicy; presets?: CacheFreshnessConfigRecord['presets'] }): Promise<CacheFreshnessConfigRecord> {
    mockCacheFreshnessConfig = {
      ...mockCacheFreshnessConfig,
      activePolicy: update.activePolicy ?? mockCacheFreshnessConfig.activePolicy,
      presets: update.presets ?? mockCacheFreshnessConfig.presets,
      updatedAt: new Date().toISOString(),
    };
    return this.getCacheFreshnessConfig();
  },
  async resetCacheFreshnessConfig(): Promise<CacheFreshnessConfigRecord> {
    mockCacheFreshnessConfig = defaultCacheFreshnessConfigRecord(new Date().toISOString());
    return this.getCacheFreshnessConfig();
  },
};

const realService = {
  async getSettings(): Promise<StockAnalyserSettings> {
    const res = await stockAnalyserClient.getSettings();
    return res.settings;
  },
  async patchSettings(updates: PatchSettingsRequest): Promise<StockAnalyserSettings> {
    const res = await stockAnalyserClient.patchSettings(updates);
    return res.settings;
  },
  async getAiConfig(): Promise<AppAiRuntimeConfigResponse> {
    return stockAnalyserClient.getAiConfig();
  },
  async updateAiOverride(update: AiRuntimeConfigUpdate): Promise<AppAiRuntimeConfigResponse> {
    return stockAnalyserClient.updateAiOverride(update);
  },
  async resetAiOverride(): Promise<AppAiRuntimeConfigResponse> {
    await stockAnalyserClient.resetAiOverride();
    return stockAnalyserClient.getAiConfig();
  },
  async getCacheFreshnessConfig(): Promise<CacheFreshnessConfigRecord> {
    const res = await stockAnalyserClient.getCacheFreshnessConfig();
    return res.config;
  },
  async updateCacheFreshnessConfig(update: { activePolicy?: StockAnalyserCacheFreshnessPolicy; presets?: CacheFreshnessConfigRecord['presets'] }): Promise<CacheFreshnessConfigRecord> {
    const res = await stockAnalyserClient.updateCacheFreshnessConfig(update);
    return res.config;
  },
  async resetCacheFreshnessConfig(): Promise<CacheFreshnessConfigRecord> {
    const res = await stockAnalyserClient.updateCacheFreshnessConfig({
      activePolicy: DEFAULT_CACHE_FRESHNESS_POLICY,
    });
    return res.config;
  },
};

export const stockAnalyserSettingsService = getConfig().storage.provider === 'local'
  ? mockService
  : realService;
