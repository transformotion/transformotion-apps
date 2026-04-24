import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';

// ── Hoisted mock functions (must be declared before vi.mock factories) ────────

const { mockSendDdb, mockSendCognito } = vi.hoisted(() => ({
  mockSendDdb:     vi.fn(),
  mockSendCognito: vi.fn(),
}));

// ── AWS SDK mocks ─────────────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockReturnValue({ send: mockSendDdb }),
  },
  QueryCommand:    vi.fn().mockImplementation(input => ({ input })),
  BatchGetCommand: vi.fn().mockImplementation(input => ({ input })),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn().mockImplementation(() => ({ send: mockSendCognito })),
  AdminAddUserToGroupCommand:    vi.fn().mockImplementation(input => ({ input })),
  AdminRemoveUserFromGroupCommand: vi.fn().mockImplementation(input => ({ input })),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { handler } from '../index.js';

// ── Environment ───────────────────────────────────────────────────────────────

const MEMBERS_TABLE  = 'platform.account-members-test';
const ACCOUNTS_TABLE = 'platform.accounts-test';

process.env.ACCOUNT_MEMBERS_TABLE = MEMBERS_TABLE;
process.env.ACCOUNTS_TABLE        = ACCOUNTS_TABLE;
process.env.USER_POOL_ID          = 'us-east-1_test';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(groups: string[] = []): PreTokenGenerationTriggerEvent {
  return {
    version:    '1',
    triggerSource: 'TokenGeneration_Authentication',
    region:     'ap-southeast-2',
    userPoolId: 'us-east-1_test',
    userName:   'test-user-sub',
    callerContext: { awsSdkVersion: 'test', clientId: 'test-client' },
    request: {
      userAttributes: { sub: 'test-user-sub', email: 'test@example.com' },
      groupConfiguration: { groupsToOverride: groups, iamRolesOverride: [], preferredRole: '' },
    },
    response: {},
  } as unknown as PreTokenGenerationTriggerEvent;
}

function mockDdb(memberRows: object[], accountRows: object[]) {
  mockSendDdb.mockImplementation((cmd: { input: Record<string, unknown> }) => {
    if (cmd.input['IndexName'] === 'userId-index') {
      return Promise.resolve({ Items: memberRows });
    }
    const tableName = Object.keys(cmd.input['RequestItems'] as Record<string, unknown>)[0];
    return Promise.resolve({ Responses: { [tableName]: accountRows } });
  });
}

function getClaims(result: PreTokenGenerationTriggerEvent) {
  return result.response.claimsOverrideDetails!.claimsToAddOrOverride!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSendCognito.mockResolvedValue({});
});

