import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  getPathParam,
  ok,
  badRequest,
  forbidden,
  notFound,
  type APIGatewayProxyEvent,
  type AuthClaims,
} from '@transformotion/lambda-middleware';
import { appAccessGroup, type AccountRole, type EntitledAppSlug } from '@transformotion/contracts/_shared/auth';
import type {
  GrantRedemptionResult,
  RedeemBundleResponse,
} from '@transformotion/contracts/launchpad/invitations';

// M11 A5 — invitation-bundle redemption (POST /api/invitations/bundles/{bundleId}/redeem).
// Builds the redemption BEHAVIOUR for the two m16.5.0 grant kinds, mirroring the
// v0 `redeemInvitationBundle`:
//   • account-invite — add the invitee to the EXISTING account at the grant role,
//     and ensure the `{app}-app-access` group (membership ⟹ access).
//   • app-grant      — ensure the `{app}-app-access` group ONLY; create NO account
//     and NO membership (the "access, no accounts" state). Idempotent: a no-op
//     when the invitee already holds access.
// Email/redemption-link DELIVERY is the SES seam and is NOT built here — this is
// the behaviour that runs when an (already-authenticated) invitee redeems.

/** A grant as persisted inside a stored bundle row (Phase 8 writes this shape). */
interface StoredAccountInviteGrant {
  grantId: string;
  kind: 'account-invite';
  appSlug: EntitledAppSlug;
  accountId: string;
  role: AccountRole;
}
interface StoredAppGrant {
  grantId: string;
  kind: 'app-grant';
  appSlug: EntitledAppSlug;
}
type StoredGrant = StoredAccountInviteGrant | StoredAppGrant;

/** A bundle row in the invitations table (PK invitationId = bundleId). */
interface StoredBundle {
  invitationId: string;
  email: string;
  expiresAt?: number;
  status?: string;
  grants: StoredGrant[];
}

interface AppEntry { slug: string; displayName: string }

export interface RedemptionDeps {
  ddb: DynamoDBDocumentClient;
  cognito: CognitoIdentityProviderClient;
  invitationsTable: string;
  accountsTable: string;
  accountMembersTable: string;
  usersTable: string;
  userPoolId: string;
  /**
   * Deployed environment ('dev' | 'prod'). The SERVER-SIDE boundary for the demo
   * BYPASS path (redeem-as / impersonation): it is structurally refused unless this
   * is a non-prod environment. This is the real guard — NOT the client dev-tools
   * flag (which only hides UI and is not a security boundary).
   */
  stage: string;
  /** JSON app registry (for human-facing app labels); falls back to the slug. */
  appRegistryJson?: string;
}

/** The user a bundle is being redeemed FOR (the caller, or an impersonated invitee). */
interface Redeemer {
  userId: string;
  email: string;
  /** Current group set (token groups for the caller; live groups for impersonation). */
  groups: string[];
}

