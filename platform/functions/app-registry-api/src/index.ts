import type { APIGatewayProxyHandler } from 'aws-lambda';

// Registry JSON loaded from env var — set by CDK from platform/config/app-registry.json at synth time
const REGISTRY_JSON = process.env.APP_REGISTRY!;

// The Cognito authoriser on this route validates the JWT before the Lambda runs.
// No additional auth check is needed — any authenticated user can query the registry.
export const handler: APIGatewayProxyHandler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: REGISTRY_JSON,
});
