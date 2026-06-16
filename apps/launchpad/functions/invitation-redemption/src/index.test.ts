import { describe, expect, it } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { createHandler } from './index';

interface Seed {
  bundles?: Record<string, Record<string, unknown>>;
  accounts?: Record<string, Record<string, unknown>>;
  users?: Record<string, Record<string, unknown>>;
  members?: Record<string, Record<string, unknown>>; // key `${accountId}|${userId}`
}

function makeHandler(seed: Seed) {
  const memberPuts: Array<Record<string, unknown>> = [];
  const groupAdds: Array<Record<string, unknown>> = [];
  const statusUpdates: string[] = [];

  const ddb = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = cmd.constructor.name;
      const input = cmd.input as { TableName?: string; Key?: Record<string, string>; Item?: Record<string, unknown> };
      const t = input.TableName;
      const key = input.Key ?? {};
      if (name === 'GetCommand') {
        if (t === 'invitations') return { Item: seed.bundles?.[key.invitationId] };
        if (t === 'accounts') return { Item: seed.accounts?.[key.accountId] };
        if (t === 'users') return { Item: seed.users?.[key.userId] };
        if (t === 'members') return { Item: seed.members?.[`${key.accountId}|${key.userId}`] };
      }
      if (name === 'PutCommand' && t === 'members') { memberPuts.push(input.Item ?? {}); return {}; }
      if (name === 'UpdateCommand' && t === 'invitations') { statusUpdates.push(key.invitationId); return {}; }
      throw new Error(`unexpected ddb command ${name} on ${t}`);
    },
  } as unknown as DynamoDBDocumentClient;

  const cognito = {
    send: async (cmd: { input: Record<string, unknown> }) => { groupAdds.push(cmd.input); return {}; },
  } as unknown as CognitoIdentityProviderClient;

  const handler = createHandler({
    ddb,
    cognito,
    invitationsTable: 'invitations',
    accountsTable: 'accounts',
    accountMembersTable: 'members',
    usersTable: 'users',
    userPoolId: 'pool',
    appRegistryJson: JSON.stringify({
      apps: [
        { slug: 'stock-analyser', displayName: 'Stock Signal Analyser' },
        { slug: 'budget-tracker', displayName: 'Budget Tracker' },
      ],
    }),
  });

  return { handler, memberPuts, groupAdds, statusUpdates };
}

function event(bundleId: string, email = 'invitee@example.com', groups = '') {
  return {
    resource: '/api/invitations/bundles/{bundleId}/redeem',
    httpMethod: 'POST',
    pathParameters: { bundleId },
    headers: {},
    requestContext: {
      authorizer: { claims: { sub: 'user-invitee', email, 'cognito:groups': groups, apps: '[]', accounts: '{}' } },
    },
    body: null,
    isBase64Encoded: false,
  } as never;
}

const body = (res: { body: string }) => JSON.parse(res.body);
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

