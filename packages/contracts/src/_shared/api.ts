export type ISODateTime = string;
export type UnixSeconds = number;
export type AccountId = string;
export type UserId = string;
export type EmailAddress = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AuthRequirement = 'public' | 'auth-only' | 'account' | 'site-admin';

export interface ApiError {
  code: string;
  message: string;
  details?: JsonValue;
}

export interface ApiEnvelope<T> {
  data: T;
  requestId?: string;
}

export interface ApiErrorEnvelope {
  error: ApiError;
  requestId?: string;
}

export interface ApiRoute<Request, Response> {
  method: HttpMethod;
  path: string;
  auth: AuthRequirement;
  request: Request;
  response: Response;
}

export interface EmptyRequest {
  readonly kind: 'empty';
}

export const emptyRequest = { kind: 'empty' } as const satisfies EmptyRequest;

export interface AccountScopedHeaders {
  authorization: `Bearer ${string}`;
  xAccountId: AccountId;
}

export const exampleApiError = {
  code: 'FORBIDDEN',
  message: 'The authenticated user is not allowed to perform this action.',
} as const satisfies ApiError;
