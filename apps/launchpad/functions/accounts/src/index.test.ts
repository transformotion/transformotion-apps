import { describe, expect, it } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { createAccount, type CreateAccountDeps } from './index';

// M11 A4 — POST /accounts (self-service create-first-account). createAccount is
// the testable unit: account + owner membership + ensure {app}-app-access group,
// gated on the caller already holding that group (auth.md "Create their own account").

interface Recorded {
  ddbCommands: Array<{ name: string; input: Record<string, unknown> }>;
  groupAdds: Array<Record<string, unknown>>;
}

function makeDeps(opts: { cognitoThrows?: boolean } = {}): { deps: CreateAccountDeps; rec: Recorded } {
  const rec: Recorded = { ddbCommands: [], groupAdds: [] };

  const ddb = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      rec.ddbCommands.push({ name: cmd.constructor.name, input: cmd.input });
      return {};
    },
  } as unknown as DynamoDBDocumentClient;

  const cognito = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      if (cmd.constructor.name === 'AdminAddUserToGroupCommand') {
        if (opts.cognitoThrows) throw new Error('cognito blip');
        rec.groupAdds.push(cmd.input);
        return {};
      }
      throw new Error(`unexpected cognito command ${cmd.constructor.name}`);
    },
  } as unknown as CognitoIdentityProviderClient;

  return {
    deps: { ddb, cognito, accountsTable: 'accounts-test', accountMembersTable: 'members-test', userPoolId: 'pool-test' },
    rec,
  };
}

// aud 'client-sa' maps to stock-analyser via the vitest.config env → access group
// 'stock-app-access'. groups carries the caller's cognito:groups for the gate.
// m16.6.0: { name, appSlug } in the body. Omit a field by passing `undefined`.
function event(name: unknown, appSlug: unknown) {
  const body: Record<string, unknown> = {};
  if (name !== undefined) body.name = name;
  if (appSlug !== undefined) body.appSlug = appSlug;
  return {
    resource: '/accounts',
    httpMethod: 'POST',
    pathParameters: null,
    headers: {},
    requestContext: { authorizer: { claims: { sub: 'user-1', email: 'u@example.com' } } },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as never;
}

const auth = (groups: string[]) => ({ userId: 'user-1', email: 'u@example.com', groups });

function statusOf(p: Promise<unknown>): Promise<number> {
  return p.then(() => 200).catch((e: { statusCode?: number }) => e.statusCode ?? -1);
}

describe('createAccount (POST /accounts) — M11 A4', () => {
  it('creates the account + owner membership and ensures the app-access group', async () => {
    const { deps, rec } = makeDeps();
    // createAccount is the inner unit; its `body` is the raw object the middleware
    // wrapper would later stringify (not a JSON string).
    const res = (await createAccount(event('Household', 'stock-analyser'), auth(['stock-app-access']), deps)) as {
      statusCode: number;
      body: { account: { accountId: string; appSlug: string; name: string; ownerId: string } };
    };

    expect(res.statusCode).toBe(201);
    const accountId = res.body.account.accountId;
    expect(res.body.account).toMatchObject({
      appSlug: 'stock-analyser',
      name: 'Household',
      ownerId: 'user-1',
    });

    // Single TransactWrite with BOTH the account and the OWNER membership.
    expect(rec.ddbCommands).toHaveLength(1);
    expect(rec.ddbCommands[0].name).toBe('TransactWriteCommand');
    const items = rec.ddbCommands[0].input['TransactItems'] as Array<{ Put: { TableName: string; Item: Record<string, unknown> } }>;
    const account = items.find((i) => i.Put.TableName === 'accounts-test')!.Put.Item;
    const member = items.find((i) => i.Put.TableName === 'members-test')!.Put.Item;
    expect(account).toMatchObject({ accountId, appSlug: 'stock-analyser', ownerId: 'user-1', plan: 'free' });
    expect(member).toMatchObject({ accountId, userId: 'user-1', appSlug: 'stock-analyser', role: 'owner' });

    // Ensures the EXACT contract access group string.
    expect(rec.groupAdds).toHaveLength(1);
    expect(rec.groupAdds[0]).toMatchObject({ UserPoolId: 'pool-test', Username: 'user-1', GroupName: 'stock-app-access' });
  });

  it('rejects (403) a caller who does NOT hold the {appSlug}-app-access group', async () => {
    const { deps, rec } = makeDeps();
    expect(await statusOf(createAccount(event('Household', 'stock-analyser'), auth([]), deps))).toBe(403);
    // No writes on a denied create.
    expect(rec.ddbCommands).toHaveLength(0);
    expect(rec.groupAdds).toHaveLength(0);
  });

  it('rejects (403) a site-admin who lacks the access group (no self-grant bypass)', async () => {
    const { deps } = makeDeps();
    expect(await statusOf(createAccount(event('Household', 'stock-analyser'), auth(['site-admin']), deps))).toBe(403);
  });

  it('rejects (403) when the caller holds a DIFFERENT app\'s access group (body app ≠ authorized app)', async () => {
    // The body says stock-analyser; the caller only holds budget access → denied,
    // regardless of the appSlug sent (authorization is the group, not the body).
    const { deps } = makeDeps();
    expect(await statusOf(createAccount(event('Household', 'stock-analyser'), auth(['budget-app-access']), deps))).toBe(403);
  });

  it('rejects (400) an unknown appSlug', async () => {
    const { deps } = makeDeps();
    expect(await statusOf(createAccount(event('Household', 'not-an-app'), auth(['stock-app-access']), deps))).toBe(400);
  });

  it('rejects (400) a missing appSlug', async () => {
    const { deps } = makeDeps();
    expect(await statusOf(createAccount(event('Household', undefined), auth(['stock-app-access']), deps))).toBe(400);
  });

  it('rejects (400) a blank name', async () => {
    const { deps } = makeDeps();
    expect(await statusOf(createAccount(event('   ', 'stock-analyser'), auth(['stock-app-access']), deps))).toBe(400);
  });

  it('ensure-group is best-effort: a Cognito blip does not fail an otherwise-successful create', async () => {
    const { deps, rec } = makeDeps({ cognitoThrows: true });
    const res = (await createAccount(event('Household', 'stock-analyser'), auth(['stock-app-access']), deps)) as { statusCode: number };
    expect(res.statusCode).toBe(201);
    expect(rec.ddbCommands).toHaveLength(1); // account+membership still written
  });
});
