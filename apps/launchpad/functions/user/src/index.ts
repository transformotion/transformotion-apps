import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  parseBody,
  ok,
  badRequest,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const USERS_TABLE = process.env.USERS_TABLE!;

interface UserPreferences {
  notificationsEnabled: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  notificationsEnabled: false,
};

async function loadPreferences(userId: string): Promise<UserPreferences> {
  const res = await ddb.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId },
  }));
  const stored = (res.Item?.['preferences'] ?? {}) as Partial<UserPreferences>;
  return { ...DEFAULT_PREFERENCES, ...stored };
}

async function getProfile(userId: string, email: string) {
  const preferences = await loadPreferences(userId);
  return ok({ userId, email, preferences });
}

async function putPreferences(event: APIGatewayProxyEvent, userId: string) {
  const partial = parseBody<Partial<UserPreferences>>(event);
  const existing = await loadPreferences(userId);
  const merged: UserPreferences = { ...existing, ...partial };

  await ddb.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET preferences = :p, updatedAt = :now',
    ExpressionAttributeValues: {
      ':p': merged,
      ':now': new Date().toISOString(),
    },
  }));

  console.log(`[launchpad-user] Preferences saved for ${userId}:`, merged);
  return ok({ preferences: merged });
}

export const handler = withAuthOnly(async ({ auth, event }) => {
  const { userId, email } = auth;
  const resource = (event as APIGatewayProxyEvent).resource ?? '';

  if (resource === '/api/user/profile' && event.httpMethod === 'GET') {
    return getProfile(userId, email);
  }
  if (resource === '/api/user/preferences' && event.httpMethod === 'PUT') {
    return putPreferences(event as APIGatewayProxyEvent, userId);
  }

  throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
});
