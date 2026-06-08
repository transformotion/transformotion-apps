import { getConfig } from '@/lib/config'
import {
  AI_MODEL_ALLOWLIST,
  type AiConfigAppSlug,
  type AiProviderId,
  type AiRuntimeConfigRecord,
  type AiRuntimeConfigResponse,
  type AiRuntimeConfigUpdate,
} from '@transformotion/contracts/_shared/ai-runtime'

export type {
  AiConfigAppSlug,
  AiConfigSource,
  AiProviderId,
  AiRuntimeConfigRecord,
  AiRuntimeConfigResponse,
  AiRuntimeConfigUpdate,
  ResolvedAiRuntimeConfig,
} from '@transformotion/contracts/_shared/ai-runtime'

export const FALLBACK_SUPPORTED_MODELS: Record<AiProviderId, readonly string[]> = {
  claude: AI_MODEL_ALLOWLIST.claude,
  openai: AI_MODEL_ALLOWLIST.openai,
}

function resolveControlPlaneBaseUrl(): string {
  return getConfig().controlPlane.apiUrl
}

function buildControlPlaneUrl(path: string): string {
  const baseUrl = resolveControlPlaneBaseUrl()
  if (!baseUrl) {
    throw new Error('Launchpad control-plane API URL is not configured')
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = path.replace(/^\/+/, '')
  return new URL(normalizedPath, normalizedBase).toString()
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
  const response = await fetch(buildControlPlaneUrl(path), {
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

/**
 * @deprecated M15.1 keeps this route for transition compatibility only. App-owned
 * AI overrides are edited in the owning application's Settings surface.
 */
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

/**
 * @deprecated M15.1 keeps this route for transition compatibility only. App-owned
 * AI overrides are reset in the owning application's Settings surface.
 */
export function resetAppOverride(
  idToken: string,
  appSlug: AiConfigAppSlug,
): Promise<void> {
  return request(idToken, `/api/admin/ai-runtime-config/apps/${encodeURIComponent(appSlug)}/override`, {
    method: 'DELETE',
  })
}
