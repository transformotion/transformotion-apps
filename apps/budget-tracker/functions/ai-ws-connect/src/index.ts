import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CONNECTIONS_TABLE!;

interface ConnectEvent {
  requestContext: {
    connectionId: string;
    stage: string;
    domainName: string;
    authorizer?: {
      userId?: string;
      accountId?: string;
    };
  };
}

export const handler = async (event: ConnectEvent): Promise<{ statusCode: number }> => {
  const { connectionId, stage, domainName, authorizer } = event.requestContext;
  const userId    = authorizer?.userId ?? 'unknown';
  const accountId = authorizer?.accountId ?? '';
  const now       = Math.floor(Date.now() / 1000);

  console.log(`[ai-ws-connect] connectionId=${connectionId} userId=${userId} accountId=${accountId}`);

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      connectionId,
      userId,
      accountId,
      createdAt: new Date().toISOString(),
      expiresAt: now + 3600,
    },
  }));

  // Push connectionId back to the client immediately after connect
  const mgmt = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    await mgmt.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify({ type: 'connected', connectionId })),
    }));
  } catch (err) {
    console.warn(`[ai-ws-connect] failed to push connected message: ${(err as Error).message}`);
  }

  return { statusCode: 200 };
};
