import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from '@transformotion/lambda-middleware';
import {
  DEFAULT_CACHE_FRESHNESS_POLICY,
  DEFAULT_CACHE_FRESHNESS_PRESETS,
} from '@transformotion/contracts/stock-analyser/cache-freshness';
import { createHandler } from './index';

type HandlerDependencies = NonNullable<Parameters<typeof createHandler>[0]>;

vi.mock('@transformotion/fn-ai-proxy-core', () => ({
  AI_CONFIG_PK: 'AI_CONFIG',
  AI_MODEL_ALLOWLIST: { claude: ['claude-sonnet-4-6'], openai: ['gpt-5.4-mini'] },
  PLATFORM_DEFAULT_SK: 'PLATFORM#default',
  appOverrideSk: (appSlug: string) => `APP#${appSlug}`,
  assertValidAiConfig: () => undefined,
  isSupportedAiModel: () => true,
  isSupportedAiProvider: () => true,
  resolveEnvFallbackConfig: () => ({
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    source: 'environment_fallback',
  }),
}));

function makeEvent(
  method: 'GET' | 'PATCH' | 'PUT',
  body?: unknown,
  options: {
    resource?: string;
    groups?: string;
    accounts?: Record<string, Array<{ accountId: string; role: string }>>;
  } = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    resource: options.resource ?? '/settings',
    headers: { 'X-Account-Id': 'acct-1' },
    body: body === undefined ? null : JSON.stringify(body),
    requestContext: {
      authorizer: {
        claims: {
          sub: 'user-1',
          email: 'user@example.com',
          'cognito:groups': options.groups ?? 'stock-app-access',
          apps: JSON.stringify(['stock-analyser']),
          accounts: JSON.stringify(options.accounts ?? {
            'stock-analyser': [{ accountId: 'acct-1', role: 'viewer' }],
          }),
        },
      },
    },
  } as unknown as APIGatewayProxyEvent;
}

function createFakeDeps(initialItem?: Record<string, unknown>) {
  let item = initialItem;
  return {
    deps: {
      client: {
        async send(command: { input?: { Item?: Record<string, unknown> } }) {
          if (command.input?.Item) {
            item = command.input.Item;
            return {};
          }
          return item ? { Item: item } : {};
        },
      },
      settingsTable: 'settings',
      platformConfigTable: 'platform',
      now: () => new Date('2026-06-24T00:00:00.000Z'),
    } as unknown as HandlerDependencies,
    getItem: () => item,
  };
}

