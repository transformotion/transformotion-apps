import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  withAuthOnly,
  parseBody,
  getPathParam,
  ok,
  created,
  noContent,
  badRequest,
  forbidden,
  conflict,
  HttpError,
  requireAccountAdmin,
  requireAccountMember,
  requireAccountOwnerOrManager,
  requireAccountOwnerRole,
  requireSupervisorySiteAdmin,
  decideRemoval,
  decideRoleChange,
  decideLastOwnerGuard,
  allOf,
  UNIFORM_DENY,
  type APIGatewayProxyEvent,
  type AuthClaims,
  type MembershipLoader,
  type SiteAdminLoader,
} from '@transformotion/lambda-middleware';
import type { AccountMemberRow, InvitationBundle, ListAccountMembersResponse } from '@transformotion/contracts/launchpad/invitations';
import { appAccessGroup, appAdminGroup, APP_GROUP_PREFIX, type AccountRole, type EntitledAppSlug, type UserStatus } from '@transformotion/contracts/_shared/auth';
import { randomUUID } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

// ── Pending invitations for an account (M11 — was a Phase-8 empty stub) ───────
// The invitation store (launchpad-invitations) keys by invitationId with the
// target account nested in `grants[]`. A GSI cannot index a nested-list
// attribute, and a bundle may grant into MULTIPLE accounts — so there is no
// viable target-account index without denormalising the write path. A filtered
// Scan of this small, low-volume control-plane table (the SAME pattern
// invitation-bundles list + invitee-search already use) is the correct lookup.
type StoredBundle = {
  invitationId?: string;
  bundleId?: string;
  email?: string;
  invitedBy?: string;
  createdAt?: string;
  expiresAt?: number;
  status?: string;
  grants?: Array<Record<string, unknown>>;
};

/**
 * Pure: pending bundles that grant into `accountId`, with grants scoped to that
 * account (so an owner never sees grants targeting OTHER accounts), excluding
 * accepted/revoked and expired (TTL deletion can lag). Sorted newest-first.
 */
export function extractPendingForAccount(
  items: StoredBundle[],
  accountId: string,
  nowSeconds: number,
): InvitationBundle[] {
  return items
    .filter((it) => Array.isArray(it.grants) && it.status === 'pending')
    .filter((it) => typeof it.expiresAt !== 'number' || it.expiresAt > nowSeconds)
    .map((it) => ({
      raw: it,
      grants: (it.grants ?? []).filter((g) => (g as { accountId?: string }).accountId === accountId),
    }))
    .filter(({ grants }) => grants.length > 0)
    .map(({ raw, grants }) => ({
      bundleId: (raw.bundleId ?? raw.invitationId ?? '') as string,
      email: (raw.email ?? '') as InvitationBundle['email'],
      invitedBy: (raw.invitedBy ?? '') as InvitationBundle['invitedBy'],
      createdAt: (raw.createdAt ?? '') as InvitationBundle['createdAt'],
      expiresAt: (raw.expiresAt ?? 0) as InvitationBundle['expiresAt'],
      status: (raw.status ?? 'pending') as InvitationBundle['status'],
      grants: grants as unknown as InvitationBundle['grants'],
    }))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/**
 * Pure: who may SEE an account's pending invitations — owner/manager of the
 * account, or a supervisory admin (site-admin / app-admin for the account's app).
 * Plain members and viewers must NOT see them (stricter than the member list).
 */
export function canSeePendingInvitations(args: {
  callerRole: string | undefined;
  isSiteAdmin: boolean;
  isAppAdmin: boolean;
}): boolean {
  return args.isSiteAdmin || args.isAppAdmin || args.callerRole === 'owner' || args.callerRole === 'manager';
}

async function loadPendingInvitations(accountId: string): Promise<InvitationBundle[]> {
  const res = await ddb.send(new ScanCommand({ TableName: INVITATIONS_TABLE }));
  return extractPendingForAccount((res.Items ?? []) as StoredBundle[], accountId, Math.floor(Date.now() / 1000));
}

/**
 * Live supervisory-site-admin check (D-3): read the `site-admin` group membership
 * LIVE via AdminListGroupsForUser, NOT from the caller's token — supervisory
 * removal is a sensitive mutation and must not trust a stale claim. Loader throws
 * propagate as 503 (fail closed) through requireSupervisorySiteAdmin's safeLoad.
 */
const siteAdminLoader: SiteAdminLoader = async (userId: string) => {
  const res = await cognito.send(new AdminListGroupsForUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: userId,
  }));
  return (res.Groups ?? []).some((g) => g.GroupName === 'site-admin');
};

