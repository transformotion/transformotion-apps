import { randomUUID } from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  parseBody,
  ok,
  badRequest,
  forbidden,
  conflict,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';

const cognito = new CognitoIdentityProviderClient({});
const ddb     = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCOUNTS_TABLE        = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const USER_POOL_ID          = process.env.USER_POOL_ID!;

/**
 * Auth setup Lambda — handles two routes:
 *
 *   POST /auth/setup  — First-login: creates personal account + sets Cognito attributes.
 *                       Idempotent if custom:active_account already present.
 *
 *   POST /auth/switch — Switch active account: verifies membership, updates
 *                       custom:active_account so next token refresh reflects the change.
 */
export const handler = withAuthOnly(async ({ auth, event }) => {
  const resource = (event as APIGatewayProxyEvent).resource ?? '';

  if (resource === '/auth/setup')  return handleSetup(auth, event as APIGatewayProxyEvent);
  if (resource === '/auth/switch') return handleSwitch(auth, event as APIGatewayProxyEvent);

  throw badRequest(`Unrecognised auth route: ${resource}`);
});

// ── POST /auth/setup ──────────────────────────────────────────────────────────

async function handleSetup(
  auth: { userId: string; email: string },
  event: APIGatewayProxyEvent,
) {
  const { userId, email } = auth;

  // Idempotency: if custom:active_account is already set, return existing ID.
  // API Gateway forwards all Cognito claims into requestContext.authorizer.claims.
  const claims = event.requestContext?.authorizer?.claims as Record<string, string> | undefined;
  const existingAccountId = claims?.['custom:active_account']?.trim();
  if (existingAccountId) {
    return ok({ accountId: existingAccountId, created: false });
  }

  const accountId = randomUUID();
  const now       = new Date().toISOString();

  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: ACCOUNTS_TABLE,
            Item: {
              accountId,
              name:      `${email}'s account`,
              ownerId:   userId,
              plan:      'free',
              createdAt: now,
              updatedAt: now,
            },
            ConditionExpression: 'attribute_not_exists(accountId)',
          },
        },
        {
          Put: {
            TableName: ACCOUNT_MEMBERS_TABLE,
            Item: {
              accountId,
              userId,
              email,
              role:     'owner',
              joinedAt: now,
            },
            ConditionExpression: 'attribute_not_exists(accountId)',
          },
        },
      ],
    }));
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TransactionCanceledException') {
      throw conflict('Account creation conflict — retry to retrieve existing account');
    }
    throw err;
  }

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username:   userId,
    UserAttributes: [
      { Name: 'custom:active_account', Value: accountId },
      { Name: 'custom:accounts',       Value: accountId },
    ],
  }));

  return ok({ accountId, created: true });
}

// ── POST /auth/switch ─────────────────────────────────────────────────────────

async function handleSwitch(
  auth: { userId: string },
  event: APIGatewayProxyEvent,
) {
  const { userId } = auth;
  const { accountId } = parseBody<{ accountId: string }>(event);
  if (!accountId?.trim()) throw badRequest('accountId is required');

  // Verify the user is a member of the target account
  const res = await ddb.send(new QueryCommand({
    TableName:              ACCOUNT_MEMBERS_TABLE,
    KeyConditionExpression: 'accountId = :aid AND userId = :uid',
    ExpressionAttributeValues: { ':aid': accountId.trim(), ':uid': userId },
    Limit: 1,
  }));

  if (!res.Items?.length) {
    throw forbidden('You are not a member of that account');
  }

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username:   userId,
    UserAttributes: [
      { Name: 'custom:active_account', Value: accountId.trim() },
    ],
  }));

  return ok({ accountId: accountId.trim() });
}