describe('Stock Analyser settings handler', () => {
  it('defaults defaultSearchMode to live when no preference exists', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent('GET'));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      settings: {
        pk: 'SETTINGS',
        sk: 'APP#stock-analyser',
        explanatoryTextEnabled: true,
        defaultSearchMode: 'live',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });
  });

  it('AI override save writes ONE app-level record (top-level shape), not a per-account row (#586)', async () => {
    const { deps, getItem } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent(
      'PUT',
      { provider: 'openai', model: 'gpt-5.4-mini' },
      { resource: '/ai-config/override', groups: 'site-admin' },
    ));

    expect(res.statusCode).toBe(200);
    const written = getItem() as Record<string, unknown>;
    // App-level key the engine + ai-proxy read — NOT {ACCOUNT#…, APP#AI_RUNTIME}.
    expect(written.pk).toBe('AI_CONFIG');
    expect(written.sk).toBe('APP#stock-analyser');
    // Top-level provider/model (not nested under `config`) — the shape the resolver reads.
    expect(written.provider).toBe('openai');
    expect(written.model).toBe('gpt-5.4-mini');
    expect(written).not.toHaveProperty('config');
    expect(String(written.pk)).not.toMatch(/^ACCOUNT#/);
  });

  it('patches defaultSearchMode without mutating explanatory text to an invalid value', async () => {
    const { deps, getItem } = createFakeDeps({
      pk: 'ACCOUNT#acct-1',
      sk: 'USER#user-1#PREFERENCES',
      explanatoryTextEnabled: false,
      defaultSearchMode: 'live',
      updatedAt: '2026-06-23T00:00:00.000Z',
    });

    const res = await createHandler(deps)(makeEvent('PATCH', { defaultSearchMode: 'fast' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).settings).toMatchObject({
      explanatoryTextEnabled: false,
      defaultSearchMode: 'fast',
    });
    expect(getItem()).toMatchObject({
      explanatoryTextEnabled: false,
      defaultSearchMode: 'fast',
    });
  });

  it('rejects unsupported settings fields', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent('PATCH', { market: 'ASX' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Unsupported settings fields: market');
  });

  it('returns the default cache freshness policy when no config exists', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent('GET', undefined, { resource: '/cache-freshness' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config).toMatchObject({
      pk: 'SETTINGS',
      sk: 'CACHE_FRESHNESS#stock-analyser',
      activePolicy: {
        freshUntilElapsedRatio: 0.25,
        staleFromElapsedRatio: 0.75,
        showOutdatedState: true,
      },
    });
  });

  it('allows stock-app-admin to update cache freshness policy', async () => {
    const { deps, getItem } = createFakeDeps();
    const policy = {
      freshUntilElapsedRatio: 0.15,
      staleFromElapsedRatio: 0.5,
      showOutdatedState: true,
    };

    const res = await createHandler(deps)(makeEvent(
      'PUT',
      { activePolicy: policy },
      { resource: '/cache-freshness', groups: 'stock-app-access,stock-app-admin' },
    ));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config.activePolicy).toEqual(policy);
    expect(getItem()).toMatchObject({ pk: 'SETTINGS', sk: 'CACHE_FRESHNESS#stock-analyser', activePolicy: policy });
  });

  it('allows site-admin to update cache freshness policy', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent(
      'PUT',
      { activePolicy: { freshUntilElapsedRatio: 0.5, staleFromElapsedRatio: 0.9, showOutdatedState: true } },
      { resource: '/cache-freshness', groups: 'stock-app-access,site-admin' },
    ));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config.activePolicy).toEqual({
      freshUntilElapsedRatio: 0.5,
      staleFromElapsedRatio: 0.9,
      showOutdatedState: true,
    });
  });

  it('rejects non-admin cache freshness writes', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent(
      'PUT',
      { activePolicy: { freshUntilElapsedRatio: 0.15, staleFromElapsedRatio: 0.5, showOutdatedState: true } },
      { resource: '/cache-freshness', groups: 'stock-app-access' },
    ));

    expect(res.statusCode).toBe(403);
  });

  it('rejects invalid cache freshness policy updates without overwriting the existing policy', async () => {
    const existing = {
      pk: 'SETTINGS',
      sk: 'CACHE_FRESHNESS#stock-analyser',
      activePolicy: DEFAULT_CACHE_FRESHNESS_POLICY,
      presets: DEFAULT_CACHE_FRESHNESS_PRESETS,
      updatedAt: '2026-06-23T00:00:00.000Z',
    };
    const { deps, getItem } = createFakeDeps(existing);
    const res = await createHandler(deps)(makeEvent(
      'PUT',
      { activePolicy: { freshUntilElapsedRatio: 0.7, staleFromElapsedRatio: 0.71, showOutdatedState: true } },
      { resource: '/cache-freshness', groups: 'stock-app-access,stock-app-admin' },
    ));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid cache freshness policy');
    expect(getItem()).toEqual(existing);
  });

  it('supports reset-to-default by persisting the default policy and presets', async () => {
    const { deps, getItem } = createFakeDeps({
      pk: 'SETTINGS',
      sk: 'CACHE_FRESHNESS#stock-analyser',
      activePolicy: {
        freshUntilElapsedRatio: 0.15,
        staleFromElapsedRatio: 0.5,
        showOutdatedState: false,
      },
      presets: DEFAULT_CACHE_FRESHNESS_PRESETS,
      updatedAt: '2026-06-23T00:00:00.000Z',
    });

    const res = await createHandler(deps)(makeEvent(
      'PUT',
      {
        activePolicy: DEFAULT_CACHE_FRESHNESS_POLICY,
        presets: DEFAULT_CACHE_FRESHNESS_PRESETS,
      },
      { resource: '/cache-freshness', groups: 'stock-app-access,stock-app-admin' },
    ));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config).toMatchObject({
      activePolicy: DEFAULT_CACHE_FRESHNESS_POLICY,
      presets: DEFAULT_CACHE_FRESHNESS_PRESETS,
      updatedAt: '2026-06-24T00:00:00.000Z',
    });
    expect(getItem()).toMatchObject({
      activePolicy: DEFAULT_CACHE_FRESHNESS_POLICY,
      presets: DEFAULT_CACHE_FRESHNESS_PRESETS,
      updatedAt: '2026-06-24T00:00:00.000Z',
    });
  });

  it('enforces the account read gate before returning the active/default policy', async () => {
    const send = vi.fn();
    const deps = {
      client: { send },
      settingsTable: 'settings',
      platformConfigTable: 'platform',
      now: () => new Date('2026-06-24T00:00:00.000Z'),
    } as unknown as HandlerDependencies;

    const res = await createHandler(deps)(makeEvent(
      'GET',
      undefined,
      {
        resource: '/cache-freshness',
        accounts: { 'stock-analyser': [{ accountId: 'other-acct', role: 'viewer' }] },
      },
    ));

    expect(res.statusCode).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });
});

