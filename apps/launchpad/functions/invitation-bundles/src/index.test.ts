import { describe, expect, it } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createHandler } from './index';

interface Seed {
  accounts?: Record<string, Record<string, unknown>>;
  bundles?: Record<string, Record<string, unknown>>;             // keyed by invitationId
  members?: Record<string, { role: string; status?: string }>;   // keyed by `${accountId}#${userId}`
}

function makeHandler(seed: Seed = {}) {
  const puts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const ddb = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = cmd.constructor.name;
      const input = cmd.input as { TableName?: string; Key?: Record<string, string>; Item?: Record<string, unknown> };
      if (name === 'GetCommand' && input.TableName === 'accounts') return { Item: seed.accounts?.[input.Key!.accountId] };
      if (name === 'GetCommand' && input.TableName === 'invitations') return { Item: seed.bundles?.[input.Key!.invitationId] };
      if (name === 'GetCommand' && input.TableName === 'members') return { Item: seed.members?.[`${input.Key!.accountId}#${input.Key!.userId}`] };
      if (name === 'PutCommand' && input.TableName === 'invitations') { puts.push(input.Item ?? {}); return {}; }
      if (name === 'UpdateCommand' && input.TableName === 'invitations') { updates.push(input); return {}; }
      throw new Error(`unexpected ddb command ${name} on ${input.TableName}`);
    },
  } as unknown as DynamoDBDocumentClient;
  const handler = createHandler({ ddb, invitationsTable: 'invitations', accountsTable: 'accounts', accountMembersTable: 'members' });
  return { handler, puts, updates };
}

/** DELETE /api/invitations/bundles/{bundleId}/grants/{grantId} as `sub` with `groups`. */
function cancelEvent(groups: string, bundleId: string, grantId: string, sub = 'caller-1') {
  return {
    resource: '/api/invitations/bundles/{bundleId}/grants/{grantId}',
    httpMethod: 'DELETE',
    pathParameters: { bundleId, grantId },
    headers: {},
    requestContext: { authorizer: { claims: { sub, email: 'caller@example.com', 'cognito:groups': groups, apps: '[]', accounts: '{}' } } },
    body: null,
    isBase64Encoded: false,
  } as never;
}