/**
 * Terminate the target's session (D8). AdminUserGlobalSignOut invalidates refresh
 * tokens immediately, so the only residual is the bounded ≤1h access-token window.
 * Failures are SURFACED by the caller (never a silent success).
 */
async function globalSignOut(userId: string): Promise<void> {
  await cognito.send(new AdminUserGlobalSignOutCommand({
    UserPoolId: USER_POOL_ID,
    Username: userId,
  }));
}

/** Known entitled app slugs (the contract's `{app}-app-access` namespace). */
const ENTITLED_APP_SLUGS = new Set(Object.keys(APP_GROUP_PREFIX));

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

/** Injectable dependencies for the testable createAccount unit (M11 A4). */
export interface CreateAccountDeps {
  ddb: DynamoDBDocumentClient;
  cognito: CognitoIdentityProviderClient;
  accountsTable: string;
  accountMembersTable: string;
  userPoolId: string;
}

const createAccountDeps: CreateAccountDeps = {
  ddb,
  cognito,
  accountsTable: ACCOUNTS_TABLE,
  accountMembersTable: ACCOUNT_MEMBERS_TABLE,
  userPoolId: USER_POOL_ID,
};

// M11 A4 — POST /accounts: self-service create-first-account. Mirrors the v0
// `provisionAccountForUser`: creates the account, makes the CALLER the owner
// (owner membership), and ensures the caller holds the `{app}-app-access` group.
//
// auth.md ("Create their own account"): requires the app-access group + an active
// user; does NOT require a pre-existing membership; the creator becomes `owner`.
// m16.6.0: `appSlug` travels in the request body. The launchpad is multi-app and
// its token can't say which app the user clicked — that's request data (the tile).
// AUTHORIZATION is unchanged: the body says WHICH app; the caller's access GROUP
// authorizes it. Works with the launchpad token (whose `aud` is the launchpad
// client) precisely because the app no longer comes from `aud`.
export async function createAccount(
  event: APIGatewayProxyEvent,
  auth: Pick<AuthClaims, 'userId' | 'email' | 'groups'>,
  deps: CreateAccountDeps = createAccountDeps,
) {
  const { userId, email } = auth;
  const { name, appSlug } = parseBody<{ name?: string; appSlug?: string }>(event);
  if (!name?.trim()) throw badRequest('name is required');

  // Validate the target app (required; must be a known entitled app) → 400.
  if (!appSlug || !ENTITLED_APP_SLUGS.has(appSlug)) {
    throw badRequest('appSlug is required and must be a known app');
  }
  const slug = appSlug as EntitledAppSlug;

  // auth.md "Create their own account": REQUIRES the `{appSlug}-app-access` group
  // (groups-authoritative). The body specifies the app; the caller's access group
  // AUTHORIZES it — a caller without `{appSlug}-app-access` is denied regardless of
  // the appSlug sent (fail closed). Self-service creation does NOT bootstrap access.
  const accessGroup = appAccessGroup(slug);
  if (!auth.groups.includes(accessGroup)) {
    throw forbidden(`Access to '${slug}' is required to create an account`);
  }

  const accountId = randomUUID();
  const now = new Date().toISOString();

  await deps.ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: deps.accountsTable,
          Item: { accountId, appSlug: slug, name: name.trim(), ownerId: userId, plan: 'free', createdAt: now, updatedAt: now },
          ConditionExpression: 'attribute_not_exists(accountId)',
        },
      },
      {
        Put: {
          TableName: deps.accountMembersTable,
          Item: { accountId, userId, email, appSlug: slug, role: 'owner', joinedAt: now },
        },
      },
    ],
  }));

  // Ensure the `{app}-app-access` group (membership ⟹ access; idempotent — the
  // caller already holds it per the gate, and the pre-token trigger reconciles it
  // from the new owner membership). This is the runtime analog of the v0
  // `ensureAppAccessGroup`; the group lands in the caller's NEXT token. Redundant
  // given the gate, so best-effort: a transient Cognito blip must not fail an
  // otherwise-successful creation.
  try {
    await deps.cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: deps.userPoolId,
      Username: userId,
      GroupName: accessGroup,
    }));
  } catch (err) {
    console.error('[accounts] ensureAppAccessGroup (AddUserToGroup) failed after account creation:', err);
  }

  return created({
    account: { accountId, appSlug: slug, name: name.trim(), ownerId: userId, plan: 'free', createdAt: now },
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
// wires with no adapter. isLastOwner is computed from the loaded members array.
// pendingInvitations returns the account's REAL pending invitations (M11 — was a
// Phase-8 empty stub), but only for entitled callers (owner/manager/admin); a
// plain member/viewer still gets [] (see canSeePendingInvitations below).
// (displayName is omitted — optional; read-time enrichment from launchpad-users
//  per D6 is deferred. The v0 view falls back to email.)
async function getMembersDetail(accountId: string, userId: string, auth: AuthClaims) {
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

  // Pending invitations are account-scoped and gated STRICTER than the member
  // list: only owner/manager or a supervisory admin may see them — never a plain
  // member/viewer. (The member list itself is visible to any active member.)
  const appSlug = (account as { appSlug?: EntitledAppSlug }).appSlug;
  const entitled = canSeePendingInvitations({
    callerRole: members.find(m => m.userId === userId)?.role,
    isSiteAdmin: auth.siteAdmin === true,
    isAppAdmin: !!appSlug && auth.groups.includes(appAdminGroup(appSlug)),
  });

  const response: ListAccountMembersResponse = {
    accountId,
    members: memberRows,
    pendingInvitations: entitled ? await loadPendingInvitations(accountId) : [],
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

// PR-6B — DELETE /accounts/{accountId}: OWNER-ONLY self-service deletion. BLOCKS,
// does NOT cascade (owner-settled): an owner may delete only an account they have
// already emptied — sole member (themselves). If other members exist → 409 (empty
// it first via removeMember). The ONLY sanctioned cascade of a populated account is
// the ADR §9.3 site-admin orphaned-account cleanup, ruled separately and NOT here —
// there is intentionally no one-click delete-with-members.
async function deleteAccount(accountId: string, requesterId: string) {
  const { account, members, callerLoader } = await loadAccountContext(accountId);
  await requireAccountAdmin(() => requireAccountOwnerRole(callerLoader, accountId, requesterId));
  if (!account) throw forbidden(UNIFORM_DENY);

  if (members.length > 1) {
    throw conflict('Account still has other members — remove them first, then delete the account.');
  }

  // Fail-closed ordering (same as removal): delete control-plane state FIRST, then
  // sign out the sole member. A GlobalSignOut failure is surfaced, never silent.
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Delete: {
          TableName: ACCOUNTS_TABLE,
          Key: { accountId },
          ConditionExpression: 'attribute_exists(accountId)',
        },
      },
      ...members.map(m => ({
        Delete: { TableName: ACCOUNT_MEMBERS_TABLE, Key: { accountId, userId: m.userId } },
      })),
    ],
  }));

  try {
    for (const m of members) await globalSignOut(m.userId);
  } catch (err) {
    console.error('[accounts] GlobalSignOut failed after account deletion:', err);
    throw new HttpError(502, 'Account deleted, but session termination failed — retry to complete sign-out (the member\'s existing session may persist until token expiry).');
  }

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

