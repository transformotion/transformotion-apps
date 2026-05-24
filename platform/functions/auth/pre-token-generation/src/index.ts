import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { APPS, APP_SLUGS, type AppSlug } from '@transformotion/runtime-config';

// ── Clients ───────────────────────────────────────────────────────────────────

const cognito = new CognitoIdentityProviderClient({});
const ddb     = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const ACCOUNTS_TABLE        = process.env.ACCOUNTS_TABLE!;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_GROUP = Object.fromEntries(
  APPS.map(app => [app.slug, app.cognitoGroup])
) as Record<AppSlug, string>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MembershipRow {
  accountId: string;
  userId:    string;
  role:      string;
}

interface AccountRow {
  accountId: string;
  appSlug:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function queryMemberships(userId: string): Promise<MembershipRow[]> {
  const res = await ddb.send(new QueryCommand({
    TableName:                 ACCOUNT_MEMBERS_TABLE,
    IndexName:                 'userId-index',
    KeyConditionExpression:    'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ProjectionExpression:      'accountId, userId, #r',
    ExpressionAttributeNames:  { '#r': 'role' },
  }));
  return (res.Items ?? []) as MembershipRow[];
}

async function fetchAccountAppSlugs(accountIds: string[]): Promise<Map<string, AppSlug>> {
  if (accountIds.length === 0) return new Map();

  const keys = [...new Set(accountIds)].map(id => ({ accountId: id }));
  const res = await ddb.send(new BatchGetCommand({
    RequestItems: {
      [ACCOUNTS_TABLE]: {
        Keys:                 keys,
        ProjectionExpression: 'accountId, appSlug',
      },
    },
  }));

  const map = new Map<string, AppSlug>();
  const rows = (res.Responses?.[ACCOUNTS_TABLE] ?? []) as AccountRow[];
  for (const row of rows) {
    if (APP_SLUGS.includes(row.appSlug as AppSlug)) {
      map.set(row.accountId, row.appSlug as AppSlug);
    }
  }
  return map;
}

function groupByApp(
  memberships: MembershipRow[],
  appSlugByAccount: Map<string, AppSlug>,
): Record<string, Array<{ accountId: string; role: string }>> {
  const result: Record<string, Array<{ accountId: string; role: string }>> = {};
  for (const m of memberships) {
    const slug = appSlugByAccount.get(m.accountId);
    if (!slug) continue;
    if (!result[slug]) result[slug] = [];
    result[slug].push({ accountId: m.accountId, role: m.role });
  }
  return result;
}

async function reconcileInvariant(
  userId:        string,
  userPoolId:    string,
  currentGroups: string[],
  accountsByApp: Record<string, Array<{ accountId: string; role: string }>>,
  isSiteAdmin:   boolean,
): Promise<string[]> {
  const groups = [...currentGroups];

  for (const slug of APP_SLUGS) {
    const accessGroup    = ACCESS_GROUP[slug];
    const hasAccounts    = (accountsByApp[slug]?.length ?? 0) > 0;
    const inGroup        = groups.includes(accessGroup);

    if (hasAccounts && !inGroup) {
      console.log(`[pre-token] reconcile: adding ${userId} to ${accessGroup}`);
      try {
        await cognito.send(new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username:   userId,
          GroupName:  accessGroup,
        }));
        groups.push(accessGroup);
      } catch (err) {
        console.error(`[pre-token] reconcile: failed to add ${userId} to ${accessGroup}:`, err);
      }
    } else if (!hasAccounts && inGroup && !isSiteAdmin) {
      console.log(`[pre-token] reconcile: removing ${userId} from ${accessGroup}`);
      try {
        await cognito.send(new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username:   userId,
          GroupName:  accessGroup,
        }));
        const idx = groups.indexOf(accessGroup);
        if (idx !== -1) groups.splice(idx, 1);
      } catch (err) {
        console.error(`[pre-token] reconcile: failed to remove ${userId} from ${accessGroup}:`, err);
      }
    }
  }

  return groups;
}

function buildAppsList(reconciledGroups: string[], isSiteAdmin: boolean): string[] {
  if (isSiteAdmin) return [...APP_SLUGS];
  return APP_SLUGS.filter(slug => reconciledGroups.includes(ACCESS_GROUP[slug]));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (
  event: PreTokenGenerationTriggerEvent,
): Promise<PreTokenGenerationTriggerEvent> => {
  try {
    const userId        = event.userName;
    const userPoolId    = event.userPoolId;
    const currentGroups = event.request.groupConfiguration.groupsToOverride ?? [];
    const isSiteAdmin   = currentGroups.includes('site-admin');

    console.log('[pre-token] userId:', userId, 'groups:', currentGroups.join(','));

    const memberships      = await queryMemberships(userId);
    const accountIds       = memberships.map(m => m.accountId);
    const appSlugByAccount = await fetchAccountAppSlugs(accountIds);
    const accountsByApp    = groupByApp(memberships, appSlugByAccount);

    const reconciledGroups = await reconcileInvariant(
      userId, userPoolId, currentGroups, accountsByApp, isSiteAdmin,
    );

    const apps = buildAppsList(reconciledGroups, isSiteAdmin);

    const claims = {
      apps:       JSON.stringify(apps),
      accounts:   JSON.stringify(accountsByApp),
      site_admin: String(isSiteAdmin),
    };

    console.log('[pre-token] claims apps:', claims.apps, 'site_admin:', claims.site_admin);

    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: claims,
      },
    };

    return event;
  } catch (err) {
    console.error('[pre-token] FAILED — returning event unchanged:', err);
    return event;
  }
};
