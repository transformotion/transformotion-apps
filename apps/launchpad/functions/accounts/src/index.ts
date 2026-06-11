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
  withAuth,
  parseBody,
  getPathParam,
  ok,
  created,
  noContent,
  badRequest,
  forbidden,
  notFound,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
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

async function getAccount(accountId: string, userId: string) {
  const [accountRes, membersRes] = await Promise.all([
    ddb.send(new GetCommand({ TableName: ACCOUNTS_TABLE, Key: { accountId } })),
    ddb.send(new QueryCommand({
      TableName: ACCOUNT_MEMBERS_TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
    })),
  ]);

  if (!accountRes.Item) throw notFound(`Account '${accountId}' not found`);

  const members = (membersRes.Items ?? []) as Array<{
    userId: string; email?: string; role: string; joinedAt: string;
  }>;

  if (!members.some(m => m.userId === userId)) {
    throw forbidden('You are not a member of this account');
  }

  return ok({
    account: {
      accountId: accountRes.Item['accountId'] as string,
      name: accountRes.Item['name'] as string,
      ownerId: accountRes.Item['ownerId'] as string,
      createdAt: accountRes.Item['createdAt'] as string,
    },
    members: members.map(m => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  });
}

async function updateAccount(event: APIGatewayProxyEvent, accountId: string, userId: string) {
  await requireOwner(accountId, userId);

  const { name } = parseBody<{ name?: string }>(event);
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

export const handler = withAuth(async ({ auth, event }) => {
  const { userId, email } = auth;
  const resource = event.resource ?? '';

  if (resource === '/accounts' && event.httpMethod === 'POST') {
    return createAccount(event, userId, email);
  }

  const accountId = getPathParam(event, 'accountId');

  if (resource === '/accounts/{accountId}/members' && event.httpMethod === 'GET') {
    return listMembers(accountId, userId);
  }

  if (resource === '/accounts/{accountId}/members/{userId}' && event.httpMethod === 'DELETE') {
    const targetUserId = getPathParam(event, 'userId');
    return removeMember(accountId, userId, targetUserId);
  }

  if (event.httpMethod === 'GET') return getAccount(accountId, userId);
  if (event.httpMethod === 'PUT') return updateAccount(event, accountId, userId);
  if (event.httpMethod === 'DELETE') return deleteAccount(accountId, userId);

  throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
});
