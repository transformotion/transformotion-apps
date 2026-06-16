import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  parseBody,
  ok,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import {
  deriveAppAdmin,
  type CognitoGroup,
  type EntitledAppSlug,
  type UserStatus,
} from '@transformotion/contracts/_shared/auth';
import type {
  DiscoveredInvitee,
  InviteeSearchResponse,
  InviteeSearchScope,
  InviteeSearchScopeKind,
} from '@transformotion/contracts/launchpad/invitations';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE!;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE!;

const APP_LABELS: Record<string, string> = {
  'stock-analyser': 'Stock Analyser',
  'budget-tracker': 'Budget Tracker',
};
const appLabel = (slug: string): string => APP_LABELS[slug] ?? slug;

interface UserRow { userId: string; email: string; displayName?: string; status?: UserStatus }
interface MemberRow { accountId: string; userId: string; appSlug?: string; role: string }
interface AccountRow { accountId: string; appSlug?: string; name?: string }
interface BundleRow { invitedBy?: string; email?: string; status?: string; grants?: Array<{ kind?: string; appSlug?: string; accountId?: string }> }

/**
 * Launchpad — Invitee Discovery (M11 Composer)
 * ============================================
 * POST /api/invitations/invitee-search — the contracted invitee-search endpoint
 * (contracts/launchpad/invitations: InviteeSearchRequest → InviteeSearchResponse).
 * Runtime implementation of v0's `getInviteeSearchScope` + `getSearchableInvitees`.
 *
 * THREE separate checks (never conflated) — this endpoint serves CHECK 1 only,
 * invitee DISCOVERY: who may the sender see/search/select. Grant AUTHORIZATION
 * and invitee-state validity are evaluated independently (client capability +
 * the create endpoint's per-grant decisions).
 *
 * Scope (strongest wins for presentation; result set is the union the sender is
 * entitled to):
 *   - site-admin       → the full user directory ("Site-admin directory")
 *   - app-admin        → users with access to an administered app
 *   - account-manager  → members of accounts the sender owns/manages
 *   - none             → members/viewers cannot search
 *
 * Privacy: a result + its reasons only ever surface facts the sender could
 * already see on a surface they can open.
 */

function matchesQuery(u: UserRow, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    u.email.toLowerCase().includes(needle) ||
    (u.displayName?.toLowerCase().includes(needle) ?? false)
  );
}

