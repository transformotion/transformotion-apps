import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ok, parseBody } from '@transformotion/lambda-middleware';
import type { AuthClaims } from '@transformotion/lambda-middleware';
import type { Category } from '@transformotion/budget-domain';
import type { ReviewWorkerPayload } from './review-worker';

const ddb          = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambdaClient = new LambdaClient({});

const JOBS_TABLE  = process.env.AI_JOBS_TABLE!;
const CONN_TABLE  = process.env.WS_CONNECTIONS_TABLE!;
const SELF_FN     = process.env.AWS_LAMBDA_FUNCTION_NAME!;

export async function reviewStart(
  auth: AuthClaims,
  accountId: string,
  event: Parameters<typeof parseBody>[0],
): Promise<ReturnType<typeof ok>> {
  // Authorization is performed by the handler entry gate (btData.write, D9
  // member-tier). Reaching here means the caller is an active non-viewer member.

  const { transactions, categories, settings, forceFullSearch } = parseBody<{
    transactions: Array<{ index: number; description: string; amount: string }>;
    categories: Category[];
    settings?: { batchSize?: number; parallelLimit?: number; confidenceThreshold?: 'low' | 'medium' | 'high' };
    forceFullSearch?: boolean;
  }>(event);

  // Resolve connectionId from the connections table by userId (most recent active connection)
  const connQuery = await ddb.send(new QueryCommand({
    TableName: CONN_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': auth.userId },
    ScanIndexForward: false,
    Limit: 1,
  }));
  if (!connQuery.Items || connQuery.Items.length === 0) {
    throw { statusCode: 400, message: 'No active WebSocket connection found. Open the Review tab and try again.' };
  }
  const connectionId = connQuery.Items[0]['connectionId'] as string;

  const jobId    = crypto.randomUUID();
  const now      = Math.floor(Date.now() / 1000);
  const expiresAt = now + 86400; // 24h TTL

  await ddb.send(new PutCommand({
    TableName: JOBS_TABLE,
    Item: {
      jobId,
      userId:    auth.userId,
      accountId,
      status:    'pending',
      createdAt: new Date().toISOString(),
      expiresAt,
    },
  }));

  const batchSize            = Math.min(Math.max(settings?.batchSize ?? 5, 1), 20);
  const parallelLimit        = Math.min(Math.max(settings?.parallelLimit ?? 4, 1), 10);
  const confidenceThreshold  = settings?.confidenceThreshold ?? 'low';

  const workerPayload: ReviewWorkerPayload = {
    __asyncJob: 'review-worker',
    jobId,
    userId: auth.userId,
    accountId,
    connectionId,
    transactions,
    categories,
    batchSize,
    parallelLimit,
    confidenceThreshold,
    forceFullSearch: forceFullSearch === true,
    auth,
  };

  // Dispatch worker asynchronously — fire and forget
  await lambdaClient.send(new InvokeCommand({
    FunctionName:   SELF_FN,
    InvocationType: 'Event',
    Payload:        Buffer.from(JSON.stringify(workerPayload)),
  }));

  return ok({ jobId });
}
