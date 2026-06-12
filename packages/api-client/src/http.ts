import { ApiError } from './errors';

export interface ApiClientOptions {
  /** Base URL of the main API Gateway, e.g. https://xxx.execute-api.ap-southeast-2.amazonaws.com/dev/ */
  baseUrl: string;
  /**
   * Async function that returns a valid Cognito ID token string.
   * Called before every request — Amplify handles refresh automatically.
   * Example: () => fetchAuthSession().then(s => s.tokens?.idToken?.toString() ?? '')
   */
  getToken: () => Promise<string>;
  /**
   * Optional function (sync or async) that returns the active account ID.
   * When provided the result is sent as X-Account-Id on every request.
   * May be async when the account ID must be read from the Cognito session.
   */
  getAccountId?: () => string | null | undefined | Promise<string | null | undefined>;
}

/**
 * Low-level fetch wrapper. Used by ApiClient — not exported from the package.
 * Attaches Authorization + X-Account-Id headers, JSON-encodes request bodies,
 * and throws ApiError on non-2xx responses.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string>;
  private readonly getAccountId?: () => string | null | undefined | Promise<string | null | undefined>;

  constructor(opts: ApiClientOptions) {
    // Normalise: always ends with /
    this.baseUrl      = opts.baseUrl.endsWith('/') ? opts.baseUrl : `${opts.baseUrl}/`;
    this.getToken     = opts.getToken;
    this.getAccountId = opts.getAccountId;
  }

  async get<T>(path: string, signal?: AbortSignal, extraHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, signal, extraHeaders);
  }

  async put<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('PUT', path, body, signal);
  }

  async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('POST', path, body, signal);
  }

  async patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('PATCH', path, body, signal);
  }

  async delete(path: string, signal?: AbortSignal): Promise<void> {
    await this.request<void>('DELETE', path, undefined, signal);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const token     = await this.getToken();
    const accountId = this.getAccountId ? await this.getAccountId() : undefined;

    const headers: Record<string, string> = {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    };

    if (accountId) {
      headers['X-Account-Id'] = accountId;
    }
    // Per-call headers (e.g. a one-off X-Account-Id) override the defaults.
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    // Strip leading slash so baseUrl + path doesn't produce double slashes
    const url = this.baseUrl + path.replace(/^\//, '');

    const res = await fetch(url, {
      method,
      headers,
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 204) {
      return undefined as T;
    }

    let data: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const message =
        (typeof data === 'object' && data !== null && 'message' in data)
          ? String((data as Record<string, unknown>)['message'])
          : `Request failed with status ${res.status}`;
      throw new ApiError(res.status, message, data);
    }

    return data as T;
  }
}