export const handler = withAuthOnly(async ({ auth, event }) => {
  const { query } = parseBody<{ query?: string }>(event as APIGatewayProxyEvent);
  const q = query ?? '';

  const siteAdmin = auth.groups.includes('site-admin');
  const adminApps = new Set<EntitledAppSlug>(deriveAppAdmin(auth.groups as readonly CognitoGroup[]));

  // Sender's owned/managed accounts (account-manager scope).
  const myMembersRes = await ddb.send(new QueryCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': auth.userId },
    ProjectionExpression: 'accountId, userId, appSlug, #r',
    ExpressionAttributeNames: { '#r': 'role' },
  }));
  const managedAccountIds = new Set(
    ((myMembersRes.Items ?? []) as MemberRow[])
      .filter((m) => m.role === 'owner' || m.role === 'manager')
      .map((m) => m.accountId),
  );

  const kind: InviteeSearchScopeKind = siteAdmin
    ? 'site-admin'
    : adminApps.size > 0
      ? 'app-admin'
      : managedAccountIds.size > 0
        ? 'account-manager'
        : 'none';

  const scope: InviteeSearchScope = {
    kind,
    appSlugs: [...adminApps],
    accountIds: [...managedAccountIds],
  };

  if (kind === 'none') {
    return ok({ scope, results: [] } satisfies InviteeSearchResponse);
  }

  // Shared reads (documented scan approach at this scale — D4).
  const [usersRes, membersRes, accountsRes] = await Promise.all([
    ddb.send(new ScanCommand({
      TableName: USERS_TABLE,
      ProjectionExpression: 'userId, email, displayName, #s',
      ExpressionAttributeNames: { '#s': 'status' },
    })),
    ddb.send(new ScanCommand({
      TableName: ACCOUNT_MEMBERS_TABLE,
      ProjectionExpression: 'accountId, userId, appSlug, #r',
      ExpressionAttributeNames: { '#r': 'role' },
    })),
    ddb.send(new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      ProjectionExpression: 'accountId, appSlug, #n',
      ExpressionAttributeNames: { '#n': 'name' },
    })),
  ]);

  const users = (usersRes.Items ?? []) as UserRow[];
  const members = (membersRes.Items ?? []) as MemberRow[];
  const accounts = (accountsRes.Items ?? []) as AccountRow[];

  const userById = new Map(users.map((u) => [u.userId, u]));
  const accountById = new Map(accounts.map((a) => [a.accountId, a]));
  const accountName = (id: string) => accountById.get(id)?.name ?? id;
  const accountSlug = (id: string) => accountById.get(id)?.appSlug;

  // Accumulate reasons per visible user (excluding the sender).
  const reasonsByUser = new Map<string, string[]>();
  const add = (userId: string, reason: string) => {
    if (userId === auth.userId) return;
    if (!userById.has(userId)) return;
    const cur = reasonsByUser.get(userId);
    if (cur) {
      if (!cur.includes(reason)) cur.push(reason);
    } else {
      reasonsByUser.set(userId, [reason]);
    }
  };

  if (siteAdmin) {
    for (const u of users) {
      add(u.userId, 'Site-admin directory');
    }
    // Enrich with membership context the site-admin may see.
    for (const m of members) {
      const slug = m.appSlug ?? accountSlug(m.accountId);
      add(m.userId, `Member of ${accountName(m.accountId)}${slug ? ` (${appLabel(slug)})` : ''}`);
    }
  } else {
    // app-admin scope: people known through administered apps.
    if (adminApps.size > 0) {
      for (const m of members) {
        const slug = (m.appSlug ?? accountSlug(m.accountId)) as EntitledAppSlug | undefined;
        if (slug && adminApps.has(slug)) {
          add(m.userId, `Has access to ${appLabel(slug)}`);
        }
      }
    }
    // account-manager scope: members of accounts the sender owns/manages.
    if (managedAccountIds.size > 0) {
      for (const m of members) {
        if (managedAccountIds.has(m.accountId)) {
          add(m.userId, `Member of ${accountName(m.accountId)}`);
        }
      }
    }
  }

  // Pending invitees (within scope) — email may already be a registered user.
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const bundlesRes = await ddb.send(new ScanCommand({ TableName: INVITATIONS_TABLE }));
  for (const b of (bundlesRes.Items ?? []) as BundleRow[]) {
    if (b.status !== 'pending' || !Array.isArray(b.grants) || !b.email) continue;
    const u = userByEmail.get(b.email.toLowerCase());
    if (!u) continue;
    for (const g of b.grants) {
      if (siteAdmin) continue; // already covered by the full directory
      if (adminApps.size > 0 && g.appSlug && adminApps.has(g.appSlug as EntitledAppSlug)) {
        add(u.userId, `Pending invite in ${appLabel(g.appSlug)}`);
      }
      if (g.kind === 'account-invite' && g.accountId && managedAccountIds.has(g.accountId)) {
        add(u.userId, `Pending invite to ${accountName(g.accountId)}`);
      }
    }
  }

  const results: DiscoveredInvitee[] = [...reasonsByUser.entries()]
    .map(([userId, reasons]) => {
      const u = userById.get(userId)!;
      return {
        userId: u.userId,
        email: u.email,
        displayName: u.displayName,
        status: (u.status ?? 'active') as UserStatus,
        reasons,
      } satisfies DiscoveredInvitee;
    })
    .filter((r) => matchesQuery({ userId: r.userId, email: r.email, displayName: r.displayName }, q))
    .sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email));

  return ok({ scope, results } satisfies InviteeSearchResponse);
});
