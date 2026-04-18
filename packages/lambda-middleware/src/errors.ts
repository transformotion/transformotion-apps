/**
 * HTTP error that middleware converts to a structured JSON response.
 * Throw this from any protected handler — the wrapper catches it.
 *
 * @example
 *   throw new HttpError(404, 'Account not found');
 *   throw new HttpError(403, 'Insufficient permissions', { required: 'admin' });
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 400 Bad Request */
export const badRequest  = (msg: string, detail?: unknown) => new HttpError(400, msg, detail);
/** 401 Unauthorised — missing or invalid auth context */
export const unauthorised = (msg = 'Unauthorised')          => new HttpError(401, msg);
/** 403 Forbidden — authenticated but not permitted */
export const forbidden   = (msg = 'Forbidden')              => new HttpError(403, msg);
/** 404 Not Found */
export const notFound    = (msg: string)                    => new HttpError(404, msg);
/** 409 Conflict */
export const conflict    = (msg: string)                    => new HttpError(409, msg);
