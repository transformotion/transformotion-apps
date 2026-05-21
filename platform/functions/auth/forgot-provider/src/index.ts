/**
 * Lambda: forgot-provider
 * POST /auth/lookup-provider — public endpoint, no JWT required.
 *
 * Given an email address, looks up the user's Cognito sign-in method and
 * sends a hint email via SES. Rate-limited to 5 requests per IP per 15 min.
 * Always returns 200 with a generic message to prevent user enumeration.
 *
 * Prerequisites:
 *   - SES must have the FROM_EMAIL address/domain verified
 *   - In SES sandbox mode, the recipient must also be a verified address
 *   - Request production SES access to send to any email
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ddb     = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});
const ses     = new SESv2Client({});

const TABLE        = process.env.RATE_LIMIT_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const FROM_EMAIL   = process.env.FROM_EMAIL!;
const APP_URL      = process.env.APP_URL ?? 'https://dev.apps.transformotion.com.au';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GENERIC_OK = {
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify({ message: "If we found an account with that email, we've sent you a hint." }),
};

type APIEvent = {
  body?: string | null;
  headers?: Record<string, string>;
  requestContext?: { identity?: { sourceIp?: string }; http?: { sourceIp?: string } };
};

export async function handler(event: APIEvent): Promise<typeof GENERIC_OK> {
  // ── Parse request ────────────────────────────────────────────────────────
  let email: string;
  try {
    const parsed = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    email = typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return GENERIC_OK;
  } catch {
    return GENERIC_OK;
  }

  // ── Rate limit (5 req / IP / 15 min) ────────────────────────────────────
  const ip  = event.requestContext?.http?.sourceIp
           ?? event.requestContext?.identity?.sourceIp
           ?? 'unknown';
  const pk  = `lookup-provider#${ip}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = await ddb.send(new GetItemCommand({
      TableName: TABLE,
      Key: { pk: { S: pk } },
    }));

    const item    = existing.Item;
    const count   = item ? parseInt(item.count?.N ?? '0', 10) : 0;
    const itemTtl = item ? parseInt(item.ttl?.N   ?? '0', 10) : 0;
    const windowActive = item && itemTtl > now;

    if (windowActive && count >= 5) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ message: 'Too many requests. Please try again in 15 minutes.' }),
      };
    }

    await ddb.send(new PutItemCommand({
      TableName: TABLE,
      Item: {
        pk:    { S: pk },
        count: { N: String(windowActive ? count + 1 : 1) },
        ttl:   { N: String(windowActive ? itemTtl : now + 900) },
      },
    }));
  } catch (err) {
    console.error('rate-limit-error', err);
    // Fail open — proceed even if DynamoDB is unavailable
  }

  // ── Audit log (IP only — no PII) ─────────────────────────────────────────
  console.log(JSON.stringify({ event: 'lookup-provider', ip, ts: new Date().toISOString() }));

  // ── Look up Cognito user ─────────────────────────────────────────────────
  let providerHint: string;
  try {
    const user = await cognito.send(new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username:   email,
    }));

    const identitiesAttr = user.UserAttributes?.find(a => a.Name === 'identities')?.Value;
    if (identitiesAttr) {
      const identities = JSON.parse(identitiesAttr) as Array<{ providerName: string }>;
      const primary = identities[0]?.providerName ?? '';
      const MAP: Record<string, string> = {
        Google:          'Google',
        Facebook:        'Facebook',
        Microsoft:       'Microsoft',
        SignInWithApple: 'Apple',
      };
      providerHint = MAP[primary] ?? primary;
    } else {
      providerHint = 'email and password';
    }
  } catch {
    // User not found or Cognito error — return generic without sending email
    return GENERIC_OK;
  }

  // ── Send hint email via SES ──────────────────────────────────────────────
  try {
    const isPasswordUser = providerHint === 'email and password';
    const hintText = isPasswordUser ? 'your email and password' : providerHint;
    const ctaLabel = isPasswordUser ? 'Sign in' : `Continue with ${providerHint}`;

    await ses.send(new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: {
            Data:    'Your Transformotion Apps sign-in method',
            Charset: 'UTF-8',
          },
          Body: {
            Html: { Data: buildHtml(hintText, ctaLabel, APP_URL), Charset: 'UTF-8' },
            Text: {
              Data:    `You signed in to Transformotion Apps using ${hintText}. Visit ${APP_URL}/auth to sign in.`,
              Charset: 'UTF-8',
            },
          },
        },
      },
    }));
  } catch (err) {
    console.error('ses-send-error', err);
    // Swallow — still return generic success
  }

  return GENERIC_OK;
}

function buildHtml(hintText: string, ctaLabel: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1B2A">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B2A;min-height:100vh">
  <tr><td align="center" style="padding:48px 16px">
    <table cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
      <tr><td style="padding-bottom:28px;text-align:center">
        <span style="font-family:'Helvetica Neue',sans-serif;font-size:26px;font-weight:900;letter-spacing:4px;color:#fff">T</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#fff">RANSFOR</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#00C4B3">M</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#E8A838">O</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#00C4B3">TION</span>
      </td></tr>
      <tr><td style="background:#112538;border:1px solid #1A3550;border-radius:16px;padding:32px">
        <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#fff;font-family:sans-serif">Your sign-in method</p>
        <p style="margin:0 0 24px;font-size:14px;color:#7BAAC8;font-family:sans-serif">You asked how you sign in to Transformotion Apps.</p>
        <div style="background:#091523;border:1px solid #1A3550;border-radius:10px;padding:16px 20px;margin-bottom:28px">
          <p style="margin:0 0 4px;font-size:12px;font-family:sans-serif;color:#7BAAC8;text-transform:uppercase;letter-spacing:1px">You signed in using</p>
          <p style="margin:0;font-size:17px;font-weight:600;color:#00C4B3;font-family:sans-serif">${hintText}</p>
        </div>
        <a href="${appUrl}/auth" style="display:inline-block;background:#00C4B3;color:#0D1B2A;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:sans-serif">${ctaLabel} &rarr;</a>
      </td></tr>
      <tr><td style="padding-top:20px;text-align:center">
        <p style="margin:0;font-size:12px;color:#7BAAC8;font-family:sans-serif">If you didn't request this, you can safely ignore it.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
