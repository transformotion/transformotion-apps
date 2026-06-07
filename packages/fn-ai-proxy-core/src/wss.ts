import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

export interface PushJobCompleteOptions {
  endpoint: string;
  connectionId: string;
  jobId: string;
  client?: ApiGatewayManagementApiClient;
}

export async function pushJobComplete(options: PushJobCompleteOptions): Promise<void> {
  const client = options.client ?? new ApiGatewayManagementApiClient({ endpoint: options.endpoint });

  await client.send(new PostToConnectionCommand({
    ConnectionId: options.connectionId,
    Data: Buffer.from(JSON.stringify({ type: 'job_complete', jobId: options.jobId })),
  }));
}
