import { getBudgetHttp } from '@/lib/api';
import {
  AI_MODEL_ALLOWLIST,
  type AiProviderId,
  type AiRuntimeConfigUpdate,
  type AppAiRuntimeConfigResponse,
} from '@transformotion/contracts/_shared/ai-runtime';

export type {
  AiConfigSource,
  AiProviderId,
  AiRuntimeConfigUpdate,
  AppAiRuntimeConfigResponse,
} from '@transformotion/contracts/_shared/ai-runtime';

export const SUPPORTED_AI_MODELS: Record<AiProviderId, readonly string[]> = {
  claude: AI_MODEL_ALLOWLIST.claude,
  openai: AI_MODEL_ALLOWLIST.openai,
};

const BASE = '/api/budget/v1/ai-config';

export function getBudgetAiConfig(): Promise<AppAiRuntimeConfigResponse> {
  return getBudgetHttp().get<AppAiRuntimeConfigResponse>(BASE);
}

export function updateBudgetAiOverride(update: AiRuntimeConfigUpdate): Promise<AppAiRuntimeConfigResponse> {
  return getBudgetHttp().put<AppAiRuntimeConfigResponse>(`${BASE}/override`, update);
}

export async function resetBudgetAiOverride(): Promise<AppAiRuntimeConfigResponse> {
  await getBudgetHttp().delete(`${BASE}/override`);
  return getBudgetAiConfig();
}
