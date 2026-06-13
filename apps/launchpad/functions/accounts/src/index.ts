import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  parseBody,
  getPathParam,
  ok,
  created,
  noContent,
  badRequest,
  forbidden,
  notFound,
  requireAccountAdmin,
  requireAccountMember,
  requireAccountOwnerOrManager,
  requireAccountOwnerRole,
  UNIFORM_DENY,
  type APIGatewayProxyEvent,
  type MembershipLoader,
} from '@transformotion/lambda-middleware';
import type { AccountMemberRow, ListAccountMembersResponse } from '@transformotion/contracts/launchpad/invitations';
import type { AccountRole, UserStatus } from '@transformotion/contracts/_shared/auth';
import { randomUUID } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;

// M16 D3 / Refs #162: appSlug is derived from the Cognito app-client used to obtain the token.
const APP_CLIENT_TO_SLUG: Record<string, string> = Object.fromEntries(
  (process.env.APP_SLUGS ?? '').split(',').filter(Boolean).map(slug => [
    process.env[`APP_CLIENT_${slug.toUpperCase().replace(/-/g, '_')}`]!,
    slug,
  ]),
);

/** Raw account-members row shape as stored. */
interface MemberRecord {
  userId: string;
  email?: string;
  role: string;
  joinedAt: string;
  status?: string;
}

/**
 * Per-request shared wiring (M16 Phase 6): load the account row and ALL member
 * rows ONCE, and build an in-memory single-row MembershipLoader closing over the
 * array — so the policy guards (requireAccountMember / requireAccountOwnerOrManager)
 * resolve the caller's authority with no second GetItem. Used by R1/R2/R3.
 */
async function loadAccountContext(accountId: string): Promise<{
  account: Record<string, unknown> | undefined;
  members: MemberRecord[];
  callerLoader: MembershipLoader;
}> {
  const [accountRes, membersRes] = await Promise.all([
    ddb.send(new GetCommand({ TableName: ACCOUNTS_TABLE, Key: { accountId } })),
    ddb.send(new QueryCommand({
      TableName: ACCOUNT_MEMBERS_TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
    })),
  ]);
  const members = (membersRes.Items ?? []) as MemberRecord[];
  const callerLoader: MembershipLoader = async (_accountId, userId) => {
    const m = members.find((row) => row.userId === userId);
    return m ? { role: m.role as AccountRole, status: m.status } : undefined;
  };
  return { account: accountRes.Item, members, callerLoader };
}

// R3 field-guard (ruling #2): managers + owners may set general account settings
// (today only `name`); ownership/billing fields are owner-only and exposed by no UI.
const MANAGER_WRITABLE_FIELDS = new Set(['name']);
const OWNER_ONLY_FIELDS = new Set(['ownerId']);

async function createAccount(event: APIGatewayProxyEvent, userId: string, email: string) {
  const { name } = parseBody<{ name: string }>(event);
  if (!name?.trim()) throw badRequest('name is required');

  // M16 D3 / Refs #162: resolve appSlug from the Cognito app-client (aud claim).
  const claims = event.requestContext?.authorizer?.claims as Record<string, string> | undefined;
  const aud = claims?.aud;
  const appSlug = aud ? (APP_CLIENT_TO_SLUG[aud] ?? null) : null;

  const accountId = randomUUID();
  const now = new Date().toISOString();

  const accountItem: Record<string, unknown> = {
    accountId,
    name: name.trim(),
    ownerId: userId,
    plan: 'free',
    createdAt: now,
    updatedAt: now,
  };
  if (appSlug) accountItem['appSlug'] = appSlug;

  const memberItem: Record<string, unknown> = {
    accountId,
    userId,
    email,
    role: 'owner',
    joinedAt: now,
  };
  if (appSlug) memberItem['appSlug'] = appSlug;

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: ACCOUNTS_TABLE,
          Item: accountItem,
          ConditionExpression: 'attribute_not_exists(accountId)',
        },
      },
      {
        Put: {
          TableName: ACCOUNT_MEMBERS_TABLE,
          Item: memberItem,
        },
      },
    ],
  }));

  return created({
    account: { accountId, appSlug: appSlug ?? undefined, name: name.trim(), ownerId: userId, createdAt: now },
  });
}

