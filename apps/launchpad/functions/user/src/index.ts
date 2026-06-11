import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  parseBody,
  getPathParam,
  ok,
  badRequest,
  forbidden,
  notFound,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import type { UserPreferences, UserStatus } from '@transformotion/contracts/_shared/auth';

const DEFAULT_PREFERENCES: UserPreferences = {
  notificationsEnabled: false,
};

interface UserItem {
  userId: string;
  email: string;
  displayName?: string;
  emailLower?: string;
  status?: UserStatus;
  preferences?: Partial<UserPreferences>;
  profileComplete?: boolean;
  activeAccounts?: Record<string, string>;
  updatedAt?: string;
}

interface MembershipRow {
  accountId: string;
  userId: string;
  appSlug?: string;
  role: string;
}

interface AccountRow {
  accountId: string;
  appSlug?: string;
  createdAt?: string;
}

/** Compute display name per fallback chain: displayName → email local part → email. */
export function resolveDisplayName(item: { displayName?: string; email: string }): string {
  if (item.displayName?.trim()) return item.displayName.trim();
  const localPart = item.email.split('@')[0];
  return localPart || item.email;
}

/**
 * Pure deterministic-default logic for active account selection.
 * Single account → that one; multiple → stored valid selection, else earliest by createdAt+id;
 * none → omit. Never guesses; never crashes on missing createdAt.
 */
export function resolveActiveSelections(
  storedSelections: Record<string, string>,
  accountIdsByApp: Map<string, string[]>,
  createdAtByAccount: Map<string, string>,
): Array<{ appSlug: string; accountId: string }> {
  const selections: Array<{ appSlug: string; accountId: string }> = [];

  for (const [appSlug, validIds] of accountIdsByApp.entries()) {
    const stored = storedSelections[appSlug];
    if (stored && validIds.includes(stored)) {
      selections.push({ appSlug, accountId: stored });
    } else if (validIds.length === 1) {
      selections.push({ appSlug, accountId: validIds[0]! });
    } else if (validIds.length > 1) {
      const sorted = [...validIds].sort((a, b) => {
        const ca = createdAtByAccount.get(a) ?? '';
        const cb = createdAtByAccount.get(b) ?? '';
        return ca !== cb ? ca.localeCompare(cb) : a.localeCompare(b);
      });
      selections.push({ appSlug, accountId: sorted[0]! });
    }
  }

  return selections;
}

interface HandlerDeps {
  ddb: DynamoDBDocumentClient;
  usersTable: string;
  accountsTable: string;
  accountMembersTable: string;
}

