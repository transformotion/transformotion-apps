import type { APIGatewayProxyResult, LambdaResponse } from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Account-Id',
};

/**
 * Build a successful handler response.
 * `body` remains as-is — the middleware wrapper JSON.stringifies it before
 * returning the final APIGatewayProxyResult.
 */
export function ok(body: unknown, statusCode = 200): LambdaResponse {
  return { statusCode, body, headers: CORS_HEADERS };
}

/** 201 Created */
export const created = (body: unknown): LambdaResponse => ok(body, 201);

/** 204 No Content */
export function noContent(): LambdaResponse {
  return { statusCode: 204, body: null, headers: CORS_HEADERS };
}

/**
 * Build an error API Gateway response (used by the middleware wrapper itself,
 * not by handlers — handlers should throw HttpError instead).
 * Always returns a `{ error, message }` JSON body.
 */
export function errorResponse(
  statusCode: number,
  message: string,
  detail?: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error:   httpStatusLabel(statusCode),
      message,
      ...(detail !== undefined ? { detail } : {}),
    }),
  };
}

function httpStatusLabel(code: number): string {
  const labels: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorised',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
  };
  return labels[code] ?? `HTTP ${code}`;
}
