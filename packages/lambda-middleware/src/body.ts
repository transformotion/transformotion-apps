import type { APIGatewayProxyEvent } from './types';
import { badRequest } from './errors';

/**
 * Parse and validate the JSON request body from an API Gateway event.
 * Throws HttpError(400) if the body is missing or not valid JSON.
 *
 * @example
 *   const { ticker } = parseBody<{ ticker: string }>(event);
 */
export function parseBody<T = Record<string, unknown>>(event: APIGatewayProxyEvent): T {
  if (!event.body) {
    throw badRequest('Request body is required');
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw badRequest('Request body is not valid JSON');
  }
}

/**
 * Return a query string parameter by name, or throw 400 if it is required
 * and absent.
 */
export function getQueryParam(
  event: APIGatewayProxyEvent,
  name: string,
  required: true,
): string;
export function getQueryParam(
  event: APIGatewayProxyEvent,
  name: string,
  required?: false,
): string | undefined;
export function getQueryParam(
  event: APIGatewayProxyEvent,
  name: string,
  required = false,
): string | undefined {
  const value = event.queryStringParameters?.[name];
  if (required && !value) {
    throw badRequest(`Query parameter \`${name}\` is required`);
  }
  return value ?? undefined;
}

/**
 * Return a path parameter by name, or throw 400 if absent.
 * Path parameters from API Gateway are always present when the route is
 * correctly defined — this mainly guards against infra misconfigurations.
 */
export function getPathParam(event: APIGatewayProxyEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) {
    throw badRequest(`Path parameter \`${name}\` is missing`);
  }
  return value;
}
