import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { AuthClaims } from '@transformotion/lambda-middleware';

const lambdaClient = new LambdaClient({});
const PROXY_FN     = process.env.CLAUDE_PROXY_FUNCTION_NAME!;

export async function invokeProxy(
  auth: AuthClaims,
  accountId: string,
  body: object,
): Promise<Record<string, unknown>> {
  const fakeEvent = {
    httpMethod: 'POST',
    path: '/api/claude',
    headers: { 'x-account-id': accountId },
    queryStringParameters: null,
    pathParameters: null,
    requestContext: {
      authorizer: {
        claims: {
          sub:              auth.userId,
          email:            auth.email,
          'cognito:groups': auth.groups.join(' '),
          apps:             JSON.stringify(auth.apps),
          accounts:         JSON.stringify(auth.accounts),
          site_admin:       String(auth.siteAdmin),
        },
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };

  const result = await lambdaClient.send(new InvokeCommand({
    FunctionName: PROXY_FN,
    Payload:      Buffer.from(JSON.stringify(fakeEvent)),
  }));

  const response = JSON.parse(Buffer.from(result.Payload!).toString()) as {
    statusCode: number;
    body: string;
  };

  if (response.statusCode !== 200) {
    const err = JSON.parse(response.body || '{}');
    throw { statusCode: response.statusCode, message: err.error ?? 'Claude proxy error' };
  }

  return JSON.parse(response.body) as Record<string, unknown>;
}
