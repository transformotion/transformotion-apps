import { randomUUID } from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  ok,
  conflict,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';

const cognito = new CognitoIdentityProviderClient({});
const ddb     = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCOUNTS_TABLE        = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const USER_POOL_ID          = process.env.USER_POOL_ID!;

/**
 * POST /auth/setup — First-login setup.
 *
 * Called by the frontend after Cognito sign-in when custom:active_account is absent.
 * Creates a personal account for the user and sets the Cognito custom attributes so
 * subsequent requests carry the accountId in the JWT.
 *
 * Idempotent: if the JWT already has custom:active_account the existing ID is
 * returned immediately — safe to call on every login and let the frontend decide
 * whether migration is needed.
 */
export const handler = withAuthOnly(async ({ auth, event }) => {
  const { userId, email } = auth;

  // ── Idempotency: already has an account ──────────────────────────────────
  // API Gateway forwards all Cognito claims into requestContext.authorizer.claims.
  // If custom:active_account is present, setup was already completed.
  const claims = (event as APIGatewayProxyEvent).requestContext?.authorizer?.claims as Record<string, string> | undefined;
  const existingAccountId = claims?.['custom:active_account']?.trim();

  if (existingAccountId) {
    return ok({ accountId: existingAccountId, created: false });
  }

  const accountId = randomUUID();
  const now       = new Date().toISOString();

  // ── 1. Write account + membership atomically ──────────────────────────────
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
            // Guard: don't overwrite an existing account (belt-and-suspenders)
            ConditionExpression: 'attribute_not_exists(accountId)',
          },
        },
        {
          Put: {
            TableName: ACCOUNT_MEMBERS_TABLE,
            Item: {
              accountId,
              userId,
              email,       // stored so accounts Lambda can return it without Cognito lookup
              role:     'owner',
              joinedAt: now,
            },
            ConditionExpression: 'attribute_not_exists(accountId)',
          },
        },
      ],
    }));
  } catch (err: unknown) {
    // TransactionCanceledException with ConditionalCheckFailed means another
    // concurrent first-login request already created the account — return conflict
    // so the caller can retry GET /auth/setup to retrieve the ID.
    if (
      err instanceof Error &&
      err.name === 'TransactionCanceledException'
    ) {
      throw conflict('Account creation conflict — retry to retrieve existing account');
    }
    throw err;
  }

  // ── 2. Set Cognito custom attributes ─────────────────────────────────────
  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username:   userId,
    UserAttributes: [
      { Name: 'custom:active_account', Value: accountId },
      { Name: 'custom:accounts',       Value: accountId },
    ],
  }));

  return ok({ accountId, created: true });
});
