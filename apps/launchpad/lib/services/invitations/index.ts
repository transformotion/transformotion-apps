import { controlPlaneUrl } from '@/lib/services/control-plane';

/** A grant the composer submits (server assigns grantId). Two kinds (m16.5.0). */
export type ComposeGrant =
  | { kind: 'app-grant'; appSlug: string }
  | { kind: 'account-invite'; appSlug: string; accountId: string; role: string };

export interface GrantAuthorizationDecision {
  index: number;
  allowed: boolean;
  reason: string;
}

export interface InvitationBundleSummary {
  bundleId: string;
  email: string;
  status: string;
  grants: Array<{ grantId: string; kind: string; appSlug: string }>;
}

export interface CreateBundleResult {
  bundle?: InvitationBundleSummary;
  decisions: GrantAuthorizationDecision[];
}

export interface GrantRedemptionResult {
  grantId: string;
  kind: string;
  appSlug: string;
  target: string;
  outcome: 'accepted' | 'rejected' | 'expired' | 'unauthorized' | 'duplicate';
  resultingAccountId?: string;
  reason: string;
}

export interface RedeemBundleResult {
  bundleId: string;
  userId: string;
  userCreated: boolean;
  results: GrantRedemptionResult[];
}

async function authedJson<T>(idToken: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(controlPlaneUrl(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** Create an invitation bundle (composer → real backend). Per-grant decisions returned. */
export function createInvitationBundle(
  idToken: string,
  email: string,
  grants: ComposeGrant[],
): Promise<CreateBundleResult> {
  return authedJson(idToken, '/api/invitations/bundles', { email, grants });
}

/**
 * Redeem a bundle as the AUTHENTICATED caller (the real invitee-only path; A5).
 * The handler enforces invitee-only server-side (caller email == bundle email).
 */
export function redeemInvitationBundle(idToken: string, bundleId: string): Promise<RedeemBundleResult> {
  return authedJson(idToken, `/api/invitations/bundles/${encodeURIComponent(bundleId)}/redeem`, {});
}
