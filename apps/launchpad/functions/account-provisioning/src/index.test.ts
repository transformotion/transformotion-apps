import { describe, expect, it } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { createHandler } from './index';

interface Store {
  /** Existing user item, or undefined for a first-login (no item) user. */
  user?: Record<string, unknown>;
  /** First membership row returned by the userId-index query, if any. */
  membership?: Record<string, unknown>;
}

function makeDeps(
  store: Store,
  opts: { cognitoAttrs?: Array<{ Name: string; Value: string }>; cognitoThrows?: boolean } = {},
) {
  const puts: Array<Record<string, unknown>> = [];

  const ddb = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = cmd.constructor.name;
      if (name === 'GetCommand') return { Item: store.user };
      if (name === 'PutCommand') {
        puts.push(cmd.input['Item'] as Record<string, unknown>);
        return {};
      }
      if (name === 'QueryCommand') return { Items: store.membership ? [store.membership] : [] };
      throw new Error(`unexpected ddb command ${name}`);
    },
  } as unknown as DynamoDBDocumentClient;

  const cognito = {
    send: async () => {
      if (opts.cognitoThrows) throw new Error('cognito failure');
      return { UserAttributes: opts.cognitoAttrs ?? [] };
    },
  } as unknown as CognitoIdentityProviderClient;

  return { ddb, cognito, puts };
}

function makeHandler(store: Store, opts = {}) {
  const { ddb, cognito, puts } = makeDeps(store, opts);
  const handler = createHandler({
    ddb,
    cognito,
    usersTable: 'launchpad-users-test',
    accountMembersTable: 'launchpad-account-members-test',
    userPoolId: 'pool-test',
  });
  return { handler, puts };
}

function event(resource = '/auth/setup', userId = 'user-1', email = 'user@example.com') {
  return {
    resource,
    httpMethod: 'POST',
    pathParameters: null,
    headers: {},
    requestContext: {
      authorizer: {
        claims: {
          sub: userId,
          email,
          'cognito:groups': '',
          apps: '[]',
          accounts: '{}',
          site_admin: 'false',
        },
      },
    },
    body: null,
    isBase64Encoded: false,
  } as never;
}

function body(res: { body: string }) {
  return JSON.parse(res.body);
}

describe('account-provisioning /auth/setup — m16.1.0 D11 profile bootstrap', () => {
  it('first login: creates profile, returns { userCreated:true, profileComplete:false }, NO accountId', async () => {
    const { handler, puts } = makeHandler(
      { user: undefined },
      { cognitoAttrs: [{ Name: 'given_name', Value: 'Ada' }, { Name: 'family_name', Value: 'Lovelace' }] },
    );

    const res = (await handler(event())) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    const b = body(res);
    expect(b).toEqual({ userCreated: true, profileComplete: false });
    expect('accountId' in b).toBe(false); // no '' sentinel, field omitted
    // profile record created with M16 fields and the Cognito-derived display name
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({
      userId: 'user-1',
      displayName: 'Ada Lovelace',
      profileComplete: false,
      status: 'active',
    });
  });

  it('first login with no Cognito name: OMITS displayName (no email fallback — #494/#496)', async () => {
    const { handler, puts } = makeHandler({ user: undefined }, { cognitoThrows: true });

    const res = (await handler(event('/auth/setup', 'user-2', 'carol@example.com'))) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({ userCreated: true, profileComplete: false });
    // No given/family from the IdP → the row stores NO displayName, so reads resolve
    // the name from the token rather than an email-derived value (which would beat it).
    expect(puts[0]).not.toHaveProperty('displayName');
    // …but the canonical bootstrap defaults are still written, so the row is a
    // first-class directory entity identical to the redemption-upsert shape.
    expect(puts[0]).toMatchObject({
      userId: 'user-2',
      email: 'carol@example.com',
      emailLower: 'carol@example.com',
      status: 'active',
      preferences: { notificationsEnabled: false },
      profileComplete: false,
      activeAccounts: {},
    });
  });

  it('existing user with an account: { userCreated:false, profileComplete, accountId } and no write', async () => {
    const { handler, puts } = makeHandler({
      user: { userId: 'user-1', email: 'user@example.com', profileComplete: true },
      membership: { accountId: 'acct-1' },
    });

    const res = (await handler(event())) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({ userCreated: false, profileComplete: true, accountId: 'acct-1' });
    expect(puts).toHaveLength(0); // never re-creates an existing profile
  });

  it('existing user with no account: omits accountId, surfaces stored profileComplete', async () => {
    const { handler } = makeHandler({
      user: { userId: 'user-1', email: 'user@example.com', profileComplete: false },
      membership: undefined,
    });

    const res = (await handler(event())) as { statusCode: number; body: string };

    const b = body(res);
    expect(b).toEqual({ userCreated: false, profileComplete: false });
    expect('accountId' in b).toBe(false);
  });

  it('existing user missing profileComplete field: defaults to false', async () => {
    const { handler } = makeHandler({
      user: { userId: 'user-1', email: 'user@example.com' }, // legacy row, no profileComplete
      membership: { accountId: 'acct-9' },
    });

    const res = (await handler(event())) as { statusCode: number; body: string };

    expect(body(res)).toEqual({ userCreated: false, profileComplete: false, accountId: 'acct-9' });
  });

  it('rejects an unrecognised route with 400', async () => {
    const { handler } = makeHandler({ user: { userId: 'user-1', email: 'user@example.com' } });

    const res = (await handler(event('/auth/other'))) as { statusCode: number };

    expect(res.statusCode).toBe(400);
  });
});
