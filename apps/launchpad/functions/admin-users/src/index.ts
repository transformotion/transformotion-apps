import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUserGlobalSignOutCommand,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  withAuthOnly,
  parseBody,
  getPathParam,
  ok,
  badRequest,
  forbidden,
  HttpError,
} from '@transformotion/lambda-middleware';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

const USERS_TABLE = process.env.USERS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

/**
 * Launchpad Admin — User Lifecycle (M11 Users & Access)
 * =====================================================
 * `PUT /api/admin/users/{userId}/status` — site-admin supervisory disable /
 * enable. This is the live backend for the v0 Users & Access view's
 * disable/enable controls.
 *
 * Authority is verified LIVE (AdminListGroupsForUser), NOT from the caller's
 * token: disabling a user is a sensitive mutation and must not trust a stale
 * `site-admin` claim — mirrors the `accounts` handler's supervisory pattern.
 *
 * Disable is fail-closed ordered: Cognito disable FIRST (blocks new sign-in),
 * then persist `status=disabled`, then GlobalSignOut to drop existing sessions
 * (a sign-out failure is surfaced as 502, never a silent success). Enable
 * reverses the Cognito + persisted state.
 */

/** Live `site-admin` group check for the requester (fail closed on error). */
async function requesterIsSiteAdmin(userId: string): Promise<boolean> {
  const res = await cognito.send(new AdminListGroupsForUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: userId,
  }));
  return (res.Groups ?? []).some((g) => g.GroupName === 'site-admin');
}

async function setUserStatus(userId: string, status: 'active' | 'disabled') {
  const now = new Date().toISOString();
  await ddb.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET #s = :s, updatedAt = :n',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':n': now },
  }));
}

export const handler = withAuthOnly(async ({ auth, event }) => {
  const requesterId = auth.userId;
  const targetUserId = getPathParam(event, 'userId');

  const { status } = parseBody<{ status?: string }>(event);
  if (status !== 'active' && status !== 'disabled') {
    throw badRequest("status must be 'active' or 'disabled'");
  }

  // Supervisory authority — verified LIVE, not from the token. A loader/Cognito
  // error propagates and fails the request closed.
  if (!(await requesterIsSiteAdmin(requesterId))) {
    throw forbidden('Disabling or enabling a user is a site-admin supervisory action.');
  }
  if (requesterId === targetUserId) {
    throw forbidden('You cannot change your own account status.');
  }

  if (status === 'disabled') {
    // Cognito disable FIRST (blocks new sign-in), then persist, then terminate
    // existing sessions.
    await cognito.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: targetUserId }));
    await setUserStatus(targetUserId, 'disabled');
    try {
      await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: USER_POOL_ID, Username: targetUserId }));
    } catch (err) {
      console.error('[admin-users] GlobalSignOut failed after disable:', err);
      throw new HttpError(502, 'User disabled, but session termination failed — retry to complete sign-out (the user\'s existing session may persist until token expiry).');
    }
  } else {
    await cognito.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: targetUserId }));
    await setUserStatus(targetUserId, 'active');
  }

  console.log(`[admin-users] ${requesterId} set ${targetUserId} status=${status}`);
  return ok({ userId: targetUserId, status });
});