const accountInviteBundle = {
  invitationId: 'b-1',
  email: 'invitee@example.com',
  expiresAt: future,
  status: 'pending',
  grants: [{ grantId: 'g-1', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acct-1', role: 'member' }],
};
const appGrantBundle = {
  invitationId: 'b-2',
  email: 'invitee@example.com',
  expiresAt: future,
  status: 'pending',
  grants: [{ grantId: 'g-2', kind: 'app-grant', appSlug: 'budget-tracker' }],
};
const account1 = { accountId: 'acct-1', appSlug: 'stock-analyser', name: 'Household' };

describe('invitation redemption — M11 A5', () => {
  it('account-invite: adds membership at the grant role + ensures the access group', async () => {
    const { handler, memberPuts, groupAdds, statusUpdates } = makeHandler({
      bundles: { 'b-1': accountInviteBundle },
      accounts: { 'acct-1': account1 },
    });

    const res = (await handler(event('b-1'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const b = body(res) as { bundleId: string; userId: string; userCreated: boolean; results: Array<Record<string, unknown>> };
    expect(b).toMatchObject({ bundleId: 'b-1', userId: 'user-invitee', userCreated: false });
    expect(b.results[0]).toMatchObject({
      grantId: 'g-1',
      kind: 'account-invite',
      outcome: 'accepted',
      resultingAccountId: 'acct-1',
    });

    // membership at the grant role, with appSlug denormalised (for pre-token groupByApp)
    expect(memberPuts).toHaveLength(1);
    expect(memberPuts[0]).toMatchObject({ accountId: 'acct-1', userId: 'user-invitee', role: 'member', appSlug: 'stock-analyser' });
    // membership ⟹ access: the EXACT contract access group string
    expect(groupAdds).toHaveLength(1);
    expect(groupAdds[0]).toMatchObject({ Username: 'user-invitee', GroupName: 'stock-app-access' });
    expect(statusUpdates).toEqual(['b-1']);
  });

  it('account-invite: idempotent — already a member yields duplicate, no write', async () => {
    const { handler, memberPuts, groupAdds } = makeHandler({
      bundles: { 'b-1': accountInviteBundle },
      accounts: { 'acct-1': account1 },
      members: { 'acct-1|user-invitee': { accountId: 'acct-1', userId: 'user-invitee', role: 'member' } },
    });

    const res = (await handler(event('b-1'))) as { body: string };
    expect(body(res).results[0]).toMatchObject({ outcome: 'duplicate', resultingAccountId: 'acct-1' });
    expect(memberPuts).toHaveLength(0);
    expect(groupAdds).toHaveLength(0);
  });

  it('app-grant: STATE-EQUIVALENCE — ensures access group, creates ZERO accounts/memberships', async () => {
    const { handler, memberPuts, groupAdds } = makeHandler({ bundles: { 'b-2': appGrantBundle } });

    const res = (await handler(event('b-2'))) as { body: string };
    const r = body(res).results[0];
    expect(r).toMatchObject({ grantId: 'g-2', kind: 'app-grant', outcome: 'accepted' });
    // No account to land in → no resultingAccountId (the "access, no accounts" state).
    expect('resultingAccountId' in r).toBe(false);
    // EXACTLY the seeded "Priya" shape: holds the access group, zero memberships.
    expect(memberPuts).toHaveLength(0);
    expect(groupAdds).toHaveLength(1);
    expect(groupAdds[0]).toMatchObject({ Username: 'user-invitee', GroupName: 'budget-app-access' });
  });

  it('app-grant: idempotent duplicate guard — already has access → no-op, no double-grant', async () => {
    const { handler, groupAdds } = makeHandler({ bundles: { 'b-2': appGrantBundle } });

    // Token already carries the access group (group-authoritative).
    const res = (await handler(event('b-2', 'invitee@example.com', 'budget-app-access'))) as { body: string };
    expect(body(res).results[0]).toMatchObject({ outcome: 'duplicate' });
    expect(groupAdds).toHaveLength(0);
  });

  it('invitee-only: a caller whose email differs from the bundle is rejected (403)', async () => {
    const { handler } = makeHandler({ bundles: { 'b-2': appGrantBundle } });
    const res = (await handler(event('b-2', 'someone-else@example.com'))) as { statusCode: number };
    expect(res.statusCode).toBe(403);
  });

  it('missing bundle → 404', async () => {
    const { handler } = makeHandler({});
    const res = (await handler(event('nope'))) as { statusCode: number };
    expect(res.statusCode).toBe(404);
  });

  it('expired bundle → all grants expired, no writes', async () => {
    const { handler, memberPuts, groupAdds, statusUpdates } = makeHandler({
      bundles: { 'b-3': { ...appGrantBundle, invitationId: 'b-3', expiresAt: past } },
    });
    const res = (await handler(event('b-3'))) as { body: string };
    expect(body(res).results[0]).toMatchObject({ outcome: 'expired' });
    expect(memberPuts).toHaveLength(0);
    expect(groupAdds).toHaveLength(0);
    expect(statusUpdates).toHaveLength(0);
  });
});
