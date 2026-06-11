import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  ok,
  badRequest,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

// M16 D11: /auth/setup is now profile-bootstrap only.
// - Creates/ensures the user item (displayName, emailLower, status, preferences).
// - Does NOT auto-create a default account (first-login users without invitations
//   get an empty access state; access comes via invitation redemption).
// - Does NOT write custom:active_account or custom:accounts (D11 vestiges).
//
// CONTRACT NOTE: AccountSetupResponse still carries accountId (string) for
// backward compatibility. When the user has existing accounts in their claims,
// we return the first one. When no accounts exist yet, we return '' to signal
// empty access state. This requires a v0 contract update (accountId optional)
// tracked at https://github.com/transformotion/transformotion-apps/issues/413.

export const handler = withAuthOnly(async ({ auth, event }) => {
  const resource = (event as APIGatewayProxyEvent).resource ?? '';
  if (resource !== '/auth/setup') {
    throw badRequest(`Unrecognised auth route: ${resource}`);
  }
  return handleSetup(auth);
});

async function handleSetup(auth: { userId: string; email: string }) {
  const { userId, email } = auth;
  const now = new Date().toISOString();

  // Ensure user item exists with M16 profile fields
  const existing = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));

  if (!existing.Item) {
    // Fetch display name from Cognito given_name/family_name attributes
    const displayName = await resolveDisplayNameFromCognito(userId, email);
    const emailLower = email.toLowerCase();

    await ddb.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        userId,
        email,
        emailLower,
        displayName,
        status: 'active',
        preferences: { notificationsEnabled: false },
        profileComplete: false,
        activeAccounts: {},
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(userId)',
    }));

    return ok({ accountId: '', created: true });
  }

  // User item already exists — return first account from memberships if any
  const membershipsRes = await ddb.send(new QueryCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ProjectionExpression: 'accountId',
    Limit: 1,
  }));

  const firstAccountId = (membershipsRes.Items?.[0]?.['accountId'] as string | undefined) ?? '';
  return ok({ accountId: firstAccountId, created: false });
}

async function resolveDisplayNameFromCognito(userId: string, email: string): Promise<string> {
  try {
    const res = await cognito.send(new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
    }));
    const given = res.UserAttributes?.find(a => a.Name === 'given_name')?.Value?.trim();
    const family = res.UserAttributes?.find(a => a.Name === 'family_name')?.Value?.trim();
    if (given || family) return [given, family].filter(Boolean).join(' ');
  } catch {
    // Fall through to email fallback
  }
  // Fallback: email local part
  return email.split('@')[0] ?? email;
}