// PR-6B (R5) — DELETE /accounts/{accountId}/members/{userId}: owner-or-manager with
// role-scoped removal (decideRemoval), OR supervisory site-admin (verified LIVE).
// Last-owner FLOOR applies universally; AdminUserGlobalSignOut on success (D8).
async function removeMember(accountId: string, requesterId: string, targetUserId: string) {
  const { account, members, callerLoader } = await loadAccountContext(accountId);
  if (!account) throw forbidden(UNIFORM_DENY);

  // Resolve the target first (fail closed): a non-member target is indistinguishable
  // from no access.
  const targetRow = members.find(m => m.userId === targetUserId);
  if (!targetRow) throw forbidden(UNIFORM_DENY);

  const callerRow = members.find(m => m.userId === requesterId);
  const isSelf = requesterId === targetUserId;

  // Authorization (requireAccountAdmin = anyOf over the branches): (owner-or-manager
  // AND role-scoped removal legal) OR supervisory site-admin (LIVE group check).
  // A loader/Cognito error in the supervisory branch surfaces as 503 (fail closed).
  await requireAccountAdmin(
    () => allOf(
      () => requireAccountOwnerOrManager(callerLoader, accountId, requesterId),
      async () => {
        if (!decideRemoval(callerRow?.role, targetRow.role, isSelf).allow) {
          throw forbidden(UNIFORM_DENY);
        }
      },
    ),
    () => requireSupervisorySiteAdmin(siteAdminLoader, requesterId),
  );

  // Last-owner FLOOR — applies to EVERYONE incl. supervisory site-admin: you cannot
  // remove the sole owner and orphan the account; delete the account instead (§9.3).
  if (!decideLastOwnerGuard(members, targetUserId).allow) {
    throw conflict('Cannot remove the last owner — transfer ownership or delete the account.');
  }

  // Fail-closed ordering: control-plane removal FIRST (authoritative — app-data writes
  // fail closed instantly via the live row-check, and the target's next token refresh
  // drops the account). Then terminate the session; surface a sign-out failure.
  await ddb.send(new DeleteCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    Key: { accountId, userId: targetUserId },
  }));

  try {
    await globalSignOut(targetUserId);
  } catch (err) {
    console.error('[accounts] GlobalSignOut failed after member removal:', err);
    throw new HttpError(502, 'Member removed, but session termination failed — retry to complete sign-out (the member\'s existing session may persist until token expiry).');
  }

  return noContent();
}

