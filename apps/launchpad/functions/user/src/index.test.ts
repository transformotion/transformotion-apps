import { describe, expect, it } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resolveDisplayName, resolveActiveSelections, createHandler } from './index';

// ---------------------------------------------------------------------------
// Mock DDB factory
// ---------------------------------------------------------------------------

type Item = Record<string, unknown>;

interface MockStore {
  users?: Record<string, Item>;
  accounts?: Record<string, Item>;
  members?: Record<string, Item>;      // key: `${accountId}|${userId}`
  memberQueryByUserId?: Record<string, Item[]>;  // key: userId
  /** Captures every UpdateCommand input the handler issues, in order. */
  updates?: Array<Record<string, unknown>>;
}

function makeDdb(store: MockStore = {}): DynamoDBDocumentClient {
  return {
    send: async (cmd: unknown) => {
      const c = cmd as { constructor: { name: string }; input: Record<string, unknown> };
      const name = c.constructor.name;
      const input = c.input;

      if (name === 'GetCommand') {
        const table = input.TableName as string;
        const key = input.Key as Record<string, string>;
        if (table.includes('users')) {
          return { Item: store.users?.[key['userId']] };
        }
        if (table.includes('account-members')) {
          const k = `${key['accountId']}|${key['userId']}`;
          return { Item: store.members?.[k] };
        }
        if (table.includes('accounts')) {
          return { Item: store.accounts?.[key['accountId']] };
        }
        return { Item: undefined };
      }

      if (name === 'QueryCommand') {
        const vals = input.ExpressionAttributeValues as Record<string, string>;
        const uid = vals[':uid'];
        return { Items: store.memberQueryByUserId?.[uid] ?? [] };
      }

      if (name === 'BatchGetCommand') {
        const requestItems = input.RequestItems as Record<string, { Keys: Array<Record<string, string>> }>;
        const responses: Record<string, Item[]> = {};
        for (const [table, { Keys }] of Object.entries(requestItems)) {
          responses[table] = Keys.map(k => store.accounts?.[k['accountId']]).filter(Boolean) as Item[];
        }
        return { Responses: responses };
      }

      if (name === 'UpdateCommand') {
        store.updates?.push(input);
        return {};
      }

      throw new Error(`Unexpected command: ${name}`);
    },
  } as unknown as DynamoDBDocumentClient;
}

function makeHandler(store: MockStore = {}) {
  return createHandler({
    ddb: makeDdb(store),
    usersTable: 'launchpad-users-test',
    accountsTable: 'launchpad-accounts-test',
    accountMembersTable: 'launchpad-account-members-test',
  });
}

function event(
  resource: string,
  method: string,
  opts: {
    body?: unknown;
    pathParameters?: Record<string, string>;
    userId?: string;
    email?: string;
  } = {},
) {
  return {
    resource,
    httpMethod: method,
    pathParameters: opts.pathParameters ?? null,
    headers: {},
    requestContext: {
      authorizer: {
        claims: {
          sub: opts.userId ?? 'user-1',
          email: opts.email ?? 'user@example.com',
          'cognito:groups': '',
          apps: JSON.stringify([]),
          accounts: JSON.stringify({}),
          site_admin: 'false',
          app_admin: JSON.stringify([]),
        },
      },
    },
    body: opts.body === undefined ? null : JSON.stringify(opts.body),
    isBase64Encoded: false,
  } as never;
}

function body(res: { body: string }) {
  return JSON.parse(res.body);
}

// ---------------------------------------------------------------------------
// Test area 3: Display name fallback chain
// ---------------------------------------------------------------------------

describe('resolveDisplayName', () => {
  it('returns displayName when set and non-empty', () => {
    expect(resolveDisplayName({ displayName: 'Alice', email: 'alice@example.com' })).toBe('Alice');
  });

  it('trims whitespace from displayName', () => {
    expect(resolveDisplayName({ displayName: '  Bob  ', email: 'bob@example.com' })).toBe('Bob');
  });

  it('falls back to email local part when displayName is absent', () => {
    expect(resolveDisplayName({ email: 'carol@example.com' })).toBe('carol');
  });

  it('falls back to email local part when displayName is whitespace-only', () => {
    expect(resolveDisplayName({ displayName: '   ', email: 'dave@example.com' })).toBe('dave');
  });

  it('falls back to full email when local part is empty', () => {
    expect(resolveDisplayName({ email: '@example.com' })).toBe('@example.com');
  });
});

// ---------------------------------------------------------------------------
// Test area 2: Deterministic active-account default resolution (pure function)
// ---------------------------------------------------------------------------