// R1 — GET /accounts/{accountId}: any ACTIVE member (ruling #3). Uniform-deny on
// non-member AND on a missing account, so account existence is not probeable.
async function getAccount(accountId: string, userId: string) {
  const { account, members, callerLoader } = await loadAccountContext(accountId);
  await requireAccountAdmin(() => requireAccountMember(callerLoader, accountId, userId));
  if (!account) throw forbidden(UNIFORM_DENY); // same uniform deny — no 404 leak

  return ok({
    account: {
      accountId: account['accountId'] as string,
      name: account['name'] as string,
      ownerId: account['ownerId'] as string,
      createdAt: account['createdAt'] as string,
    },
    members: members.map(m => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  });
}

// R2 — GET /accounts/{accountId}/members/detail: any active member. Returns the
// full ListAccountMembersResponse (contract) so the v0 account-management-view
// wires with no adapter. isLastOwner is computed from the loaded members array;
// pendingInvitations is shape-present but EMPTY until Phase 8 (bundles).
// (displayName is omitted — optional; read-time enrichment from launchpad-users
//  per D6 is deferred. The v0 view falls back to email.)
async function getMembersDetail(accountId: string, userId: string) {
  const { account, members, callerLoader } = await loadAccountContext(accountId);
  await requireAccountAdmin(() => requireAccountMember(callerLoader, accountId, userId));
  if (!account) throw forbidden(UNIFORM_DENY);

  const ownerCount = members.filter(m => m.role === 'owner').length;
  const memberRows: AccountMemberRow[] = members.map(m => ({
    userId: m.userId,
    email: m.email ?? '',
    status: (m.status as UserStatus | undefined) ?? 'active',
    role: m.role as AccountRole,
    joinedAt: m.joinedAt,
    isLastOwner: m.role === 'owner' && ownerCount === 1,
  }));

  const response: ListAccountMembersResponse = {
    accountId,
    members: memberRows,
    pendingInvitations: [], // EMPTY until Phase 8 (bundles) — shape present, no data
  };
  return ok(response);
}

// R3 — PUT /accounts/{accountId}: owner-or-manager (ruling #2) + field-guard.
async function updateAccount(event: APIGatewayProxyEvent, accountId: string, userId: string) {
  const { account, callerLoader } = await loadAccountContext(accountId);
  await requireAccountAdmin(() => requireAccountOwnerOrManager(callerLoader, accountId, userId));
  if (!account) throw forbidden(UNIFORM_DENY);

  const body = parseBody<Record<string, unknown>>(event);

  // Field-guard whitelist: reject unknown fields; re-narrow owner-only fields to owner.
  for (const key of Object.keys(body)) {
    if (!MANAGER_WRITABLE_FIELDS.has(key) && !OWNER_ONLY_FIELDS.has(key)) {
      throw badRequest(`Unsupported field: ${key}`);
    }
    if (OWNER_ONLY_FIELDS.has(key)) {
      await requireAccountAdmin(() => requireAccountOwnerRole(callerLoader, accountId, userId));
    }
  }

  const name = body['name'] as string | undefined;
  if (!name?.trim()) throw badRequest('name is required');

  const now = new Date().toISOString();
  await ddb.send(new UpdateCommand({
    TableName: ACCOUNTS_TABLE,
    Key: { accountId },
    UpdateExpression: 'SET #n = :name, updatedAt = :now',
    ExpressionAttributeNames: { '#n': 'name' },
    ExpressionAttributeValues: { ':name': name.trim(), ':now': now },
    ConditionExpression: 'attribute_exists(accountId)',
  }));

  return ok({ account: { accountId, name: name.trim(), updatedAt: now } });
}

async function deleteAccount(accountId: string, userId: string) {
  await requireOwner(accountId, userId);

  const membersRes = await ddb.send(new QueryCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
    ProjectionExpression: 'userId',
  }));

  const memberDeletes = (membersRes.Items ?? []).map(m => ({
    Delete: {
      TableName: ACCOUNT_MEMBERS_TABLE,
      Key: { accountId, userId: m['userId'] as string },
    },
  }));

  if (memberDeletes.length > 99) {
    throw badRequest('Cannot delete an account with more than 99 members via this endpoint');
  }

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Delete: {
          TableName: ACCOUNTS_TABLE,
          Key: { accountId },
          ConditionExpression: 'attribute_exists(accountId)',
        },
      },
      ...memberDeletes,
    ],
  }));

  return noContent();
}

async function listMembers(accountId: string, userId: string) {
  const membersRes = await ddb.send(new QueryCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));

  const members = (membersRes.Items ?? []) as Array<{
    userId: string; email?: string; role: string; joinedAt: string;
  }>;

  if (!members.some(m => m.userId === userId)) {
    throw forbidden('You are not a member of this account');
  }

  return ok({
    members: members.map(m => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  });
}

async function removeMember(accountId: string, requesterId: string, targetUserId: string) {
  await requireOwner(accountId, requesterId);

  if (targetUserId === requesterId) {
    throw badRequest('Owner cannot remove themselves - delete the account instead');
  }

  await ddb.send(new DeleteCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    Key: { accountId, userId: targetUserId },
  }));

  return noContent();
}

async function requireOwner(accountId: string, userId: string) {
  const res = await ddb.send(new GetCommand({
    TableName: ACCOUNTS_TABLE,
    Key: { accountId },
  }));
  if (!res.Item) throw notFound(`Account '${accountId}' not found`);
  if (res.Item['ownerId'] !== userId) throw forbidden('Only the account owner can perform this action');
}

// withAuthOnly (M16 Phase 6, ruling #4): this control-plane handler keys off the
// PATH accountId and auth.userId — it never reads the X-Account-Id header, so it
// must NOT require one (withAuth/resolveAccountContext would 400 POST /accounts).
export const handler = withAuthOnly(async ({ auth, event }) => {
  const { userId, email } = auth;
  const resource = event.resource ?? '';

  // R7: createAccount — no account context.
  if (resource === '/accounts' && event.httpMethod === 'POST') {
    return createAccount(event, userId, email);
  }

  const accountId = getPathParam(event, 'accountId');

  // R2 (NEW): full member detail (ListAccountMembersResponse).
  if (resource === '/accounts/{accountId}/members/detail' && event.httpMethod === 'GET') {
    return getMembersDetail(accountId, userId);
  }

  // Legacy GET /members (thin shape) — retained, unwired-to-UI (see §7 retirement map).
  if (resource === '/accounts/{accountId}/members' && event.httpMethod === 'GET') {
    return listMembers(accountId, userId);
  }

  // 6B: member removal (gate unchanged in 6A).
  if (resource === '/accounts/{accountId}/members/{userId}' && event.httpMethod === 'DELETE') {
    const targetUserId = getPathParam(event, 'userId');
    return removeMember(accountId, userId, targetUserId);
  }

  if (event.httpMethod === 'GET') return getAccount(accountId, userId);            // R1
  if (event.httpMethod === 'PUT') return updateAccount(event, accountId, userId);  // R3
  if (event.httpMethod === 'DELETE') return deleteAccount(accountId, userId);      // 6B (unchanged)

  throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
});
