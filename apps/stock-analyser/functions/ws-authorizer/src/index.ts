import * as jose from 'jose';

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const REGION       = process.env.AWS_REGION ?? 'ap-southeast-2';
const APP_NAME     = process.env.APP_NAME ?? 'stock-analyser';

const JWKS_URL = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
const ISSUER   = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;

const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL));

interface WsAuthorizerEvent {
  type: 'REQUEST';
  methodArn: string;
  requestContext: {
    stage: string;
    apiId: string;
    routeKey: string;
  };
  queryStringParameters?: Record<string, string | undefined>;
}

interface AuthorizerResult {
  principalId: string;
  policyDocument: {
    Version: '2012-10-17';
    Statement: Array<{
      Action: string;
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }>;
  };
  context?: Record<string, string>;
}

function makePolicy(effect: 'Allow' | 'Deny', resource: string, principalId: string, context?: Record<string, string>): AuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
    },
    ...(context ? { context } : {}),
  };
}

export const handler = async (event: WsAuthorizerEvent): Promise<AuthorizerResult> => {
  const token        = event.queryStringParameters?.token;
  const accountId    = event.queryStringParameters?.accountId;
  const requestedApp = event.queryStringParameters?.app ?? APP_NAME;

  if (!token) {
    console.log('[sa-ws-authorizer] rejected: no token in query string');
    return makePolicy('Deny', event.methodArn, 'anonymous');
  }

  if (requestedApp !== APP_NAME) {
    console.log(`[sa-ws-authorizer] rejected: app '${requestedApp}' is not '${APP_NAME}'`);
    return makePolicy('Deny', event.methodArn, 'anonymous');
  }

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, { issuer: ISSUER });

    const userId      = payload.sub as string;
    const accountsRaw = JSON.parse((payload['accounts'] as string | undefined) ?? '{}') as
      Record<string, Array<{ accountId: string; role: string }>>;
    const appAccountIds = (accountsRaw[APP_NAME] ?? []).map(a => a.accountId);

    if (accountId && !appAccountIds.includes(accountId)) {
      console.log(`[sa-ws-authorizer] rejected: accountId ${accountId} not in user's ${APP_NAME} accounts`);
      return makePolicy('Deny', event.methodArn, userId);
    }

    console.log(`[sa-ws-authorizer] allowed: userId=${userId} accountId=${accountId ?? 'none'}`);
    return makePolicy('Allow', event.methodArn, userId, {
      userId,
      accountId: accountId ?? '',
      app:       APP_NAME,
    });
  } catch (err) {
    console.log('[sa-ws-authorizer] rejected: token verification failed:', (err as Error).message);
    return makePolicy('Deny', event.methodArn, 'anonymous');
  }
};