describe('resolveActiveSelections', () => {
  it('returns the single account for an app with one membership', () => {
    const result = resolveActiveSelections(
      {},
      new Map([['stock-analyser', ['acc-1']]]),
      new Map(),
    );
    expect(result).toEqual([{ appSlug: 'stock-analyser', accountId: 'acc-1' }]);
  });

  it('returns stored valid selection when it is a known membership', () => {
    const result = resolveActiveSelections(
      { 'stock-analyser': 'acc-2' },
      new Map([['stock-analyser', ['acc-1', 'acc-2']]]),
      new Map([['acc-1', '2025-01-01T00:00:00Z'], ['acc-2', '2025-06-01T00:00:00Z']]),
    );
    expect(result).toEqual([{ appSlug: 'stock-analyser', accountId: 'acc-2' }]);
  });

  it('ignores stale stored selection and picks earliest by createdAt', () => {
    const result = resolveActiveSelections(
      { 'stock-analyser': 'acc-stale' },   // not in membership list
      new Map([['stock-analyser', ['acc-b', 'acc-a']]]),
      new Map([['acc-a', '2025-01-01T00:00:00Z'], ['acc-b', '2025-06-01T00:00:00Z']]),
    );
    expect(result).toEqual([{ appSlug: 'stock-analyser', accountId: 'acc-a' }]);
  });

  it('uses accountId tiebreak when createdAt values are identical', () => {
    const ts = '2025-01-01T00:00:00Z';
    const result = resolveActiveSelections(
      {},
      new Map([['stock-analyser', ['acc-b', 'acc-a']]]),
      new Map([['acc-a', ts], ['acc-b', ts]]),
    );
    expect(result).toEqual([{ appSlug: 'stock-analyser', accountId: 'acc-a' }]);
  });

  it('omits app from response when user has no valid memberships', () => {
    const result = resolveActiveSelections(
      {},
      new Map(),
      new Map(),
    );
    expect(result).toEqual([]);
  });

  it('handles multiple apps independently', () => {
    const result = resolveActiveSelections(
      { 'budget-tracker': 'bt-2' },
      new Map([
        ['stock-analyser', ['sa-1']],
        ['budget-tracker', ['bt-1', 'bt-2']],
      ]),
      new Map(),
    );
    expect(result).toContainEqual({ appSlug: 'stock-analyser', accountId: 'sa-1' });
    expect(result).toContainEqual({ appSlug: 'budget-tracker', accountId: 'bt-2' });
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test area 1: setActiveAccount fail-closed (uniform not-found semantics)
// ---------------------------------------------------------------------------

describe('setActiveAccount fail-closed', () => {
  it('returns 404 when account does not exist (uniform not-found)', async () => {
    const handler = makeHandler({ members: {} }); // no membership rows
    const res = await handler(event(
      '/api/user/active-accounts/{appSlug}',
      'PUT',
      {
        pathParameters: { appSlug: 'stock-analyser' },
        body: { accountId: 'non-existent-account' },
      },
    )) as { statusCode: number };
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when user is not a member of the account (same error, not 403)', async () => {
    // Account exists in accounts table but user has no membership row
    const handler = makeHandler({
      accounts: { 'acc-1': { accountId: 'acc-1', appSlug: 'stock-analyser' } },
      members: {}, // user-1 is NOT a member
    });
    const res = await handler(event(
      '/api/user/active-accounts/{appSlug}',
      'PUT',
      {
        pathParameters: { appSlug: 'stock-analyser' },
        body: { accountId: 'acc-1' },
        userId: 'user-1',
      },
    )) as { statusCode: number };
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when membership exists but account belongs to a different app', async () => {
    const handler = makeHandler({
      members: {
        'acc-1|user-1': { accountId: 'acc-1', userId: 'user-1', appSlug: 'budget-tracker', role: 'owner' },
      },
    });
    const res = await handler(event(
      '/api/user/active-accounts/{appSlug}',
      'PUT',
      {
        pathParameters: { appSlug: 'stock-analyser' },
        body: { accountId: 'acc-1' },
        userId: 'user-1',
      },
    )) as { statusCode: number };
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 and updated selections on valid membership', async () => {
    const handler = makeHandler({
      users: { 'user-1': { userId: 'user-1', email: 'user@example.com' } },
      members: {
        'acc-1|user-1': { accountId: 'acc-1', userId: 'user-1', appSlug: 'stock-analyser', role: 'owner' },
      },
      memberQueryByUserId: {
        'user-1': [{ accountId: 'acc-1', userId: 'user-1', appSlug: 'stock-analyser', role: 'owner' }],
      },
    });
    const res = await handler(event(
      '/api/user/active-accounts/{appSlug}',
      'PUT',
      {
        pathParameters: { appSlug: 'stock-analyser' },
        body: { accountId: 'acc-1' },
        userId: 'user-1',
      },
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const parsed = body(res);
    expect(parsed.selections).toContainEqual({ appSlug: 'stock-analyser', accountId: 'acc-1' });
  });

  it('resolves legacy rows (no appSlug on membership) via accounts table, then sets', async () => {
    const handler = makeHandler({
      users: { 'user-1': { userId: 'user-1', email: 'user@example.com' } },
      accounts: { 'acc-1': { accountId: 'acc-1', appSlug: 'stock-analyser', createdAt: '2025-01-01T00:00:00Z' } },
      members: {
        'acc-1|user-1': { accountId: 'acc-1', userId: 'user-1', role: 'owner' }, // no appSlug
      },
      memberQueryByUserId: {
        'user-1': [{ accountId: 'acc-1', userId: 'user-1', role: 'owner' }], // no appSlug
      },
    });
    const res = await handler(event(
      '/api/user/active-accounts/{appSlug}',
      'PUT',
      {
        pathParameters: { appSlug: 'stock-analyser' },
        body: { accountId: 'acc-1' },
        userId: 'user-1',
      },
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(body(res).selections).toContainEqual({ appSlug: 'stock-analyser', accountId: 'acc-1' });
  });

  it('self-heals: inits the activeAccounts map before the nested set when absent (#435)', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const handler = makeHandler({
      // User record WITHOUT an activeAccounts map (provisioned before #435 init).
      users: { 'user-1': { userId: 'user-1', email: 'user@example.com' } },
      members: {
        'acc-1|user-1': { accountId: 'acc-1', userId: 'user-1', appSlug: 'budget-tracker', role: 'owner' },
      },
      memberQueryByUserId: {
        'user-1': [{ accountId: 'acc-1', userId: 'user-1', appSlug: 'budget-tracker', role: 'owner' }],
      },
      updates,
    });
    const res = await handler(event(
      '/api/user/active-accounts/{appSlug}',
      'PUT',
      {
        pathParameters: { appSlug: 'budget-tracker' },
        body: { accountId: 'acc-1' },
        userId: 'user-1',
      },
    )) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    // Two writes, in order: idempotent map-init guard, then the nested per-app set.
    // The init must come first — a bare nested set throws ValidationException when
    // the parent map is absent.
    expect(updates).toHaveLength(2);
    expect(updates[0]!.UpdateExpression).toContain('if_not_exists(activeAccounts');
    expect(updates[1]!.UpdateExpression).toContain('activeAccounts.#app');
  });
});

// ---------------------------------------------------------------------------
// Test area 5: Profile endpoint field completeness
// ---------------------------------------------------------------------------

describe('GET /api/user/profile field completeness', () => {
  it('returns all required fields for a known user', async () => {
    const handler = makeHandler({
      users: {
        'user-1': {
          userId: 'user-1',
          email: 'user@example.com',
          displayName: 'Alice',
          status: 'active',
          profileComplete: true,
          preferences: { notificationsEnabled: true },
          updatedAt: '2026-01-01T00:00:00Z',
        },
      },
    });
    const res = await handler(event('/api/user/profile', 'GET', {
      userId: 'user-1',
      email: 'user@example.com',
    })) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    const parsed = body(res);
    expect(parsed).toMatchObject({
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Alice',
      status: 'active',
      profileComplete: true,
      preferences: { notificationsEnabled: true },
      updatedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns defaults for a user with no item in the table (first login before setup)', async () => {
    const handler = makeHandler({ users: {} }); // no item
    const res = await handler(event('/api/user/profile', 'GET', {
      userId: 'new-user',
      email: 'new@example.com',
    })) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    const parsed = body(res);
    expect(parsed.userId).toBe('new-user');
    expect(parsed.email).toBe('new@example.com');
    expect(parsed.displayName).toBe('new'); // email local part fallback
    expect(parsed.status).toBe('active');
    expect(parsed.profileComplete).toBe(false);
    expect(parsed.preferences).toEqual({ notificationsEnabled: false });
  });

  it('uses email local part when displayName is absent from user item', async () => {
    const handler = makeHandler({
      users: {
        'user-2': { userId: 'user-2', email: 'carol@example.com', status: 'active' },
      },
    });
    const res = await handler(event('/api/user/profile', 'GET', {
      userId: 'user-2',
      email: 'carol@example.com',
    })) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    expect(body(res).displayName).toBe('carol');
  });
});
