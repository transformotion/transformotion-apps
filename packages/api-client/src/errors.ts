/**
 * Thrown by ApiClient when the server returns a non-2xx response.
 * The `status` and `body` fields let callers handle specific HTTP errors
 * (e.g. 401 → redirect to sign-in, 404 → show empty state).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorised() { return this.status === 401; }
  get isForbidden()    { return this.status === 403; }
  get isNotFound()     { return this.status === 404; }
  get isConflict()     { return this.status === 409; }
  get isServerError()  { return this.status >= 500; }
}