// ── Notification preferences authorization (M19 #534) — the load-bearing proof ──
// The card's role-conditional render is UX, NOT security. These assert the SERVER
// rejects unauthorised writes regardless of what the UI rendered.
describe('Notification preferences authorization', () => {
  function notifDeps(
    row: { role: string; status?: string } | undefined,
    initialItem?: Record<string, unknown>,
  ) {
    const base = createFakeDeps(initialItem);
    return {
      deps: { ...base.deps, membershipLoader: async () => row } as HandlerDependencies,
      getItem: base.getItem,
    };
  }
  const acct = (role: string) => ({ 'stock-analyser': [{ accountId: 'acct-1', role }] });

  it('REJECTS a member writing account config (past the disabled UI)', async () => {
    const { deps } = notifDeps({ role: 'member', status: 'active' });
    const res = await createHandler(deps)(makeEvent(
      'PUT', { intervalDays: 3 },
      { resource: '/notification-config', accounts: acct('member') },
    ));
    expect(res.statusCode).toBe(403);
  });

  it('REJECTS a viewer writing account config', async () => {
    const { deps } = notifDeps({ role: 'viewer', status: 'active' });
    const res = await createHandler(deps)(makeEvent(
      'PUT', { activeTypes: ['portfolio'] },
      { resource: '/notification-config', accounts: acct('viewer') },
    ));
    expect(res.statusCode).toBe(403);
  });

  it('ALLOWS an owner writing account config (interval floored, types filtered)', async () => {
    const { deps, getItem } = notifDeps({ role: 'owner', status: 'active' });
    const res = await createHandler(deps)(makeEvent(
      'PUT', { intervalDays: 0, activeTypes: ['watchlist', 'bogus'] },
      { resource: '/notification-config', accounts: acct('owner') },
    ));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config).toMatchObject({ intervalDays: 1, activeTypes: ['watchlist'] });
    expect(getItem()).toMatchObject({ pk: 'SETTINGS', sk: 'NOTIFICATIONS#acct-1' });
  });

  it('ALLOWS a manager writing account config', async () => {
    const { deps } = notifDeps({ role: 'manager', status: 'active' });
    const res = await createHandler(deps)(makeEvent(
      'PUT', { intervalDays: 5 },
      { resource: '/notification-config', accounts: acct('manager') },
    ));
    expect(res.statusCode).toBe(200);
  });

  it('REJECTS a viewer writing consent (not applicable — no delivery)', async () => {
    const { deps } = notifDeps({ role: 'viewer', status: 'active' });
    const res = await createHandler(deps)(makeEvent(
      'PUT', { receiveConsent: true },
      { resource: '/notification-consent', accounts: acct('viewer') },
    ));
    expect(res.statusCode).toBe(403);
  });

  it('writes consent to the CALLER own record only — a crafted body userId is ignored', async () => {
    const { deps, getItem } = notifDeps({ role: 'member', status: 'active' });
    // Craft a different userId in the body — the server must ignore it and key by auth.userId (user-1).
    const res = await createHandler(deps)(makeEvent(
      'PUT', { receiveConsent: true, userId: 'user-2', accountId: 'acct-1' },
      { resource: '/notification-consent', accounts: acct('member') },
    ));
    expect(res.statusCode).toBe(200);
    // Stored under the authenticated principal, NOT the crafted user-2.
    expect(getItem()).toMatchObject({
      pk: 'NOTIFICATION_CONSENT#acct-1',
      sk: 'USER#user-1',
      receiveConsent: true,
    });
    expect(JSON.parse(res.body).consent).toMatchObject({ userId: 'user-1', receiveConsent: true });
  });

  it('fails closed (503) when the membership loader throws on an account-config write', async () => {
    const base = createFakeDeps();
    const deps = {
      ...base.deps,
      membershipLoader: async () => { throw new Error('ddb down'); },
    } as HandlerDependencies;
    const res = await createHandler(deps)(makeEvent(
      'PUT', { intervalDays: 3 },
      { resource: '/notification-config', accounts: acct('owner') },
    ));
    expect(res.statusCode).toBe(503);
  });

  // ── #571 PIECE 3 — engine kill-switch write authz (SITE/APP-ADMIN only) ────
  // The write gate is GROUPS-authoritative (token cognito:groups) — no membership
  // lookup — so it fails closed by construction (absent admin group → 403). An
  // owner/manager/member/viewer all lack the admin group → all rejected, even a
  // request crafted directly past the read-only/hidden UI. (The membership-lookup
  // fail-closed case lives in the run-history scoping, #573, not this gate.)
  it('GET engine-config: any member reads it (default ON when unset)', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent('GET', undefined, { resource: '/notification-engine-config' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config).toMatchObject({ notificationsEnabled: true });
  });

  it('PUT engine-config: site-admin and stock-app-admin may toggle', async () => {
    for (const groups of ['stock-app-access,site-admin', 'stock-app-access,stock-app-admin']) {
      const { deps, getItem } = createFakeDeps();
      const res = await createHandler(deps)(makeEvent('PUT', { notificationsEnabled: false }, { resource: '/notification-engine-config', groups }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).config.notificationsEnabled).toBe(false);
      expect((getItem() as { notificationsEnabled: boolean }).notificationsEnabled).toBe(false); // persisted
    }
  });

  it('PUT engine-config: REJECTS (403) a non-admin (owner/manager/member/viewer — no admin group), nothing persisted', async () => {
    // owner role in the token, but NO site/app-admin group → still rejected.
    const { deps, getItem } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent(
      'PUT', { notificationsEnabled: false },
      { resource: '/notification-engine-config', groups: 'stock-app-access', accounts: { 'stock-analyser': [{ accountId: 'acct-1', role: 'owner' }] } },
    ));
    expect(res.statusCode).toBe(403);
    expect(getItem()).toBeUndefined(); // fail-closed: no write
  });

  it('PUT engine-config: rejects (400) a missing/invalid notificationsEnabled', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent('PUT', { enabled: false }, { resource: '/notification-engine-config', groups: 'stock-app-access,site-admin' }));
    expect(res.statusCode).toBe(400);
  });

  // ── M19 per-surface warm gates (warmSurfaces) ────────────────────────────────
  it('PUT engine-config: persists a valid warmSurfaces map and echoes it', async () => {
    const { deps, getItem } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent(
      'PUT',
      { notificationsEnabled: true, warmSurfaces: { recs: false, portfolio: false } },
      { resource: '/notification-engine-config', groups: 'stock-app-access,site-admin' },
    ));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config.warmSurfaces).toEqual({ recs: false, portfolio: false });
    expect((getItem() as { warmSurfaces: unknown }).warmSurfaces).toEqual({ recs: false, portfolio: false });
  });

  it('PUT engine-config: an omitted warmSurfaces PRESERVES the stored map (read-merge, no silent wipe)', async () => {
    const { deps, getItem } = createFakeDeps({
      pk: 'SETTINGS', sk: 'NOTIFICATION_ENGINE_CONFIG#stock-analyser',
      notificationsEnabled: true, warmSurfaces: { etfs: false }, updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const res = await createHandler(deps)(makeEvent(
      'PUT', { notificationsEnabled: false },  // legacy body: no warmSurfaces
      { resource: '/notification-engine-config', groups: 'stock-app-access,site-admin' },
    ));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config.warmSurfaces).toEqual({ etfs: false }); // preserved
    expect((getItem() as { warmSurfaces: unknown }).warmSurfaces).toEqual({ etfs: false });
  });

  it('PUT engine-config: rejects (400) a malformed warmSurfaces (unknown key or non-boolean)', async () => {
    const { deps } = createFakeDeps();
    for (const warmSurfaces of [{ bogus: true }, { market: 'yes' }, { recs: 1 }]) {
      const res = await createHandler(deps)(makeEvent(
        'PUT', { notificationsEnabled: true, warmSurfaces },
        { resource: '/notification-engine-config', groups: 'stock-app-access,site-admin' },
      ));
      expect(res.statusCode).toBe(400);
    }
  });

  it('GET engine-config: returns the stored warmSurfaces (member-readable; only toggle booleans)', async () => {
    const { deps } = createFakeDeps({
      pk: 'SETTINGS', sk: 'NOTIFICATION_ENGINE_CONFIG#stock-analyser',
      notificationsEnabled: true, warmSurfaces: { metals: false }, updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const res = await createHandler(deps)(makeEvent('GET', undefined, { resource: '/notification-engine-config' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config.warmSurfaces).toEqual({ metals: false });
  });
});
