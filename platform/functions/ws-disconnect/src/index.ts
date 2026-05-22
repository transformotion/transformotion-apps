import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CONNECTIONS_TABLE!;

interface DisconnectEvent {
  requestContext: {
    connectionId: string;
  };
}

export const handler = async (event: DisconnectEvent): Promise<{ statusCode: number }> => {
  const { connectionId } = event.requestContext;

  console.log(`[ai-ws-disconnect] connectionId=${connectionId}`);

  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { connectionId },
    }));
  } catch (err) {
    // Best-effort — connection may have already been cleaned up by TTL
    console.warn(`[ai-ws-disconnect] delete failed (may be already gone): ${(err as Error).message}`);
  }

  return { statusCode: 200 };
};
