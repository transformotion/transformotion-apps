import { randomUUID } from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  ok,
  badRequest,
  conflict,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

const APP_CLIENT_TO_SLUG: Record<string, string> = Object.fromEntries(
  (process.env.APP_SLUGS ?? '').split(',').filter(Boolean).map(slug => [
    process.env[`APP_CLIENT_${slug.toUpperCase().replace(/-/g, '_')}`]!,
    slug,
  ]),
);

export const handler = withAuthOnly(async ({ auth, event }) => {
  const resource = (event as APIGatewayProxyEvent).resource ?? '';

  if (resource === '/auth/setup') {
    return handleSetup(auth, event as APIGatewayProxyEvent);
  }

  throw badRequest(`Unrecognised auth route: ${resource}`);
});

async function handleSetup(
  auth: { userId: string; email: string },
  event: APIGatewayProxyEvent,
) {
  const { userId, email } = auth;

  const claims = event.requestContext?.authorizer?.claims as Record<string, string> | undefined;
  const existingAccountId = claims?.['custom:active_account']?.trim() ?? firstAccountIdFromClaims(claims);
  if (existingAccountId) {
    return ok({ accountId: existingAccountId, created: false });
  }

  const aud = claims?.aud;
  if (!aud) {
    throw badRequest('Missing aud claim - token must be issued by a known App Client');
  }

  const appSlug = APP_CLIENT_TO_SLUG[aud];
  if (!appSlug) {
    throw new Error(`Unknown App Client ID in aud claim: ${aud}`);
  }

  const accountId = randomUUID();
  const now = new Date().toISOString();

  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: ACCOUNTS_TABLE,
            Item: {
              accountId,
              appSlug,
              name: `${email}'s account`,
              ownerId: userId,
              plan: 'free',
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
              role: 'owner',
              joinedAt: now,
            },
            ConditionExpression: 'attribute_not_exists(accountId)',
          },
        },
      ],
    }));
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TransactionCanceledException') {
      throw conflict('Account creation conflict - retry to retrieve existing account');
    }
    throw err;
  }

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username: userId,
    UserAttributes: [
      { Name: 'custom:active_account', Value: accountId },
      { Name: 'custom:accounts', Value: accountId },
    ],
  }));

  return ok({ accountId, created: true });
}

function firstAccountIdFromClaims(claims: Record<string, string> | undefined): string | undefined {
  const raw = claims?.accounts;
  if (!raw) return undefined;

  try {
    const accounts = JSON.parse(raw) as Record<string, Array<{ accountId?: string }>>;
    for (const memberships of Object.values(accounts)) {
      const accountId = memberships.find(m => m.accountId?.trim())?.accountId?.trim();
      if (accountId) return accountId;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