describe('pre-token generation', () => {
  it('1. single-app — builds correct claims for stock-signal', async () => {
    mockDdb(
      [{ accountId: 'acct-1', userId: 'test-user-sub', role: 'owner' }],
      [{ accountId: 'acct-1', appSlug: 'stock-signal' }],
    );

    const claims = getClaims(await handler(makeEvent(['stock-app-access'])));

    expect(JSON.parse(claims.apps)).toEqual(['stock-signal']);
    expect(JSON.parse(claims.accounts)).toEqual({
      'stock-signal': [{ accountId: 'acct-1', role: 'owner' }],
    });
    expect(claims.site_admin).toBe('false');
  });

  it('2. multi-app — both apps appear in claims', async () => {
    mockDdb(
      [
        { accountId: 'acct-1', userId: 'test-user-sub', role: 'owner' },
        { accountId: 'acct-2', userId: 'test-user-sub', role: 'member' },
      ],
      [
        { accountId: 'acct-1', appSlug: 'stock-signal' },
        { accountId: 'acct-2', appSlug: 'budget-tracker' },
      ],
    );

    const claims = getClaims(await handler(makeEvent(['stock-app-access', 'budget-app-access'])));
    const apps = JSON.parse(claims.apps) as string[];

    expect(apps).toContain('stock-signal');
    expect(apps).toContain('budget-tracker');
    const accounts = JSON.parse(claims.accounts) as Record<string, unknown>;
    expect(accounts['stock-signal']).toHaveLength(1);
    expect(accounts['budget-tracker']).toHaveLength(1);
    expect(claims.site_admin).toBe('false');
  });

  it('3. site-admin — apps includes all slugs regardless of group membership', async () => {
    mockDdb([], []);

    const claims = getClaims(await handler(makeEvent(['site-admin'])));

    expect(JSON.parse(claims.apps)).toEqual(['stock-signal', 'budget-tracker']);
    expect(claims.site_admin).toBe('true');
  });

  it('4. missing group — AdminAddUserToGroup called, stock-signal added to apps', async () => {
    mockDdb(
      [{ accountId: 'acct-1', userId: 'test-user-sub', role: 'member' }],
      [{ accountId: 'acct-1', appSlug: 'stock-signal' }],
    );

    const claims = getClaims(await handler(makeEvent([])));

    expect(mockSendCognito).toHaveBeenCalledTimes(1);
    const [addCall] = mockSendCognito.mock.calls;
    expect((addCall[0] as { input: { GroupName: string } }).input.GroupName).toBe('stock-app-access');
    expect(JSON.parse(claims.apps)).toContain('stock-signal');
  });

  it('5. orphan group — AdminRemoveUserFromGroup called, budget-tracker absent from apps', async () => {
    mockDdb([], []);

    const claims = getClaims(await handler(makeEvent(['budget-app-access'])));

    expect(mockSendCognito).toHaveBeenCalledTimes(1);
    const [removeCall] = mockSendCognito.mock.calls;
    expect((removeCall[0] as { input: { GroupName: string } }).input.GroupName).toBe('budget-app-access');
    expect(JSON.parse(claims.apps)).not.toContain('budget-tracker');
  });

  it('6. site-admin keeps orphan group — no AdminRemoveUserFromGroup call', async () => {
    mockDdb([], []);

    const claims = getClaims(await handler(makeEvent(['site-admin', 'budget-app-access'])));

    expect(mockSendCognito).not.toHaveBeenCalled();
    expect(JSON.parse(claims.apps)).toContain('budget-tracker');
  });

  it('7. no memberships no site-admin — empty apps and accounts', async () => {
    mockDdb([], []);

    const claims = getClaims(await handler(makeEvent([])));

    expect(JSON.parse(claims.apps)).toEqual([]);
    expect(JSON.parse(claims.accounts)).toEqual({});
    expect(claims.site_admin).toBe('false');
  });

  it('8. claim values are strings — V1 trigger claimsToAddOrOverride requires StringMap', async () => {
    mockDdb(
      [{ accountId: 'acct-1', userId: 'test-user-sub', role: 'owner' }],
      [{ accountId: 'acct-1', appSlug: 'stock-signal' }],
    );

    const claims = getClaims(await handler(makeEvent(['stock-app-access'])));

    expect(typeof claims.apps).toBe('string');
    expect(typeof claims.accounts).toBe('string');
    expect(typeof claims.site_admin).toBe('string');
  });

  it('9. DynamoDB error — returns event unchanged, no claimsOverrideDetails', async () => {
    mockSendDdb.mockRejectedValue(new Error('DynamoDB unavailable'));

    const result = await handler(makeEvent(['stock-app-access']));

    expect(result.response.claimsOverrideDetails).toBeUndefined();
  });

  it('10. Cognito error — logs and continues, returns claims on pre-reconciliation state', async () => {
    // User has a stock-signal account but is not in stock-app-access.
    // AdminAddUserToGroup throws. Reconciler logs and continues without adding group.
    // Claims are still returned; apps is [] since the group was not added.
    mockDdb(
      [{ accountId: 'acct-1', userId: 'test-user-sub', role: 'owner' }],
      [{ accountId: 'acct-1', appSlug: 'stock-signal' }],
    );
    mockSendCognito.mockRejectedValue(new Error('Cognito unavailable'));

    const result = await handler(makeEvent([]));

    const claims = getClaims(result);
    expect(claims).toBeDefined();
    expect(JSON.parse(claims.apps)).not.toContain('stock-signal');
  });
});