/** A two-grant pending bundle targeting acct-1 (g1) and acct-2 (g2). */
function twoGrantBundle() {
  return {
    'b1': {
      invitationId: 'b1', bundleId: 'b1', email: 'inv@example.com', invitedBy: 'admin-9',
      createdAt: '2026-06-01T00:00:00.000Z', expiresAt: 1798761600, status: 'pending',
      grants: [
        { grantId: 'g1', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acct-1', role: 'member' },
        { grantId: 'g2', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acct-2', role: 'viewer' },
      ],
    },
  };
}

function event(groups: string, body: unknown) {
  return {
    resource: '/api/invitations/bundles',
    httpMethod: 'POST',
    pathParameters: null,
    headers: {},
    requestContext: { authorizer: { claims: { sub: 'sender-1', email: 'sender@example.com', 'cognito:groups': groups, apps: '[]', accounts: '{}' } } },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as never;
}

const parse = (res: { body: string }) => JSON.parse(res.body);

describe('invitation-bundles — POST /api/invitations/bundles (M11 Chunk 3, Option A)', () => {
  it('site-admin can create an app-grant bundle (roleless, persisted in A5 read shape)', async () => {
    const { handler, puts } = makeHandler();
    const res = (await handler(event('site-admin', {
      email: 'Invitee@Example.com',
      grants: [{ kind: 'app-grant', appSlug: 'stock-analyser' }],
    }))) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    const b = parse(res);
    expect(b.decisions[0]).toMatchObject({ index: 0, allowed: true });
    expect(b.bundle.grants[0]).toMatchObject({ kind: 'app-grant', appSlug: 'stock-analyser' });
    expect(b.bundle.grants[0].grantId).toBeTruthy();
    expect(b.bundle).toMatchObject({ email: 'invitee@example.com', status: 'pending', invitedBy: 'sender-1' });
    // Persisted keyed by invitationId = bundleId (the shape A5 redeem reads).
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ invitationId: b.bundle.bundleId, email: 'invitee@example.com' });
    expect(Array.isArray((puts[0] as { grants: unknown[] }).grants)).toBe(true);
  });

  it('app-admin can grant for THEIR app but is denied for another app (per-grant, fail closed)', async () => {
    const { handler, puts } = makeHandler();
    const res = (await handler(event('budget-app-admin', {
      email: 'invitee@example.com',
      grants: [
        { kind: 'app-grant', appSlug: 'budget-tracker' },   // allowed (admin for budget)
        { kind: 'app-grant', appSlug: 'stock-analyser' },   // denied (not admin for stock)
      ],
    }))) as { body: string };
    const b = parse(res);
    expect(b.decisions[0]).toMatchObject({ allowed: true });
    expect(b.decisions[1]).toMatchObject({ allowed: false });
    // Partial acceptance: bundle holds only the authorized grant.
    expect(b.bundle.grants).toHaveLength(1);
    expect(b.bundle.grants[0].appSlug).toBe('budget-tracker');
    expect(puts).toHaveLength(1);
  });

  it('a caller with NO grant authority gets no bundle (all denied, nothing persisted)', async () => {
    const { handler, puts } = makeHandler();
    const res = (await handler(event('stock-app-access', {  // access only, not admin/site-admin
      email: 'invitee@example.com',
      grants: [{ kind: 'app-grant', appSlug: 'stock-analyser' }],
    }))) as { body: string };
    const b = parse(res);
    expect(b.decisions[0]).toMatchObject({ allowed: false });
    expect(b.bundle).toBeUndefined();
    expect(puts).toHaveLength(0);
  });

  it('same-app conflict: app-grant + account-invite for one app are both blocked', async () => {
    const { handler, puts } = makeHandler({ accounts: { 'acct-1': { accountId: 'acct-1', appSlug: 'stock-analyser' } } });
    const res = (await handler(event('site-admin', {
      email: 'invitee@example.com',
      grants: [
        { kind: 'app-grant', appSlug: 'stock-analyser' },
        { kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acct-1', role: 'member' },
      ],
    }))) as { body: string };
    const b = parse(res);
    expect(b.decisions[0]).toMatchObject({ allowed: false });
    expect(b.decisions[1]).toMatchObject({ allowed: false });
    expect(b.bundle).toBeUndefined();
    expect(puts).toHaveLength(0);
  });

  it('account-invite carries the role and validates the account exists / app matches', async () => {
    const { handler } = makeHandler({ accounts: { 'acct-1': { accountId: 'acct-1', appSlug: 'budget-tracker' } } });
    const res = (await handler(event('site-admin', {
      email: 'invitee@example.com',
      grants: [{ kind: 'account-invite', appSlug: 'budget-tracker', accountId: 'acct-1', role: 'manager' }],
    }))) as { body: string };
    const b = parse(res);
    expect(b.decisions[0]).toMatchObject({ allowed: true });
    expect(b.bundle.grants[0]).toMatchObject({ kind: 'account-invite', accountId: 'acct-1', role: 'manager', appSlug: 'budget-tracker' });
  });

  it('account-invite to a missing account is denied', async () => {
    const { handler } = makeHandler({ accounts: {} });
    const res = (await handler(event('site-admin', {
      email: 'invitee@example.com',
      grants: [{ kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'ghost', role: 'member' }],
    }))) as { body: string };
    expect(parse(res).decisions[0]).toMatchObject({ allowed: false });
  });

  it('400 on missing email / empty grants', async () => {
    const { handler } = makeHandler();
    expect(((await handler(event('site-admin', { grants: [{ kind: 'app-grant', appSlug: 'stock-analyser' }] }))) as { statusCode: number }).statusCode).toBe(400);
    expect(((await handler(event('site-admin', { email: 'a@b.com', grants: [] }))) as { statusCode: number }).statusCode).toBe(400);
  });
});

describe('invitation-bundles — DELETE …/grants/{grantId} cancel (M11, #558)', () => {
  // Authorization: owner/manager of the grant's TARGET account (live row) OR
  // app-admin-for-app OR site-admin. Target-resolved + fail-closed.

  it('an OWNER of the grant\'s account cancels it — even one a DIFFERENT admin sent (it is their account)', async () => {
    const { handler, updates } = makeHandler({
      bundles: twoGrantBundle(),                                   // invitedBy: admin-9 (a different admin)
      members: { 'acct-1#caller-1': { role: 'owner', status: 'active' } },
    });
    const res = (await handler(cancelEvent('', 'b1', 'g1'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    // Grant removed; the OTHER grant survives → bundle stays pending.
    expect(updates).toHaveLength(1);
    const vals = (updates[0] as { ExpressionAttributeValues: Record<string, unknown> }).ExpressionAttributeValues;
    expect((vals[':g'] as unknown[]).map((g) => (g as { grantId: string }).grantId)).toEqual(['g2']);
    expect(vals[':s']).toBe('pending');
    expect(JSON.parse(res.body).bundle.grants).toHaveLength(1);
  });

  it('a MANAGER may cancel; cancelling the LAST grant marks the bundle revoked', async () => {
    const single = { 'b1': { ...twoGrantBundle()['b1'], grants: [twoGrantBundle()['b1'].grants[0]] } };
    const { handler, updates } = makeHandler({
      bundles: single,
      members: { 'acct-1#caller-1': { role: 'manager', status: 'active' } },
    });
    const res = (await handler(cancelEvent('', 'b1', 'g1'))) as { statusCode: number };
    expect(res.statusCode).toBe(200);
    const vals = (updates[0] as { ExpressionAttributeValues: Record<string, unknown> }).ExpressionAttributeValues;
    expect(vals[':g']).toEqual([]);
    expect(vals[':s']).toBe('revoked');
  });

  it('site-admin (supervisory) and app-admin-for-app may cancel without account membership', async () => {
    const siteAdmin = makeHandler({ bundles: twoGrantBundle() });        // no members seed
    expect(((await siteAdmin.handler(cancelEvent('site-admin', 'b1', 'g1'))) as { statusCode: number }).statusCode).toBe(200);
    const appAdmin = makeHandler({ bundles: twoGrantBundle() });
    expect(((await appAdmin.handler(cancelEvent('stock-app-admin', 'b1', 'g1'))) as { statusCode: number }).statusCode).toBe(200);
  });

  it('REJECTS (403) an unauthorized caller — a plain VIEWER of the account, no admin authority', async () => {
    const { handler, updates } = makeHandler({
      bundles: twoGrantBundle(),
      members: { 'acct-1#caller-1': { role: 'viewer', status: 'active' } }, // viewer ≠ owner/manager
    });
    const res = (await handler(cancelEvent('', 'b1', 'g1'))) as { statusCode: number };
    expect(res.statusCode).toBe(403);
    expect(updates).toHaveLength(0); // fail closed — nothing written
  });

  it('REJECTS (403) a caller with NO membership on the target account and no admin group', async () => {
    const { handler, updates } = makeHandler({ bundles: twoGrantBundle() }); // no members seed → undefined row
    expect(((await handler(cancelEvent('', 'b1', 'g1'))) as { statusCode: number }).statusCode).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('404 when the bundle or the grant does not resolve (fail closed)', async () => {
    const missingBundle = makeHandler({ members: { 'acct-1#caller-1': { role: 'owner' } } });
    expect(((await missingBundle.handler(cancelEvent('', 'nope', 'g1'))) as { statusCode: number }).statusCode).toBe(404);
    const missingGrant = makeHandler({ bundles: twoGrantBundle(), members: { 'acct-1#caller-1': { role: 'owner' } } });
    expect(((await missingGrant.handler(cancelEvent('', 'b1', 'ghost'))) as { statusCode: number }).statusCode).toBe(404);
  });
});