export function createHandler(deps: RedemptionDeps) {
  const appLabels: Record<string, string> = (() => {
    try {
      return Object.fromEntries(
        (JSON.parse(deps.appRegistryJson ?? '{"apps":[]}').apps as AppEntry[]).map((a) => [a.slug, a.displayName]),
      );
    } catch {
      return {};
    }
  })();
  const appLabel = (slug: string): string => appLabels[slug] ?? slug;

  // ensureAppAccessGroup's runtime analog: add the EXACT contract access group
  // string. The pre-token trigger reflects it in the invitee's next token, so the
  // groups-authoritative gate (and the create-first-account surface) then see it.
  async function ensureAccessGroup(userId: string, appSlug: EntitledAppSlug): Promise<void> {
    await deps.cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: deps.userPoolId,
      Username: userId,
      GroupName: appAccessGroup(appSlug),
    }));
  }

  async function isAccountMember(accountId: string, userId: string): Promise<boolean> {
    const res = await deps.ddb.send(new GetCommand({
      TableName: deps.accountMembersTable,
      Key: { accountId, userId },
    }));
    return !!res.Item;
  }

  async function loadBundle(bundleId: string): Promise<StoredBundle> {
    const bundleRes = await deps.ddb.send(new GetCommand({ TableName: deps.invitationsTable, Key: { invitationId: bundleId } }));
    const bundle = bundleRes.Item as StoredBundle | undefined;
    if (!bundle || !Array.isArray(bundle.grants)) throw notFound('Invitation not found');
    return bundle;
  }

  // Disabled users fail closed and cannot redeem (control-plane status). Absent
  // record ⇒ treated as active (profile is bootstrapped at /auth/setup).
  async function assertNotDisabled(userId: string): Promise<void> {
    const userRes = await deps.ddb.send(new GetCommand({ TableName: deps.usersTable, Key: { userId } }));
    if ((userRes.Item?.['status'] as string | undefined) === 'disabled') {
      throw forbidden('This account is disabled and cannot redeem invitations');
    }
  }

  // Apply a bundle's grants FOR `redeemer`. Shared by the NORMAL (caller redeems
  // their own bundle) and the DEV-ONLY impersonation paths — the per-grant effect
  // is identical; only WHO redeems and which guards run beforehand differ.
  async function applyBundle(bundle: StoredBundle, bundleId: string, redeemer: Redeemer): Promise<GrantRedemptionResult[]> {
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = bundle.status === 'expired'
      || (typeof bundle.expiresAt === 'number' && bundle.expiresAt < nowSec);

    // Evolving local view (mirrors the mock's live store WITHIN one bundle): a
    // grant applied earlier in the loop is visible to later grants.
    const heldGroups = new Set(redeemer.groups);
    const memberOf = new Set<string>();

    const results: GrantRedemptionResult[] = [];

    for (const grant of bundle.grants) {
      if (grant.kind === 'account-invite') {
        const { accountId } = grant;
        const acctRes = await deps.ddb.send(new GetCommand({
          TableName: deps.accountsTable,
          Key: { accountId },
        }));
        const account = acctRes.Item as { appSlug?: EntitledAppSlug; name?: string } | undefined;
        const target = account?.name ?? accountId;
        const base = { grantId: grant.grantId, kind: grant.kind, appSlug: grant.appSlug, target };

        if (expired) { results.push({ ...base, outcome: 'expired', reason: 'The invitation link has expired.' }); continue; }
        if (!account) { results.push({ ...base, outcome: 'rejected', reason: 'That account no longer exists.' }); continue; }

        // appSlug from the account row is authoritative (defends a malformed grant).
        const effSlug = account.appSlug ?? grant.appSlug;

        if (memberOf.has(accountId) || await isAccountMember(accountId, redeemer.userId)) {
          results.push({ ...base, outcome: 'duplicate', resultingAccountId: accountId, reason: 'Already a member of this account — no change.' });
          continue;
        }

        await deps.ddb.send(new PutCommand({
          TableName: deps.accountMembersTable,
          Item: {
            accountId,
            userId: redeemer.userId,
            email: redeemer.email,
            appSlug: effSlug,
            role: grant.role,
            joinedAt: new Date().toISOString(),
          },
        }));
        await ensureAccessGroup(redeemer.userId, effSlug);
        memberOf.add(accountId);
        heldGroups.add(appAccessGroup(effSlug));
        results.push({ ...base, outcome: 'accepted', resultingAccountId: accountId, reason: `Joined ${target} as ${grant.role}.` });
        continue;
      }

      // app-grant — ACCESS-ONLY. Ensure the access group; NO account, NO
      // membership. Produces the exact "access, no accounts" state the v0 flow
      // produces, so the create-first-account surface works for redeemed users.
      const appSlug = grant.appSlug;
      const target = appLabel(appSlug);
      const base = { grantId: grant.grantId, kind: grant.kind, appSlug, target };

      if (expired) { results.push({ ...base, outcome: 'expired', reason: 'The invitation link has expired.' }); continue; }

      // Idempotent duplicate guard: already holds access (group-authoritative).
      if (heldGroups.has(appAccessGroup(appSlug))) {
        results.push({ ...base, outcome: 'duplicate', reason: `Already has access to ${target} — no change.` });
        continue;
      }
      await ensureAccessGroup(redeemer.userId, appSlug);
      heldGroups.add(appAccessGroup(appSlug));
      results.push({ ...base, outcome: 'accepted', reason: `App access granted — create your first account in ${target} to get started.` });
    }

    // Mark the bundle accepted once anything applied (idempotent re-redeem yields
    // `duplicate` outcomes via the per-grant guards above, never a double-apply).
    if (!expired && results.some((r) => r.outcome === 'accepted' || r.outcome === 'duplicate')) {
      await deps.ddb.send(new UpdateCommand({
        TableName: deps.invitationsTable,
        Key: { invitationId: bundleId },
        UpdateExpression: 'SET #s = :accepted',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':accepted': 'accepted' },
      }));
    }

    return results;
  }

  function response(bundleId: string, userId: string, results: GrantRedemptionResult[]) {
    // userCreated is false: runtime user records are created at sign-in/`/auth/setup`,
    // not at redemption. State-equivalence is about groups/accounts/memberships.
    const body: RedeemBundleResponse = { bundleId, userId, userCreated: false, results };
    return ok(body);
  }

  // NORMAL redemption — the caller redeems THEIR OWN bundle (invitee-only). A valid
  // PROD path; the invitee arrives via their own auth (email link → sign-in → here).
  async function redeemAsCaller(bundleId: string, auth: AuthClaims) {
    const bundle = await loadBundle(bundleId);
    if ((bundle.email ?? '').toLowerCase() !== auth.email.toLowerCase()) {
      throw forbidden('This invitation was sent to a different email address');
    }
    await assertNotDisabled(auth.userId);
    const results = await applyBundle(bundle, bundleId, { userId: auth.userId, email: auth.email, groups: auth.groups });
    return response(bundleId, auth.userId, results);
  }

  async function liveGroups(userId: string): Promise<string[]> {
    const res = await deps.cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: deps.userPoolId, Username: userId }));
    return (res.Groups ?? []).map((g) => g.GroupName).filter((n): n is string => !!n);
  }

  async function resolveUserIdByEmail(email: string): Promise<string | null> {
    const res = await deps.cognito.send(new ListUsersCommand({
      UserPoolId: deps.userPoolId,
      Filter: `email = "${email.replace(/"/g, '')}"`,
      Limit: 1,
    }));
    return res.Users?.[0]?.Username ?? null;
  }

  // DEV-ONLY BYPASS — the demo harness's privileged trigger. Impersonates the
  // bundle's invitee and redeems on their behalf WITHOUT their email-link/auth, so
  // the real A5 flow can be exercised in dev before SES.
  //
  // SERVER-SIDE BOUNDARY (the REAL guard): structurally refused unless this is a
  // non-prod stage — `deps.stage` is the DEPLOYED environment, NOT the client
  // dev-tools flag (which only hides UI and is not a security boundary). So the
  // impersonation capability has NO real backend path in prod, whatever a client
  // sends. Even in dev, only a site-admin caller may trigger it.
  async function redeemAsInvitee(bundleId: string, auth: AuthClaims) {
    if (deps.stage === 'prod') {
      throw notFound('Not found'); // indistinguishable from a route that does not exist
    }
    if (!auth.groups.includes('site-admin')) {
      throw forbidden('Only a site-admin may use the redemption demo');
    }
    const bundle = await loadBundle(bundleId);
    const inviteeEmail = (bundle.email ?? '').toLowerCase();
    const inviteeUserId = await resolveUserIdByEmail(inviteeEmail);
    if (!inviteeUserId) {
      throw badRequest(`No user exists for ${inviteeEmail}; the invitee must have signed in at least once before the demo can impersonate them.`);
    }
    await assertNotDisabled(inviteeUserId);
    const groups = await liveGroups(inviteeUserId);
    const results = await applyBundle(bundle, bundleId, { userId: inviteeUserId, email: inviteeEmail, groups });
    return response(bundleId, inviteeUserId, results);
  }

  return withAuthOnly(async ({ auth, event }) => {
    const e = event as APIGatewayProxyEvent;
    const resource = e.resource ?? '';
    if (resource === '/api/invitations/bundles/{bundleId}/redeem' && e.httpMethod === 'POST') {
      return redeemAsCaller(getPathParam(e, 'bundleId'), auth);
    }
    if (resource === '/api/invitations/bundles/{bundleId}/redeem-as' && e.httpMethod === 'POST') {
      return redeemAsInvitee(getPathParam(e, 'bundleId'), auth);
    }
    throw badRequest(`Unrecognised route: ${e.httpMethod} ${resource}`);
  });
}

export const handler = createHandler({
  ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  cognito: new CognitoIdentityProviderClient({}),
  invitationsTable: process.env.INVITATIONS_TABLE!,
  accountsTable: process.env.ACCOUNTS_TABLE!,
  accountMembersTable: process.env.ACCOUNT_MEMBERS_TABLE!,
  usersTable: process.env.USERS_TABLE!,
  userPoolId: process.env.USER_POOL_ID!,
  stage: process.env.STAGE ?? 'dev',
  appRegistryJson: process.env.APP_REGISTRY,
});