// R6 — PUT /accounts/{accountId}/members/{userId}/role: owner-or-manager with
// role-scoped assignment legality (decideRoleChange). Site-admin supervisory
// authority does NOT include role management (account-data management is
// owner/manager only). Last-owner FLOOR blocks demoting the sole owner. Returns
// the updated ListAccountMembersResponse (contract) so the v0 account-management
// view refreshes from the response with no extra read.
async function updateMemberRole(
  event: APIGatewayProxyEvent,
  accountId: string,
  requesterId: string,
  targetUserId: string,
) {
  const { account, members, callerLoader } = await loadAccountContext(accountId);
  if (!account) throw forbidden(UNIFORM_DENY);

  const targetRow = members.find(m => m.userId === targetUserId);
  if (!targetRow) throw forbidden(UNIFORM_DENY); // non-member target → uniform deny

  const { role } = parseBody<{ role?: string }>(event);
  const VALID_ROLES: AccountRole[] = ['owner', 'manager', 'member', 'viewer'];
  if (!role || !VALID_ROLES.includes(role as AccountRole)) {
    throw badRequest('role is required and must be one of: owner, manager, member, viewer');
  }
  const newRole = role as AccountRole;
  const callerRow = members.find(m => m.userId === requesterId);

  // Owner/manager AND the role change is legal for the caller's role. No
  // supervisory-site-admin branch by design (role mgmt is not supervisory).
  await requireAccountAdmin(() => allOf(
    () => requireAccountOwnerOrManager(callerLoader, accountId, requesterId),
    async () => {
      if (!decideRoleChange(callerRow?.role, targetRow.role, newRole).allow) {
        throw forbidden(UNIFORM_DENY);
      }
    },
  ));

  // Last-owner FLOOR — never demote the sole owner and orphan the account.
  if (
    targetRow.role === 'owner' &&
    newRole !== 'owner' &&
    !decideLastOwnerGuard(members, targetUserId).allow
  ) {
    throw conflict('Cannot change the role of the last owner — assign another owner first.');
  }

  if (targetRow.role !== newRole) {
    await ddb.send(new UpdateCommand({
      TableName: ACCOUNT_MEMBERS_TABLE,
      Key: { accountId, userId: targetUserId },
      UpdateExpression: 'SET #r = :role',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':role': newRole },
      ConditionExpression: 'attribute_exists(userId)',
    }));
    targetRow.role = newRole; // reflect in the returned member list
  }

  const ownerCount = members.filter(m => m.role === 'owner').length;
  const response: ListAccountMembersResponse = {
    accountId,
    members: members.map(m => ({
      userId: m.userId,
      email: m.email ?? '',
      status: (m.status as UserStatus | undefined) ?? 'active',
      role: m.role as AccountRole,
      joinedAt: m.joinedAt,
      isLastOwner: m.role === 'owner' && ownerCount === 1,
    })),
    // The caller of this role-change is owner/manager (gated above) — entitled to
    // see the account's pending invitations, kept consistent with GET /members/detail.
    pendingInvitations: await loadPendingInvitations(accountId),
  };
  return ok(response);
}

