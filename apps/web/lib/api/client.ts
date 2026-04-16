/**
 * API Client
 * 
 * Central gateway for all backend calls.
 * Handles auth tokens, API keys, retries, and error handling.
 * 
 * Current: Calls repositories directly (no network)
 * Future: Makes HTTPS calls to API Gateway with proper auth
 */

import { APIRequestOptions, APIResponse, APIException, ErrorCodes } from './types'
import { getConfig } from '../config'
import { cognitoAuth } from '../services/auth/cognito-auth'

export interface APIClientConfig {
  baseURL: string
  timeout?: number
  getAuthToken?: () => Promise<string | null>
  getAPIKey?: () => string | null
}

export interface APIClient {
  get<T>(endpoint: string, params?: Record<string, string>, options?: APIRequestOptions): Promise<T>
  post<T>(endpoint: string, body: unknown, options?: APIRequestOptions): Promise<T>
  put<T>(endpoint: string, body: unknown, options?: APIRequestOptions): Promise<T>
  patch<T>(endpoint: string, body: unknown, options?: APIRequestOptions): Promise<T>
  delete(endpoint: string, options?: APIRequestOptions): Promise<void>
}

/**
 * Create an API client instance.
 * 
 * @example
 * const client = createAPIClient({
 *   baseURL: 'https://api.transformotion.com',
 *   getAuthToken: () => authStore.getState().accessToken,
 *   getAPIKey: () => process.env.API_KEY,
 * })
 */
export function createAPIClient(config: APIClientConfig): APIClient {
  const { baseURL, timeout = 30000, getAuthToken, getAPIKey } = config

  async function buildHeaders(options?: APIRequestOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    }

    // Add auth token if available
    if (getAuthToken) {
      const token = await getAuthToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    // Add API key if available (for Lambda/API Gateway)
    if (getAPIKey) {
      const apiKey = getAPIKey()
      if (apiKey) {
        headers['x-api-key'] = apiKey
      }
    }

    return headers
  }

  async function request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    options?: APIRequestOptions
  ): Promise<T> {
    const url = baseURL ? `${baseURL}${endpoint}` : endpoint
    const headers = await buildHeaders(options)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout || timeout)

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal || controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new APIException(
          errorBody.code || ErrorCodes.INTERNAL_ERROR,
          errorBody.message || `HTTP ${response.status}`,
          response.status,
          errorBody.details
        )
      }

      // Handle no-content responses
      if (response.status === 204) {
        return undefined as T
      }

      return response.json()
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof APIException) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIException(ErrorCodes.TIMEOUT, 'Request timed out', 408)
      }

      throw new APIException(
        ErrorCodes.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Unknown error',
        500
      )
    }
  }

  return {
    get<T>(endpoint: string, params?: Record<string, string>, options?: APIRequestOptions): Promise<T> {
      const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
      return request<T>('GET', `${endpoint}${queryString}`, undefined, options)
    },

    post<T>(endpoint: string, body: unknown, options?: APIRequestOptions): Promise<T> {
      return request<T>('POST', endpoint, body, options)
    },

    put<T>(endpoint: string, body: unknown, options?: APIRequestOptions): Promise<T> {
      return request<T>('PUT', endpoint, body, options)
    },

    patch<T>(endpoint: string, body: unknown, options?: APIRequestOptions): Promise<T> {
      return request<T>('PATCH', endpoint, body, options)
    },

    delete(endpoint: string, options?: APIRequestOptions): Promise<void> {
      return request<void>('DELETE', endpoint, undefined, options)
    },
  }
}

// Default client instance (lazy initialized)
let _defaultClient: APIClient | null = null

export function getAPIClient(): APIClient {
  if (!_defaultClient) {
    const config = getConfig()
    _defaultClient = createAPIClient({
      baseURL:      config.api.baseURL,
      timeout:      config.api.timeout,
      // CognitoUserPoolsAuthorizer validates the ID token (has aud = clientId).
      // Access tokens use client_id claim instead, which the authorizer ignores.
      getAuthToken: () => cognitoAuth.getIdToken(),
    })
  }
  return _defaultClient
}
