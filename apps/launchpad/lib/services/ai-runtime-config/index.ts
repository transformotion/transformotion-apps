import { getConfig } from '@/lib/config'

export type AiProviderId = 'claude' | 'openai'
export type AiConfigSource = 'app_override' | 'platform_default' | 'environment_fallback'
export type AiConfigAppSlug = 'stock-analyser' | 'budget-tracker'

export interface AiRuntimeConfigRecord {
  provider: AiProviderId
  model: string
  updatedAt: string
}

export interface ResolvedAiRuntimeConfig {
  provider: AiProviderId
  model: string
  source: AiConfigSource
}

export interface AiRuntimeConfigResponse {
  platformDefault: AiRuntimeConfigRecord | null
  appOverrides: Record<AiConfigAppSlug, AiRuntimeConfigRecord | null>
  effective: Record<AiConfigAppSlug, ResolvedAiRuntimeConfig>
  supportedModels?: Record<AiProviderId, readonly string[]>
}

export interface AiRuntimeConfigUpdate {
  provider: AiProviderId
  model: string
}

export const FALLBACK_SUPPORTED_MODELS: Record<AiProviderId, readonly string[]> = {
  claude: [
    'claude-sonnet-4-6',
    'claude-opus-4-8',
    'claude-haiku-4-5-20251001',
  ],
  openai: [
    'gpt-5.4-mini',
    'gpt-5.4',
    'gpt-5.5',
    'gpt-5.4-nano',
  ],
}

function resolveControlPlaneBaseUrl(): string {
  return getConfig().controlPlane.apiUrl
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { message?: string; error?: string }
    return body.message ?? body.error ?? fallback
  } catch {
    return fallback
  }
}

async function request<T>(
  idToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const baseUrl = resolveControlPlaneBaseUrl()
  if (!baseUrl) {
    throw new Error('Launchpad control-plane API URL is not configured')
  }

  const response = await fetch(new URL(path, baseUrl).toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    throw new Error(await readError(response, `${init.method ?? 'GET'} ${path} failed: ${response.status}`))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export function getAiRuntimeConfig(idToken: string): Promise<AiRuntimeConfigResponse> {
  return request(idToken, '/api/admin/ai-runtime-config')
}

export function updatePlatformDefault(
  idToken: string,
  update: AiRuntimeConfigUpdate,
): Promise<AiRuntimeConfigRecord> {
  return request(idToken, '/api/admin/ai-runtime-config/platform-default', {
    method: 'PUT',
    body: JSON.stringify(update),
  })
}

export function updateAppOverride(
  idToken: string,
  appSlug: AiConfigAppSlug,
  update: AiRuntimeConfigUpdate,
): Promise<AiRuntimeConfigRecord & { appSlug: AiConfigAppSlug }> {
  return request(idToken, `/api/admin/ai-runtime-config/apps/${encodeURIComponent(appSlug)}/override`, {
    method: 'PUT',
    body: JSON.stringify(update),
  })
}

export function resetAppOverride(
  idToken: string,
  appSlug: AiConfigAppSlug,
): Promise<void> {
  return request(idToken, `/api/admin/ai-runtime-config/apps/${encodeURIComponent(appSlug)}/override`, {
    method: 'DELETE',
  })
}
