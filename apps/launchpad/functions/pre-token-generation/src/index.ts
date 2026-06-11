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
const APP_ADMIN_GRANTS_TABLE = process.env.APP_ADMIN_GRANTS_TABLE!;

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

interface AppAdminGrantRow {
  appSlug: string;
  userId: string;
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

async function queryAppAdminGrants(userId: string): Promise<AppAdminGrantRow[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: APP_ADMIN_GRANTS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ProjectionExpression: 'appSlug, userId',
  }));
  return (res.Items ?? []) as AppAdminGrantRow[];
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
  isSiteAdmin: boolean,
): Promise<string[]> {
  const groups = [...currentGroups];

  for (const slug of APP_SLUGS) {
    const accessGroup = ACCESS_GROUP[slug];
    const hasAccounts = (accountsByApp[slug]?.length ?? 0) > 0;
    const inGroup = groups.includes(accessGroup);

    // D11 item 1 NOTE: site-admin override removal (isSiteAdmin bypass on the
    // !hasAccounts branch) is Phase 5 work. It is intentionally NOT removed here.
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
    } else if (!hasAccounts && inGroup && !isSiteAdmin) {
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

function buildAppsList(reconciledGroups: string[], isSiteAdmin: boolean): string[] {
  if (isSiteAdmin) return [...APP_SLUGS];
  return APP_SLUGS.filter(slug => reconciledGroups.includes(ACCESS_GROUP[slug]));
}

export const handler = async (
  event: PreTokenGenerationTriggerEvent,
): Promise<PreTokenGenerationTriggerEvent> => {
  try {
    const userId = event.userName;
    const userPoolId = event.userPoolId;
    const currentGroups = event.request.groupConfiguration.groupsToOverride ?? [];
    const isSiteAdmin = currentGroups.includes('site-admin');

    console.log('[launchpad-pre-token] userId:', userId, 'groups:', currentGroups.join(','));

    const [memberships, appAdminGrants] = await Promise.all([
      queryMemberships(userId),
      queryAppAdminGrants(userId),
    ]);

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
      isSiteAdmin,
    );

    // M16 D8: app_admin claim — array of appSlugs where user is app-admin
    const appAdminSlugs = appAdminGrants
      .map(g => g.appSlug)
      .filter(slug => APP_SLUGS.includes(slug));

    const claims: Record<string, string> = {
      apps: JSON.stringify(buildAppsList(reconciledGroups, isSiteAdmin)),
      accounts: JSON.stringify(accountsByApp),
      site_admin: String(isSiteAdmin),
      app_admin: JSON.stringify(appAdminSlugs),
    };

    console.log('[launchpad-pre-token] claims apps:', claims['apps'], 'site_admin:', claims['site_admin'], 'app_admin:', claims['app_admin']);

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
