import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';
import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
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

async function reconcileInvariant(
  userId: string,
  userPoolId: string,
  currentGroups: string[],
  accountsByApp: Record<string, Array<{ accountId: string; role: string }>>,
): Promise<string[]> {
  const groups = [...currentGroups];

  for (const slug of APP_SLUGS) {
    const accessGroup = ACCESS_GROUP[slug];
    const hasAccounts = (accountsByApp[slug]?.length ?? 0) > 0;
    const inGroup = groups.includes(accessGroup);

    // D11 item 1 (Phase 5): the site-admin override is REMOVED — the invariant
    // (group membership ⇔ ≥1 account for the app) applies uniformly. A site-admin
    // with no accounts for an app is removed from its access group like anyone
    // else; site-admin's supervisory power rides the site-admin Cognito group
    // (read from cognito:groups), not app-access groups.
    if (hasAccounts && !inGroup) {
      console.log(`[launchpad-pre-token] reconcile: adding ${userId} to ${accessGroup}`);
      try {
        await cognito.send(new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: userId,
          GroupName: accessGroup,
        }));
        groups.push(accessGroup);
      } catch (err) {
        console.error(`[launchpad-pre-token] reconcile: failed to add ${userId} to ${accessGroup}:`, err);
      }
    } else if (!hasAccounts && inGroup) {
      console.log(`[launchpad-pre-token] reconcile: removing ${userId} from ${accessGroup}`);
      try {
        await cognito.send(new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username: userId,
          GroupName: accessGroup,
        }));
        const idx = groups.indexOf(accessGroup);
        if (idx !== -1) groups.splice(idx, 1);
      } catch (err) {
        console.error(`[launchpad-pre-token] reconcile: failed to remove ${userId} from ${accessGroup}:`, err);
      }
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
    const userId = event.userName;
    const userPoolId = event.userPoolId;
    const currentGroups = event.request.groupConfiguration.groupsToOverride ?? [];

    console.log('[launchpad-pre-token] userId:', userId, 'groups:', currentGroups.join(','));

    const memberships = await queryMemberships(userId);

    // Resolve appSlug for legacy membership rows that predate D3 denormalization
    const missingAppSlugIds = memberships
      .filter(m => !m.appSlug)
      .map(m => m.accountId);
    const appSlugByAccount = await fetchAccountAppSlugs(missingAppSlugIds);

    const accountsByApp = groupByApp(memberships, appSlugByAccount);

    const reconciledGroups = await reconcileInvariant(
      userId,
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
