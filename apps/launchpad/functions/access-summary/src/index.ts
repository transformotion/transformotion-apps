import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  requireSiteAdmin,
  ok,
} from '@transformotion/lambda-middleware';
import type { EntitledAppSlug, UserStatus } from '@transformotion/contracts/_shared/auth';
import type {
  UserAccessSummary,
  UserAppAccess,
  UserAccountAccess,
} from '@transformotion/contracts/launchpad/invitations';

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE!;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const APP_ADMIN_GRANTS_TABLE = process.env.APP_ADMIN_GRANTS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

interface UserRow {
  userId: string;
  email: string;
  displayName?: string;
  status?: UserStatus;
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
  name?: string;
}

interface AppAdminGrantRow {
  appSlug: EntitledAppSlug;
  userId: string;
}

const ENTITLED_APP_SLUGS: EntitledAppSlug[] = ['stock-analyser', 'budget-tracker'];

/** Display name fallback: displayName → email local part → email (D6, never denormalized). */
function resolveDisplayName(row: { displayName?: string; email: string }): string | undefined {
  if (row.displayName?.trim()) return row.displayName.trim();
  const localPart = row.email.split('@')[0];
  return localPart || undefined;
}

/**
 * Pure summary-building step — exported for unit tests.
 * Takes all resolved data (no IO) and returns the access summary array.
 * Legacy rows: membership rows missing appSlug must have their slug present in appSlugByAccount,
 * else the row is silently dropped (D9 fail-closed).
 */
export function buildAccessSummaries(
  users: UserRow[],
  membershipsByUser: Map<string, MembershipRow[]>,
  appAdminGrantsByUser: Map<string, AppAdminGrantRow[]>,
  appSlugByAccount: Map<string, string>,
  accountNameByAccount: Map<string, string>,
  siteAdminIds: Set<string>,
): UserAccessSummary[] {
  return users.map(user => {
    const memberships = membershipsByUser.get(user.userId) ?? [];
    const grants = appAdminGrantsByUser.get(user.userId) ?? [];

    const byApp = new Map<string, UserAccountAccess[]>();
    for (const m of memberships) {
      const slug = (m.appSlug ?? appSlugByAccount.get(m.accountId)) as EntitledAppSlug | undefined;
      if (!slug || !ENTITLED_APP_SLUGS.includes(slug)) continue;
      const list = byApp.get(slug) ?? [];
      list.push({
        accountId: m.accountId,
        accountName: accountNameByAccount.get(m.accountId) ?? m.accountId,
        role: m.role as UserAccountAccess['role'],
      });
      byApp.set(slug, list);
    }

    const adminAppSlugs = new Set(grants.map(g => g.appSlug));

    const appAccess: UserAppAccess[] = ENTITLED_APP_SLUGS
      .filter(slug => byApp.has(slug) || adminAppSlugs.has(slug))
      .map(slug => ({
        appSlug: slug,
        appAdmin: adminAppSlugs.has(slug),
        accounts: byApp.get(slug) ?? [],
      }));

    return {
      userId: user.userId,
      email: user.email,
      displayName: resolveDisplayName(user),
      status: (user.status ?? 'active') as UserStatus,
      siteAdmin: siteAdminIds.has(user.userId),
      appAccess,
      pendingInvites: 0,
    };
  });
}