export function createHandler(deps: HandlerDeps) {
  const { ddb, usersTable, accountsTable, accountMembersTable } = deps;

  async function loadUserItem(userId: string): Promise<UserItem | undefined> {
    const res = await ddb.send(new GetCommand({ TableName: usersTable, Key: { userId } }));
    return res.Item as UserItem | undefined;
  }

  async function getProfile(userId: string, email: string) {
    const item = await loadUserItem(userId);
    const preferences: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      ...(item?.preferences ?? {}),
    };
    const displayName = resolveDisplayName({ displayName: item?.displayName, email });
    const status: UserStatus = (item?.status as UserStatus | undefined) ?? 'active';

    return ok({
      userId,
      email,
      displayName,
      status,
      preferences,
      profileComplete: item?.profileComplete ?? false,
      updatedAt: item?.updatedAt,
    });
  }

  async function putPreferences(event: APIGatewayProxyEvent, userId: string, email: string) {
    const body = parseBody<{
      notificationsEnabled?: boolean;
      displayName?: string;
      profileComplete?: boolean;
    }>(event);

    const existing = await loadUserItem(userId);
    const existingPrefs: UserPreferences = { ...DEFAULT_PREFERENCES, ...(existing?.preferences ?? {}) };

    const mergedPrefs: UserPreferences = {
      ...existingPrefs,
      ...(body.notificationsEnabled !== undefined ? { notificationsEnabled: body.notificationsEnabled } : {}),
    };

    const setExpressions: string[] = ['preferences = :p, updatedAt = :now'];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = { ':p': mergedPrefs, ':now': new Date().toISOString() };

    if (body.displayName !== undefined) {
      setExpressions.push('#dn = :dn');
      names['#dn'] = 'displayName';
      values[':dn'] = body.displayName.trim();
    }
    if (body.profileComplete !== undefined) {
      setExpressions.push('profileComplete = :pc');
      values[':pc'] = body.profileComplete;
    }

    await ddb.send(new UpdateCommand({
      TableName: usersTable,
      Key: { userId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
    }));

    const displayName = resolveDisplayName({
      displayName: body.displayName ?? existing?.displayName,
      email,
    });

    return ok({
      userId,
      email,
      displayName,
      status: (existing?.status as UserStatus | undefined) ?? 'active',
      preferences: mergedPrefs,
      profileComplete: body.profileComplete ?? existing?.profileComplete ?? false,
      updatedAt: values[':now'],
    });
  }

  async function getActiveAccountsForUser(userId: string) {
    const [userItem, membershipsRes] = await Promise.all([
      loadUserItem(userId),
      ddb.send(new QueryCommand({
        TableName: accountMembersTable,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ProjectionExpression: 'accountId, appSlug, #r',
        ExpressionAttributeNames: { '#r': 'role' },
      })),
    ]);

    const memberships = (membershipsRes.Items ?? []) as MembershipRow[];
    const storedSelections = userItem?.activeAccounts ?? {};

    const missingAppSlugAccountIds = memberships
      .filter(m => !m.appSlug)
      .map(m => m.accountId);

    const appSlugByAccount = new Map<string, string>();
    if (missingAppSlugAccountIds.length > 0) {
      const keys = [...new Set(missingAppSlugAccountIds)].map(accountId => ({ accountId }));
      const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: { [accountsTable]: { Keys: keys, ProjectionExpression: 'accountId, appSlug' } },
      }));
      const rows = (batchRes.Responses?.[accountsTable] ?? []) as AccountRow[];
      for (const row of rows) {
        if (row.appSlug) appSlugByAccount.set(row.accountId, row.appSlug);
      }
    }

    const accountIdsByApp = new Map<string, string[]>();
    for (const m of memberships) {
      const appSlug = m.appSlug ?? appSlugByAccount.get(m.accountId);
      if (!appSlug) continue;
      const existing = accountIdsByApp.get(appSlug) ?? [];
      existing.push(m.accountId);
      accountIdsByApp.set(appSlug, existing);
    }

    const multiAccountAppIds = new Set<string>();
    for (const ids of accountIdsByApp.values()) {
      if (ids.length > 1) ids.forEach(id => multiAccountAppIds.add(id));
    }

    const createdAtByAccount = new Map<string, string>();
    if (multiAccountAppIds.size > 0) {
      const keys = [...multiAccountAppIds].map(accountId => ({ accountId }));
      const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: { [accountsTable]: { Keys: keys, ProjectionExpression: 'accountId, createdAt' } },
      }));
      const rows = (batchRes.Responses?.[accountsTable] ?? []) as AccountRow[];
      for (const row of rows) {
        if (row.createdAt) createdAtByAccount.set(row.accountId, row.createdAt);
      }
    }

    const selections = resolveActiveSelections(storedSelections, accountIdsByApp, createdAtByAccount);
    return ok({ selections });
  }

  async function setActiveAccount(event: APIGatewayProxyEvent, userId: string) {
    const appSlug = getPathParam(event, 'appSlug');
    const { accountId } = parseBody<{ accountId: string }>(event);
    if (!accountId?.trim()) throw badRequest('accountId is required');

    // Verify membership — fail closed with uniform not-found semantics (D9)
    const memberRes = await ddb.send(new GetCommand({
      TableName: accountMembersTable,
      Key: { accountId, userId },
    }));

    if (!memberRes.Item) {
      throw notFound('Account not found');
    }

    // Verify account belongs to the stated appSlug (fail closed on mismatch)
    const memberAppSlug = memberRes.Item['appSlug'] as string | undefined;
    if (memberAppSlug && memberAppSlug !== appSlug) {
      throw forbidden('Account does not belong to the stated app');
    }
    if (!memberAppSlug) {
      const accountRes = await ddb.send(new GetCommand({
        TableName: accountsTable,
        Key: { accountId },
      }));
      const resolvedSlug = accountRes.Item?.['appSlug'] as string | undefined;
      if (!resolvedSlug || resolvedSlug !== appSlug) {
        throw forbidden('Account does not belong to the stated app');
      }
    }

    const now = new Date().toISOString();
    await ddb.send(new UpdateCommand({
      TableName: usersTable,
      Key: { userId },
      UpdateExpression: 'SET activeAccounts.#app = :accountId, updatedAt = :now',
      ExpressionAttributeNames: { '#app': appSlug },
      ExpressionAttributeValues: { ':accountId': accountId, ':now': now },
    }));

    return getActiveAccountsForUser(userId);
  }

  return withAuthOnly(async ({ auth, event }) => {
    const { userId, email } = auth;
    const resource = (event as APIGatewayProxyEvent).resource ?? '';
    const method = event.httpMethod;

    if (resource === '/api/user/profile' && method === 'GET') {
      return getProfile(userId, email);
    }
    if (resource === '/api/user/preferences' && method === 'PUT') {
      return putPreferences(event as APIGatewayProxyEvent, userId, email);
    }
    if (resource === '/api/user/active-accounts' && method === 'GET') {
      return getActiveAccountsForUser(userId);
    }
    if (resource === '/api/user/active-accounts/{appSlug}' && method === 'PUT') {
      return setActiveAccount(event as APIGatewayProxyEvent, userId);
    }

    throw badRequest(`Unrecognised route: ${method} ${resource}`);
  });
}

export const handler = createHandler({
  ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  usersTable: process.env.USERS_TABLE!,
  accountsTable: process.env.ACCOUNTS_TABLE!,
  accountMembersTable: process.env.ACCOUNT_MEMBERS_TABLE!,
});
