import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  parseBody,
  ok,
  badRequest,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';

const ddb        = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const USERS_TABLE = process.env.USERS_TABLE!;

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserPreferences {
  notificationsEnabled: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  notificationsEnabled: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadPreferences(userId: string): Promise<UserPreferences> {
  const res = await ddb.send(new GetCommand({
    TableName: USERS_TABLE,
    Key:       { userId },
  }));
  const stored = (res.Item?.['preferences'] ?? {}) as Partial<UserPreferences>;
  return { ...DEFAULT_PREFERENCES, ...stored };
}

// ── GET /api/user/profile ─────────────────────────────────────────────────────

async function getProfile(userId: string, email: string) {
  const preferences = await loadPreferences(userId);
  return ok({ userId, email, preferences });
}

// ── PUT /api/user/preferences ─────────────────────────────────────────────────

async function putPreferences(
  event: APIGatewayProxyEvent,
  userId: string,
) {
  const partial = parseBody<Partial<UserPreferences>>(event);

  // Merge with existing so a partial update never loses other fields
  const existing = await loadPreferences(userId);
  const merged: UserPreferences = { ...existing, ...partial };

  await ddb.send(new UpdateCommand({
    TableName:                 USERS_TABLE,
    Key:                       { userId },
    UpdateExpression:          'SET preferences = :p, updatedAt = :now',
    ExpressionAttributeValues: {
      ':p':   merged,
      ':now': new Date().toISOString(),
    },
  }));

  console.log(`[user] Preferences saved for ${userId}:`, merged);
  return ok({ preferences: merged });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = withAuthOnly(async ({ auth, event }) => {
  const { userId, email } = auth;
  const resource = (event as APIGatewayProxyEvent).resource ?? '';

  if (resource === '/api/user/profile'     && event.httpMethod === 'GET')  return getProfile(userId, email);
  if (resource === '/api/user/preferences' && event.httpMethod === 'PUT')  return putPreferences(event as APIGatewayProxyEvent, userId);

  throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
});
