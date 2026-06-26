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
import type { AccountRole, EntitledAppSlug, UserStatus } from '@transformotion/contracts/_shared/auth';
import type {
  UserAccessSummary,
  UserAppAccess,
  UserAccountAccess,
  UserPendingInvitation,
  InvitationGrantKind,
} from '@transformotion/contracts/launchpad/invitations';
import type { InvitationStatus } from '@transformotion/contracts/launchpad/types';

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE!;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const APP_ADMIN_GRANTS_TABLE = process.env.APP_ADMIN_GRANTS_TABLE!;
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

interface StoredGrant {
  grantId?: string;
  kind?: string;
  appSlug?: string;
  accountId?: string;
  role?: string;
}

interface StoredBundle {
  bundleId?: string;
  invitationId?: string;
  email?: string;
  status?: string;
  createdAt?: string;
  expiresAt?: number;
  grants?: StoredGrant[];
}

const APP_LABELS: Record<string, string> = {
  'stock-analyser': 'Stock Analyser',
  'budget-tracker': 'Budget Tracker',
};
function appLabel(slug: string): string {
  return APP_LABELS[slug] ?? slug;
}

/**
 * Pure: build the per-user pending-invitation LIST (one row per grant) keyed by
 * lowercased email — `UserAccessSummary.pendingInvitations` (M11). Mirrors v0's
 * `listPendingInvitationsForEmail`: pending bundles, per grant; target = account
 * name (account-invite) or app label (app-grant); `role` only for account-invite.
 * The count badge `pendingInvites` is then just the list length (the contract
 * invariant `pendingInvites === pendingInvitations.length`). Only EXISTING users
 * surface anything — invitees who are not yet users are absent from the directory.
 * Exported for unit tests.
 */
export function buildPendingByEmail(
  bundles: StoredBundle[],
  accountNameByAccount: Map<string, string>,
): Map<string, UserPendingInvitation[]> {
  const out = new Map<string, UserPendingInvitation[]>();
  for (const b of bundles) {
    if (b.status !== 'pending' || !b.email) continue;
    const key = b.email.trim().toLowerCase();
    const list = out.get(key) ?? [];
    for (const g of b.grants ?? []) {
      if (!g.grantId || !g.kind || !g.appSlug) continue;
      const target =
        g.kind === 'account-invite'
          ? (g.accountId ? accountNameByAccount.get(g.accountId) ?? g.accountId : '')
          : appLabel(g.appSlug);
      list.push({
        bundleId: (b.bundleId ?? b.invitationId ?? '') as string,
        grantId: g.grantId,
        kind: g.kind as InvitationGrantKind,
        appSlug: g.appSlug as EntitledAppSlug,
        target,
        ...(g.kind === 'account-invite' && g.role ? { role: g.role as AccountRole } : {}),
        status: b.status as InvitationStatus,
        createdAt: (b.createdAt ?? '') as UserPendingInvitation['createdAt'],
        expiresAt: (b.expiresAt ?? 0) as UserPendingInvitation['expiresAt'],
      });
    }
    out.set(key, list);
  }
  return out;
}

/** Account-invite target accountIds across all pending bundles (for name resolution). */
export function pendingTargetAccountIds(bundles: StoredBundle[]): string[] {
  const ids = new Set<string>();
  for (const b of bundles) {
    if (b.status !== 'pending') continue;
    for (const g of b.grants ?? []) {
      if (g.kind === 'account-invite' && g.accountId) ids.add(g.accountId);
    }
  }
  return [...ids];
}

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
  pendingByEmail: Map<string, UserPendingInvitation[]>,
): UserAccessSummary[] {
  return users.map(user => {
    const memberships = membershipsByUser.get(user.userId) ?? [];
    const grants = appAdminGrantsByUser.get(user.userId) ?? [];
    const pending = pendingByEmail.get(user.email.trim().toLowerCase()) ?? [];

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
      // Contract invariant: pendingInvites === pendingInvitations.length.
      pendingInvitations: pending,
      pendingInvites: pending.length,
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

  // 1. Scan all users + the invitation store (D4 — scan is the documented
  //    approach at this scale; per-user pending-invitation list + count, M11).
  const [usersRes, siteAdminIds, invitesRes] = await Promise.all([
    ddb.send(new ScanCommand({
      TableName: USERS_TABLE,
      ProjectionExpression: 'userId, email, displayName, #s',
      ExpressionAttributeNames: { '#s': 'status' },
    })),
    fetchSiteAdminUserIds(),
    ddb.send(new ScanCommand({
      TableName: INVITATIONS_TABLE,
      ProjectionExpression: 'bundleId, invitationId, email, #st, createdAt, expiresAt, grants',
      ExpressionAttributeNames: { '#st': 'status' },
    })),
  ]);
  const users = (usersRes.Items ?? []) as UserRow[];
  const pendingBundles = (invitesRes.Items ?? []) as StoredBundle[];

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

  // 4. Fetch account names for display — membership accounts (with appSlug) AND
  //    pending-invitation TARGET accounts (M11; the invitee is not a member of
  //    these, so they would otherwise be unresolved → name falls back to id).
  const accountIdsNeedingName = [...new Set([
    ...allMembershipRows.filter(m => m.appSlug).map(m => m.accountId),
    ...pendingTargetAccountIds(pendingBundles),
  ])].filter(id => !accountNameByAccount.has(id));

  for (let i = 0; i < accountIdsNeedingName.length; i += 25) {
    const chunk = accountIdsNeedingName.slice(i, i + 25).map(id => ({ accountId: id }));
    const res = await ddb.send(new BatchGetCommand({
      RequestItems: { [ACCOUNTS_TABLE]: { Keys: chunk, ProjectionExpression: 'accountId, #n', ExpressionAttributeNames: { '#n': 'name' } } },
    }));
    for (const row of (res.Responses?.[ACCOUNTS_TABLE] ?? []) as AccountRow[]) {
      if (row.name) accountNameByAccount.set(row.accountId, row.name);
    }
  }

  // 5. Build access summaries (pending list keyed by email; count = list length)
  const pendingByEmail = buildPendingByEmail(pendingBundles, accountNameByAccount);
  const summaries = buildAccessSummaries(
    users,
    membershipsByUser,
    appAdminGrantsByUser,
    appSlugByAccount,
    accountNameByAccount,
    siteAdminIds,
    pendingByEmail,
  );

  return ok({ users: summaries });
});
