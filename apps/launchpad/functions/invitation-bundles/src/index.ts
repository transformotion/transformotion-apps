import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuthOnly,
  parseBody,
  ok,
  badRequest,
  type APIGatewayProxyEvent,
  type AuthClaims,
} from '@transformotion/lambda-middleware';
import {
  appAdminGroup,
  APP_GROUP_PREFIX,
  type AccountRole,
  type EntitledAppSlug,
} from '@transformotion/contracts/_shared/auth';
import type {
  CreateInvitationBundleResponse,
  GrantAuthorizationDecision,
  InvitationBundle,
  InvitationGrant,
} from '@transformotion/contracts/launchpad/invitations';
import { randomUUID } from 'crypto';

// M11 Chunk 3 — invitation-bundle CREATION (POST /api/invitations/bundles).
// The composer's real backend. Two grant kinds (m16.5.0): account-invite + app-grant
// (app-provision retired). Each grant is authorized INDEPENDENTLY by the SENDER's
// authority (site-admin OR app-admin for the grant's app — `canCreateInvitationGrant`),
// the same-app conflict is enforced server-side, and the persisted bundle is the shape
// the A5 redeem handler reads. Email delivery is the separate SES seam.

interface GrantInput {
  kind?: string;
  appSlug?: string;
  accountId?: string;
  role?: string;
}

const ENTITLED_APP_SLUGS = new Set(Object.keys(APP_GROUP_PREFIX));
const BUNDLE_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface BundleCreationDeps {
  ddb: DynamoDBDocumentClient;
  invitationsTable: string;
  accountsTable: string;
}

export function createHandler(deps: BundleCreationDeps) {
  // SENDER authorization: may this caller grant access to `appSlug`? Site-admin can
  // grant for any app; an app-admin only for the apps they administer. Groups-
  // authoritative (token cognito:groups), never a claim.
  function senderCanGrant(auth: AuthClaims, appSlug: string): boolean {
    return auth.groups.includes('site-admin')
      || auth.groups.includes(appAdminGroup(appSlug as EntitledAppSlug));
  }

  async function createBundle(auth: AuthClaims, event: APIGatewayProxyEvent) {
    const { email, grants } = parseBody<{ email?: string; grants?: GrantInput[] }>(event);
    if (!email?.trim()) throw badRequest('email is required');
    if (!Array.isArray(grants) || grants.length === 0) throw badRequest('at least one grant is required');
    const inviteeEmail = email.trim().toLowerCase();

    // Same-app conflict: an app-grant (access only) and an account-invite (join an
    // account) for the SAME app in one bundle are contradictory — block both.
    const kindsByApp = new Map<string, Set<string>>();
    for (const g of grants) {
      if (!g.appSlug || !g.kind) continue;
      if (!kindsByApp.has(g.appSlug)) kindsByApp.set(g.appSlug, new Set());
      kindsByApp.get(g.appSlug)!.add(g.kind);
    }
    const conflictedApps = new Set(
      [...kindsByApp].filter(([, kinds]) => kinds.has('app-grant') && kinds.has('account-invite')).map(([app]) => app),
    );

    const decisions: GrantAuthorizationDecision[] = [];
    const authorized: InvitationGrant[] = [];

    for (let index = 0; index < grants.length; index++) {
      const g = grants[index];
      const appSlug = g.appSlug ?? '';

      if (!ENTITLED_APP_SLUGS.has(appSlug)) {
        decisions.push({ index, allowed: false, reason: `Unknown app '${appSlug}'.` });
        continue;
      }
      if (!senderCanGrant(auth, appSlug)) {
        decisions.push({ index, allowed: false, reason: `You are not authorized to grant access to ${appSlug}.` });
        continue;
      }
      if (conflictedApps.has(appSlug)) {
        decisions.push({ index, allowed: false, reason: `Conflicting grants for ${appSlug}: an app-access grant and an account invite cannot be combined.` });
        continue;
      }

      if (g.kind === 'account-invite') {
        if (!g.accountId || !g.role) {
          decisions.push({ index, allowed: false, reason: 'An account invite requires an account and a role.' });
          continue;
        }
        const acct = await deps.ddb.send(new GetCommand({ TableName: deps.accountsTable, Key: { accountId: g.accountId } }));
        const account = acct.Item as { appSlug?: string } | undefined;
        if (!account) {
          decisions.push({ index, allowed: false, reason: 'That account no longer exists.' });
          continue;
        }
        if (account.appSlug && account.appSlug !== appSlug) {
          decisions.push({ index, allowed: false, reason: 'That account belongs to a different app.' });
          continue;
        }
        authorized.push({ grantId: randomUUID(), kind: 'account-invite', appSlug: appSlug as EntitledAppSlug, accountId: g.accountId, role: g.role as AccountRole });
        decisions.push({ index, allowed: true, reason: 'Authorized.' });
      } else if (g.kind === 'app-grant') {
        // Roleless, account-less: person + app only.
        authorized.push({ grantId: randomUUID(), kind: 'app-grant', appSlug: appSlug as EntitledAppSlug });
        decisions.push({ index, allowed: true, reason: 'Authorized.' });
      } else {
        decisions.push({ index, allowed: false, reason: `Unsupported grant kind '${g.kind ?? ''}'.` });
      }
    }

    // Fail closed: persist nothing if no grant was authorized (partial acceptance
    // otherwise — the bundle holds only the authorized grants).
    if (authorized.length === 0) {
      const response: CreateInvitationBundleResponse = { decisions };
      return ok(response);
    }

    const bundleId = randomUUID();
    const now = new Date().toISOString();
    const expiresAt = Math.floor(Date.now() / 1000) + BUNDLE_TTL_SECONDS;
    const bundle: InvitationBundle = {
      bundleId,
      email: inviteeEmail,
      invitedBy: auth.userId,
      createdAt: now,
      expiresAt,
      status: 'pending',
      grants: authorized,
    };

    // Persist in the shape the A5 redeem handler reads (PK invitationId = bundleId).
    await deps.ddb.send(new PutCommand({
      TableName: deps.invitationsTable,
      Item: { invitationId: bundleId, ...bundle },
    }));

    const response: CreateInvitationBundleResponse = { bundle, decisions };
    return ok(response);
  }

  return withAuthOnly(async ({ auth, event }) => {
    const resource = (event as APIGatewayProxyEvent).resource ?? '';
    if (resource === '/api/invitations/bundles' && event.httpMethod === 'POST') {
      return createBundle(auth, event as APIGatewayProxyEvent);
    }
    throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
  });
}

export const handler = createHandler({
  ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  invitationsTable: process.env.INVITATIONS_TABLE!,
  accountsTable: process.env.ACCOUNTS_TABLE!,
});
