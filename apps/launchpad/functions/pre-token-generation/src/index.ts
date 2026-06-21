import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';
import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE!;

interface AppEntry {
  slug: string;
  cognitoGroup: string;
}

const APP_REGISTRY: AppEntry[] = JSON.parse(process.env.APP_REGISTRY!).apps as AppEntry[];
const APP_SLUGS = APP_REGISTRY.map(app => app.slug);
const ACCESS_GROUP = Object.fromEntries(APP_REGISTRY.map(app => [app.slug, app.cognitoGroup]));

interface MembershipRow {
  accountId: string;
  userId: string;
  role: string;
  appSlug?: string;
}

/**
 * The stable user id for control-plane TABLE keys (account-members, users): the
 * Cognito `sub`. This is what `@transformotion/lambda-middleware` derives
 * (`claims['sub']`) and what the redemption handler writes, so the membership
 * table is keyed on the sub.
 *
 * It is NOT `event.userName`: for FEDERATED users (Google/Facebook/Microsoft) the
 * Cognito Username is provider-shaped (e.g. `Google_…`) and DIVERGES from the sub,
 * so keying a table query on userName silently returns no rows — federated
 * account-invitees would never get their memberships in the token (#486). Native
 * users have Username == sub (email-alias pool), which is why this stayed hidden
 * until the first social-IdP redemption. Cognito GROUP ops still use the Username.
 */
export function membershipUserId(
  event: { userName: string; request: { userAttributes?: Record<string, string> } },
): string {
  return event.request.userAttributes?.['sub'] ?? event.userName;
}

interface AccountRow {
  accountId: string;
  appSlug: string;
}

async function queryMemberships(userId: string): Promise<MembershipRow[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ProjectionExpression: 'accountId, userId, #r, appSlug',
    ExpressionAttributeNames: { '#r': 'role' },
  }));

  return (res.Items ?? []) as MembershipRow[];
}

async function fetchAccountAppSlugs(accountIds: string[]): Promise<Map<string, string>> {
  if (accountIds.length === 0) return new Map();

  const keys = [...new Set(accountIds)].map(accountId => ({ accountId }));
  const res = await ddb.send(new BatchGetCommand({
    RequestItems: {
      [ACCOUNTS_TABLE]: {
        Keys: keys,
        ProjectionExpression: 'accountId, appSlug',
      },
    },
  }));

  const rows = (res.Responses?.[ACCOUNTS_TABLE] ?? []) as AccountRow[];
  const appSlugByAccount = new Map<string, string>();

  for (const row of rows) {
    if (APP_SLUGS.includes(row.appSlug)) {
      appSlugByAccount.set(row.accountId, row.appSlug);
    }
  }

  return appSlugByAccount;
}

// M16 D8: accounts claim is lean triples: { [appSlug]: [{ accountId, role }] }
// appSlug is denormalized on new membership rows; legacy rows fall back to accounts table lookup.
function groupByApp(
  memberships: MembershipRow[],
  appSlugByAccount: Map<string, string>,
): Record<string, Array<{ accountId: string; role: string }>> {
  const result: Record<string, Array<{ accountId: string; role: string }>> = {};

  for (const membership of memberships) {
    const slug = membership.appSlug ?? appSlugByAccount.get(membership.accountId);
    if (!slug) continue; // deny by default — no appSlug resolvable (D9 fail-closed)

    result[slug] ??= [];
    result[slug].push({ accountId: membership.accountId, role: membership.role });
  }

  return result;
}

/** The reconcile decision: the group list to claim on, and the access groups to add. */
export interface ReconcilePlan {
  /** Groups after the add-only reconcile (drives the apps claim). */
  resultingGroups: string[];
  /** Access groups to AdminAddUserToGroup (a user holds ≥1 account but lacks the group). */
  toAdd: string[];
}

/**
 * Pure, ADD-ONLY reconcile of the app-access invariant.
 *
 * The app-access invariant is ONE-DIRECTIONAL (auth.md §"App-access is
 * independently held"): membership ⟹ app-access, but app-access ⇏ membership.
 * So this only ADDs the access group for a user who holds ≥1 account for the app
 * and lacks it. It MUST NEVER strip the access group when the user has zero
 * accounts — "access, no accounts" is a VALID designed state (the app-grant
 * landing that drives create-first-account), and it must SURVIVE every token
 * refresh. App-access is removed ONLY by explicit grant-removal / app-removal
 * cascade operations, never by this reconcile.
 *
 * #473: the former `else if (!hasAccounts && inGroup)` remove-on-zero branch
 * enforced a bidirectional ⇔ and stripped app-access on the next token refresh,
 * locking real app-grant invitees out of the create-first-account flow.
 */
