import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  getPathParam,
  ok,
  badRequest,
  forbidden,
  notFound,
} from '@transformotion/lambda-middleware';
import { randomUUID } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCOUNTS_TABLE     = process.env.ACCOUNTS_TABLE!;
const INVITATIONS_TABLE  = process.env.INVITATIONS_TABLE!;

/** TTL for an invitation token — 7 days in seconds. */
const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * POST /accounts/{accountId}/invitations
 *
 * Creates an invitation record in platform.invitations-{stage} with a 7-day TTL.
 * The invited user accepts by following the link in the email (Phase 4 — SES).
 *
 * For Phase 2 the invitation is stored but no email is sent yet.
 * Phase 4 will add SES delivery when the notification Lambda is built.
 *
 * Only the account owner can invite new members.
 */
export const handler = withAuth(async ({ auth, account, event }) => {
  const { userId } = auth;
  const accountId  = getPathParam(event, 'accountId');

  // Verify caller is the account owner
  const accountRes = await ddb.send(new GetCommand({
    TableName: ACCOUNTS_TABLE,
    Key:       { accountId },
  }));

  if (!accountRes.Item) throw notFound(`Account '${accountId}' not found`);
  if (accountRes.Item['ownerId'] !== userId) {
    throw forbidden('Only the account owner can send invitations');
  }

  const { email } = parseBody<{ email: string }>(event);
  if (!email?.trim()) throw badRequest('email is required');
  const normalisedEmail = email.trim().toLowerCase();

  const invitationId = randomUUID();
  const now          = new Date().toISOString();
  const expiresAt    = Math.floor(Date.now() / 1000) + INVITATION_TTL_SECONDS;

  await ddb.send(new PutCommand({
    TableName: INVITATIONS_TABLE,
    Item: {
      invitationId,
      accountId,
      email:       normalisedEmail,
      invitedBy:   userId,
      createdAt:   now,
      expiresAt,   // DynamoDB TTL — epoch seconds
      status:      'pending',
    },
  }));

  // TODO Phase 4: send invitation email via SES with acceptance link containing invitationId
  console.log(`[invitations] Invitation ${invitationId} created for ${normalisedEmail} on account ${accountId}`);

  void account;
  return ok({ invitationId });
});
