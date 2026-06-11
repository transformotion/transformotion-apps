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
import type { AccountSetupResponse } from '@transformotion/contracts/launchpad/types';

// M16 D11 (contract m16.1.0): /auth/setup is profile-bootstrap only.
// - Ensures the user item exists (displayName, emailLower, status, preferences).
// - Never auto-creates an account; access is acquired via invitation redemption.
// - Never writes custom:active_account / custom:accounts (D11 vestiges).
// Response is AccountSetupResponse { accountId?, userCreated, profileComplete }:
//   userCreated      — true when THIS call created the user's profile record.
//   profileComplete  — false until first-time profile setup completes.
//   accountId        — omitted unless the user already holds an account.

interface HandlerDeps {
  ddb: DynamoDBDocumentClient;
  cognito: CognitoIdentityProviderClient;
  usersTable: string;
  accountMembersTable: string;
  userPoolId: string;
}

export function createHandler(deps: HandlerDeps) {
  const { ddb, cognito, usersTable, accountMembersTable, userPoolId } = deps;

  async function resolveDisplayNameFromCognito(userId: string, email: string): Promise<string> {
    try {
      const res = await cognito.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
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

  async function handleSetup(auth: { userId: string; email: string }) {
    const { userId, email } = auth;
    const now = new Date().toISOString();

    // Ensure user item exists with M16 profile fields
    const existing = await ddb.send(new GetCommand({ TableName: usersTable, Key: { userId } }));

    if (!existing.Item) {
      // Fetch display name from Cognito given_name/family_name attributes
      const displayName = await resolveDisplayNameFromCognito(userId, email);
      const emailLower = email.toLowerCase();

      await ddb.send(new PutCommand({
        TableName: usersTable,
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

      // Fresh profile bootstrap: no account exists, so accountId is omitted.
      const response: AccountSetupResponse = { userCreated: true, profileComplete: false };
      return ok(response);
    }

    // Existing user — surface a convenience account id only if one exists.
    const membershipsRes = await ddb.send(new QueryCommand({
      TableName: accountMembersTable,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'accountId',
      Limit: 1,
    }));

    const firstAccountId = membershipsRes.Items?.[0]?.['accountId'] as string | undefined;
    const profileComplete = (existing.Item['profileComplete'] as boolean | undefined) ?? false;

    const response: AccountSetupResponse = {
      userCreated: false,
      profileComplete,
      // Omit (rather than send '') when the user has no account — see m16.1.0.
      ...(firstAccountId ? { accountId: firstAccountId } : {}),
    };
    return ok(response);
  }

  return withAuthOnly(async ({ auth, event }) => {
    const resource = (event as APIGatewayProxyEvent).resource ?? '';
    if (resource !== '/auth/setup') {
      throw badRequest(`Unrecognised auth route: ${resource}`);
    }
    return handleSetup(auth);
  });
}

export const handler = createHandler({
  ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  cognito: new CognitoIdentityProviderClient({}),
  usersTable: process.env.USERS_TABLE!,
  accountMembersTable: process.env.ACCOUNT_MEMBERS_TABLE!,
  userPoolId: process.env.USER_POOL_ID!,
});
