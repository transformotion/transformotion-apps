import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CONNECTIONS_TABLE!;

interface ConnectEvent {
  requestContext: {
    connectionId: string;
    authorizer?: {
      userId?: string;
      accountId?: string;
      app?: string;
    };
  };
}

export const handler = async (event: ConnectEvent): Promise<{ statusCode: number }> => {
  const { connectionId, authorizer } = event.requestContext;
  const userId    = authorizer?.userId ?? 'unknown';
  const accountId = authorizer?.accountId ?? '';
  const app       = authorizer?.app ?? '';
  const now       = Math.floor(Date.now() / 1000);

  console.log(`[ai-ws-connect] connectionId=${connectionId} userId=${userId} accountId=${accountId} app=${app}`);

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      connectionId,
      userId,
      accountId,
      app,
      createdAt: new Date().toISOString(),
      expiresAt: now + 3600,
    },
  }));

  // Client will send {"action":"init"} after connect; $default handler responds with { type: 'connected', connectionId }
  return { statusCode: 200 };
};
