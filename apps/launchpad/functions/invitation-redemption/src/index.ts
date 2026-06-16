import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
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
  /** JSON app registry (for human-facing app labels); falls back to the slug. */
  appRegistryJson?: string;
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

  async function redeemBundle(bundleId: string, auth: AuthClaims) {
    const bundleRes = await deps.ddb.send(new GetCommand({
      TableName: deps.invitationsTable,
      Key: { invitationId: bundleId },
    }));
    const bundle = bundleRes.Item as StoredBundle | undefined;
    if (!bundle || !Array.isArray(bundle.grants)) {
      throw notFound('Invitation not found');
    }

    // invitee-only (policy): the caller must be the bundle's intended invitee.
    if ((bundle.email ?? '').toLowerCase() !== auth.email.toLowerCase()) {
      throw forbidden('This invitation was sent to a different email address');
    }

    // Disabled users fail closed and cannot redeem (control-plane status). Absent
    // record ⇒ treated as active (profile is bootstrapped at /auth/setup).
    const userRes = await deps.ddb.send(new GetCommand({
      TableName: deps.usersTable,
      Key: { userId: auth.userId },
    }));
    if ((userRes.Item?.['status'] as string | undefined) === 'disabled') {
      throw forbidden('This account is disabled and cannot redeem invitations');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expired = bundle.status === 'expired'
      || (typeof bundle.expiresAt === 'number' && bundle.expiresAt < nowSec);

    // Evolving local view (mirrors the mock's live store WITHIN one bundle): a
    // grant applied earlier in the loop is visible to later grants, so a second
    // grant for the same app/account is correctly reported `duplicate`.
    const heldGroups = new Set(auth.groups);
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

        if (memberOf.has(accountId) || await isAccountMember(accountId, auth.userId)) {
          results.push({ ...base, outcome: 'duplicate', resultingAccountId: accountId, reason: 'Already a member of this account — no change.' });
          continue;
        }

        await deps.ddb.send(new PutCommand({
          TableName: deps.accountMembersTable,
          Item: {
            accountId,
            userId: auth.userId,
            email: auth.email,
            appSlug: effSlug,
            role: grant.role,
            joinedAt: new Date().toISOString(),
          },
        }));
        await ensureAccessGroup(auth.userId, effSlug);
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
      await ensureAccessGroup(auth.userId, appSlug);
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

    // userCreated is false: runtime user records are created at sign-in/`/auth/setup`,
    // not at redemption (the invitee is already authenticated here). State-equivalence
    // is about groups/accounts/memberships, which the per-grant logic above produces.
    const response: RedeemBundleResponse = {
      bundleId,
      userId: auth.userId,
      userCreated: false,
      results,
    };
    return ok(response);
  }

  return withAuthOnly(async ({ auth, event }) => {
    const resource = (event as APIGatewayProxyEvent).resource ?? '';
    if (resource === '/api/invitations/bundles/{bundleId}/redeem' && event.httpMethod === 'POST') {
      const bundleId = getPathParam(event as APIGatewayProxyEvent, 'bundleId');
      return redeemBundle(bundleId, auth);
    }
    throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
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
  appRegistryJson: process.env.APP_REGISTRY,
});