export function planReconcile(
  currentGroups: string[],
  accountsByApp: Record<string, Array<{ accountId: string; role: string }>>,
  appSlugs: string[],
  accessGroupOf: Record<string, string>,
): ReconcilePlan {
  const resultingGroups = [...currentGroups];
  const toAdd: string[] = [];

  for (const slug of appSlugs) {
    const accessGroup = accessGroupOf[slug];
    const hasAccounts = (accountsByApp[slug]?.length ?? 0) > 0;
    const inGroup = resultingGroups.includes(accessGroup);

    if (hasAccounts && !inGroup) {
      toAdd.push(accessGroup);
      resultingGroups.push(accessGroup);
    }
    // No removal branch — the invariant is one-directional (see doc above, #473).
  }

  return { resultingGroups, toAdd };
}

async function reconcileInvariant(
  userId: string,
  userPoolId: string,
  currentGroups: string[],
  accountsByApp: Record<string, Array<{ accountId: string; role: string }>>,
): Promise<string[]> {
  const { resultingGroups, toAdd } = planReconcile(currentGroups, accountsByApp, APP_SLUGS, ACCESS_GROUP);
  const groups = [...resultingGroups];

  for (const accessGroup of toAdd) {
    console.log(`[launchpad-pre-token] reconcile: adding ${userId} to ${accessGroup}`);
    try {
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: userId,
        GroupName: accessGroup,
      }));
    } catch (err) {
      console.error(`[launchpad-pre-token] reconcile: failed to add ${userId} to ${accessGroup}:`, err);
      // The add failed — do not claim a group the user is not actually in.
      const idx = groups.indexOf(accessGroup);
      if (idx !== -1) groups.splice(idx, 1);
    }
  }

  return groups;
}

function buildAppsList(reconciledGroups: string[]): string[] {
  // D11 item 1 (Phase 5): no site-admin all-apps shortcut — the apps claim
  // reflects the reconciled (membership-derived) access groups uniformly. A
  // site-admin without membership does not receive app-data access; supervisory
  // surfaces are driven by the site-admin Cognito group, not the apps claim.
  return APP_SLUGS.filter(slug => reconciledGroups.includes(ACCESS_GROUP[slug]));
}

export const handler = async (
  event: PreTokenGenerationTriggerEvent,
): Promise<PreTokenGenerationTriggerEvent> => {
  try {
    // Cognito Username — used for GROUP ops (AdminAddUserToGroup). For federated
    // users this is provider-shaped (e.g. Google_…).
    const cognitoUsername = event.userName;
    // Stable id for control-plane TABLE keys — the sub (#486). Diverges from the
    // Username for federated users; keying table queries on the Username silently
    // misses every row.
    const subject = membershipUserId(event);
    const userPoolId = event.userPoolId;
    const currentGroups = event.request.groupConfiguration.groupsToOverride ?? [];

    console.log('[launchpad-pre-token] username:', cognitoUsername, 'sub:', subject, 'groups:', currentGroups.join(','));

    const memberships = await queryMemberships(subject);

    // Resolve appSlug for legacy membership rows that predate D3 denormalization
    const missingAppSlugIds = memberships
      .filter(m => !m.appSlug)
      .map(m => m.accountId);
    const appSlugByAccount = await fetchAccountAppSlugs(missingAppSlugIds);

    const accountsByApp = groupByApp(memberships, appSlugByAccount);

    // Group ops key on the Cognito Username (NOT the sub) — for federated users
    // AdminAddUserToGroup needs the provider-shaped Username.
    const reconciledGroups = await reconcileInvariant(
      cognitoUsername,
      userPoolId,
      currentGroups,
      accountsByApp,
    );

    // M16 Phase 6 (D11) + M11 groups-authoritative: NO admin claims are emitted.
    // Both `site_admin` and `app_admin` are struck — site-admin and app-admin
    // status travel in `cognito:groups` (`site-admin` / `{app}-app-admin`) and are
    // read group-side by consumers, never as a token claim. The app-admin-grants
    // table is now a UI/discovery projection only; this trigger no longer reads it.
    // Emitted claims are app/account scoped (membership-derived).
    const claims: Record<string, string> = {
      apps: JSON.stringify(buildAppsList(reconciledGroups)),
      accounts: JSON.stringify(accountsByApp),
    };

    console.log('[launchpad-pre-token] claims apps:', claims['apps']);

    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: claims,
      },
    };

    return event;
  } catch (err) {
    console.error('[launchpad-pre-token] FAILED - returning event unchanged:', err);
    return event;
  }
};