/** Fetch all userIds in the Cognito site-admin group (handles pagination). */
async function fetchSiteAdminUserIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let nextToken: string | undefined;
  do {
    const res = await cognito.send(new ListUsersInGroupCommand({
      UserPoolId: USER_POOL_ID,
      GroupName: 'site-admin',
      NextToken: nextToken,
    }));
    for (const u of res.Users ?? []) {
      if (u.Username) ids.add(u.Username);
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return ids;
}

export const handler = withAuthOnly(async ({ auth }) => {
  requireSiteAdmin(auth);

  // 1. Scan all users (D4 — scan is the documented approach at this scale)
  const [usersRes, siteAdminIds] = await Promise.all([
    ddb.send(new ScanCommand({
      TableName: USERS_TABLE,
      ProjectionExpression: 'userId, email, displayName, #s',
      ExpressionAttributeNames: { '#s': 'status' },
    })),
    fetchSiteAdminUserIds(),
  ]);
  const users = (usersRes.Items ?? []) as UserRow[];

  if (users.length === 0) return ok({ users: [] });

  // 2. Query memberships for each user (userId-index) in parallel batches
  const membershipsByUser = new Map<string, MembershipRow[]>();
  const appAdminGrantsByUser = new Map<string, AppAdminGrantRow[]>();

  await Promise.all([
    ...users.map(async user => {
      const res = await ddb.send(new QueryCommand({
        TableName: ACCOUNT_MEMBERS_TABLE,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': user.userId },
        ProjectionExpression: 'accountId, userId, appSlug, #r',
        ExpressionAttributeNames: { '#r': 'role' },
      }));
      membershipsByUser.set(user.userId, (res.Items ?? []) as MembershipRow[]);
    }),
    ...users.map(async user => {
      const res = await ddb.send(new QueryCommand({
        TableName: APP_ADMIN_GRANTS_TABLE,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': user.userId },
        ProjectionExpression: 'appSlug, userId',
      }));
      appAdminGrantsByUser.set(user.userId, (res.Items ?? []) as AppAdminGrantRow[]);
    }),
  ]);

  // 3. Resolve appSlug for legacy membership rows missing it (D3 backfill tolerance)
  const allMembershipRows = [...membershipsByUser.values()].flat();
  const missingAppSlugIds = [...new Set(
    allMembershipRows.filter(m => !m.appSlug).map(m => m.accountId),
  )];

  const appSlugByAccount = new Map<string, string>();
  const accountNameByAccount = new Map<string, string>();

  if (missingAppSlugIds.length > 0) {
    // BatchGetItem 25-item limit — chunk if necessary
    for (let i = 0; i < missingAppSlugIds.length; i += 25) {
      const chunk = missingAppSlugIds.slice(i, i + 25).map(id => ({ accountId: id }));
      const res = await ddb.send(new BatchGetCommand({
        RequestItems: { [ACCOUNTS_TABLE]: { Keys: chunk, ProjectionExpression: 'accountId, appSlug, #n', ExpressionAttributeNames: { '#n': 'name' } } },
      }));
      for (const row of (res.Responses?.[ACCOUNTS_TABLE] ?? []) as AccountRow[]) {
        if (row.appSlug) appSlugByAccount.set(row.accountId, row.appSlug);
        if (row.name) accountNameByAccount.set(row.accountId, row.name);
      }
    }
  }

  // 4. Fetch account names for rows that have appSlug already set (for display in summary)
  const accountIdsWithAppSlug = [...new Set(
    allMembershipRows.filter(m => m.appSlug).map(m => m.accountId),
  )].filter(id => !accountNameByAccount.has(id));

  for (let i = 0; i < accountIdsWithAppSlug.length; i += 25) {
    const chunk = accountIdsWithAppSlug.slice(i, i + 25).map(id => ({ accountId: id }));
    const res = await ddb.send(new BatchGetCommand({
      RequestItems: { [ACCOUNTS_TABLE]: { Keys: chunk, ProjectionExpression: 'accountId, #n', ExpressionAttributeNames: { '#n': 'name' } } },
    }));
    for (const row of (res.Responses?.[ACCOUNTS_TABLE] ?? []) as AccountRow[]) {
      if (row.name) accountNameByAccount.set(row.accountId, row.name);
    }
  }

  // 5. Build access summaries
  const summaries = buildAccessSummaries(
    users,
    membershipsByUser,
    appAdminGrantsByUser,
    appSlugByAccount,
    accountNameByAccount,
    siteAdminIds,
  );

  return ok({ users: summaries });
});