// withAuthOnly (M16 Phase 6, ruling #4): this control-plane handler keys off the
// PATH accountId and auth.userId — it never reads the X-Account-Id header, so it
// must NOT require one (withAuth/resolveAccountContext would 400 POST /accounts).
export const handler = withAuthOnly(async ({ auth, event }) => {
  const { userId } = auth;
  const resource = event.resource ?? '';

  // R7: createAccount — no account context (appSlug from `aud`, gate on the
  // app-access group). M11 A4.
  if (resource === '/accounts' && event.httpMethod === 'POST') {
    return createAccount(event, auth);
  }

  const accountId = getPathParam(event, 'accountId');

  // R2 (NEW): full member detail (ListAccountMembersResponse).
  if (resource === '/accounts/{accountId}/members/detail' && event.httpMethod === 'GET') {
    return getMembersDetail(accountId, userId, auth);
  }

  // Legacy GET /members (thin shape) — retained, unwired-to-UI (see §7 retirement map).
  if (resource === '/accounts/{accountId}/members' && event.httpMethod === 'GET') {
    return listMembers(accountId, userId);
  }

  // R6: member role change (owner/manager; role-scoped).
  if (resource === '/accounts/{accountId}/members/{userId}/role' && event.httpMethod === 'PUT') {
    const targetUserId = getPathParam(event, 'userId');
    return updateMemberRole(event, accountId, userId, targetUserId);
  }

  // PR-6B (R5): member removal.
  if (resource === '/accounts/{accountId}/members/{userId}' && event.httpMethod === 'DELETE') {
    const targetUserId = getPathParam(event, 'userId');
    return removeMember(accountId, userId, targetUserId);
  }

  if (event.httpMethod === 'GET') return getAccount(accountId, userId);            // R1
  if (event.httpMethod === 'PUT') return updateAccount(event, accountId, userId);  // R3
  if (event.httpMethod === 'DELETE') return deleteAccount(accountId, userId);      // PR-6B

  throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
});
