/**
 * B2 — Dev persona token-mint endpoint (STAGE-GUARDED, dev-only).
 *
 * Mints a REAL Cognito session for a seeded dev persona (B1) so the redemption /
 * admin flows can be exercised as different personas without a manual login.
 * Mechanism (a): AdminInitiateAuth (ADMIN_USER_PASSWORD_AUTH) using the
 * per-persona password stored in Secrets Manager at B1 provisioning.
 *
 * THREE GUARDS (defence in depth):
 *   1. STACK-LEVEL — the Lambda + route are only synthesized when stage==='dev'
 *      (LaunchpadControlPlaneStack), so this endpoint DOES NOT EXIST in prod.
 *   2. RUNTIME     — returns 404 unless STAGE==='dev'.
 *   3. ALLOW-LIST  — only the fixed mintable persona set is accepted; arbitrary
 *      ids are rejected. `leo` is excluded (disabled user — cannot authenticate).
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const STAGE = process.env.STAGE ?? '';
const USER_POOL_ID = process.env.USER_POOL_ID ?? '';
const CLIENT_ID = process.env.LAUNCHPAD_CLIENT_ID ?? '';

const cognito = new CognitoIdentityProviderClient({});
const secrets = new SecretsManagerClient({});

// GUARD 3 — allow-list. Mintable dev personas only (leo is disabled → excluded).
const PERSONA_EMAIL: Record<string, string> = {
  steve: 'steve@example.com',
  ava: 'ava.chen@example.com',
  noah: 'noah.patel@example.com',
  mara: 'mara.silva@example.com',
  priya: 'priya.nair@example.com',
  marcus: 'marcus.webb@example.com',
  jordan: 'jordan.diaz@example.com',
};

function resp(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // GUARD 2 — runtime stage check. Belt to the stack-level brace.
  if (STAGE !== 'dev') return resp(404, { error: 'Not found' });

  let personaId = '';
  try { personaId = String(JSON.parse(event.body || '{}').personaId ?? ''); } catch { /* invalid body */ }

  // GUARD 3 — allow-list.
  const email = PERSONA_EMAIL[personaId];
  if (!email) return resp(403, { error: `Unknown or non-mintable persona '${personaId}'.` });

  let password: string | undefined;
  try {
    const sv = await secrets.send(new GetSecretValueCommand({
      SecretId: `/launchpad/${STAGE}/personas/${personaId}/password`,
    }));
    password = sv.SecretString;
  } catch {
    return resp(500, { error: 'Persona password secret not found — run the B1 seed.' });
  }
  if (!password) return resp(500, { error: 'Empty persona password secret.' });

  try {
    const auth = await cognito.send(new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));
    const r = auth.AuthenticationResult;
    if (!r) return resp(502, { error: 'No authentication result (unexpected challenge).' });
    return resp(200, {
      personaId,
      email,
      idToken: r.IdToken,
      accessToken: r.AccessToken,
      refreshToken: r.RefreshToken,
      expiresIn: r.ExpiresIn,
    });
  } catch (err) {
    return resp(502, { error: `Mint failed: ${(err as { name?: string }).name ?? 'error'}` });
  }
};
