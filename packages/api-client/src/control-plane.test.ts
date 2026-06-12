import { describe, it, expect, vi, afterEach } from 'vitest';
import { ControlPlaneClient } from './control-plane';

const BASE = 'https://qrwal90470.execute-api.ap-southeast-2.amazonaws.com/dev/';

function mockFetch(responseBody: unknown) {
  return vi.fn(async () => ({
    status: 200,
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => responseBody,
  })) as unknown as typeof fetch;
}

describe('ControlPlaneClient — preserves the API Gateway stage (#423-safe)', () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('GET active-accounts keeps /dev in the path and sends the bearer token', async () => {
    const f = mockFetch({ selections: [] });
    globalThis.fetch = f;
    const client = new ControlPlaneClient({ baseUrl: BASE, getToken: async () => 'tok' });

    await client.getActiveAccounts();

    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe(`${BASE}api/user/active-accounts`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('PUT setActiveAccount targets {appSlug}, keeps the stage, sends the body', async () => {
    const f = mockFetch({ selections: [{ appSlug: 'stock-analyser', accountId: 'acc-1' }] });
    globalThis.fetch = f;
    const client = new ControlPlaneClient({ baseUrl: BASE, getToken: async () => 'tok' });

    const res = await client.setActiveAccount('stock-analyser', 'acc-1');

    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe(`${BASE}api/user/active-accounts/stock-analyser`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ accountId: 'acc-1' });
    expect(res.selections[0]!.accountId).toBe('acc-1');
  });

  it('keeps the stage even when baseUrl has no trailing slash', async () => {
    const f = mockFetch({ selections: [] });
    globalThis.fetch = f;
    const client = new ControlPlaneClient({ baseUrl: BASE.replace(/\/$/, ''), getToken: async () => 'tok' });

    await client.getActiveAccounts();

    const [url] = (f as unknown as { mock: { calls: [string][] } }).mock.calls[0];
    expect(url).toBe(`${BASE}api/user/active-accounts`);
  });
});
