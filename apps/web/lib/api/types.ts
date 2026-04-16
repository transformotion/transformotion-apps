/**
 * API Client Types
 * 
 * Request/response types for the API client layer.
 * These remain stable whether calling localStorage or Lambda.
 */

export interface APIRequestOptions {
  headers?: Record<string, string>
  timeout?: number
  signal?: AbortSignal
}

export interface APIResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
}

export interface APIError {
  code: string
  message: string
  status: number
  details?: unknown
}

export class APIException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'APIException'
  }

  toJSON(): APIError {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
    }
  }
}

// Standard error codes
export const ErrorCodes = {
  // Client errors
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  
  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  
  // Storage errors
  STORAGE_READ_ERROR: 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR: 'STORAGE_WRITE_ERROR',
  
  // Auth errors
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]
