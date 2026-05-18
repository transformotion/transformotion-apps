interface DefaultEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
  };
  body?: string;
}

export const handler = async (event: DefaultEvent): Promise<{ statusCode: number }> => {
  const { connectionId, routeKey } = event.requestContext;

  console.log(`[ai-ws-default] connectionId=${connectionId} routeKey=${routeKey}`);

  if (event.body) {
    try {
      const message = JSON.parse(event.body) as unknown;
      console.log(`[ai-ws-default] message received:`, JSON.stringify(message));
    } catch {
      console.log(`[ai-ws-default] raw body:`, event.body);
    }
  }

  // PR 4 will use this route for client-initiated actions (e.g. cancellation)
  return { statusCode: 200 };
};
