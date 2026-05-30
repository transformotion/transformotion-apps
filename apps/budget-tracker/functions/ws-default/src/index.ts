import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

interface DefaultEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    stage: string;
    domainName: string;
  };
  body?: string;
}

export const handler = async (event: DefaultEvent): Promise<{ statusCode: number }> => {
  const { connectionId, routeKey, stage, domainName } = event.requestContext;

  console.log(`[bt-ws-default] connectionId=${connectionId} routeKey=${routeKey}`);

  let action: string | undefined;
  try {
    if (event.body) action = (JSON.parse(event.body) as { action?: string }).action;
  } catch { /* ignore malformed body */ }

  if (action === 'init') {
    const mgmt = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`,
    });
    try {
      await mgmt.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data:         Buffer.from(JSON.stringify({ type: 'connected', connectionId })),
      }));
      console.log(`[bt-ws-default] sent connected message to ${connectionId}`);
    } catch (err) {
      console.warn(`[bt-ws-default] failed to push connected message: ${(err as Error).message}`);
    }
  }

  return { statusCode: 200 };
};
