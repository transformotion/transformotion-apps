import { describe, expect, it } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createHandler } from './index';

interface Seed { accounts?: Record<string, Record<string, unknown>> }

function makeHandler(seed: Seed = {}) {
  const puts: Array<Record<string, unknown>> = [];
  const ddb = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = cmd.constructor.name;
      const input = cmd.input as { TableName?: string; Key?: Record<string, string>; Item?: Record<string, unknown> };
      if (name === 'GetCommand' && input.TableName === 'accounts') return { Item: seed.accounts?.[input.Key!.accountId] };
      if (name === 'PutCommand' && input.TableName === 'invitations') { puts.push(input.Item ?? {}); return {}; }
      throw new Error(`unexpected ddb command ${name} on ${input.TableName}`);
    },
  } as unknown as DynamoDBDocumentClient;
  const handler = createHandler({ ddb, invitationsTable: 'invitations', accountsTable: 'accounts' });
  return { handler, puts };
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
