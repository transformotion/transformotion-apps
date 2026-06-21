/**
 * Redemption state-machine (runtime)
 * ==================================
 * Runtime port of v0's `redemption-machine`. The PURE decision layer
 * (evaluateRedemption) + the apply step, over the m16.7.0 `redemption.ts`
 * contract shapes. Differences from v0 (mock-store) are driven by the real
 * backend:
 *   - The bundle is resolved via the AUTH-ONLY GET {bundleId} (A1), so this is
 *     AUTH-FIRST: with no identity it returns `needs-auth` WITHOUT a bundle (the
 *     email already showed the grants; the auto-forward sends the invitee to
 *     Hosted-UI). The bundle + link-state are evaluated POST-auth.
 *   - apply delegates to the real A5 redeem (POST .../redeem), which binds to the
 *     authenticated identity (Option D / link-as-bearer); disabled-user
 *     fail-closed + idempotency stay server-side.
 * Shapes are the canonical contract types — no fields are introduced here.
 */

'use client'

import {
  DEFAULT_REDEMPTION_POLICY,
  type AuthenticatedIdentity,
  type IdpProvider,
  type RedemptionBundlePreview,
  type RedemptionContext,
  type RedemptionEvaluation,
  type RedemptionLinkState,
} from '@transformotion/contracts/launchpad/redemption'
import type { GrantRedemptionResult, InvitationBundle } from '@transformotion/contracts/launchpad/invitations'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import { authService } from '@/lib/services/auth'

const APP_LABELS: Record<string, string> = {
  'stock-analyser': 'Stock Analyser',
  'budget-tracker': 'Budget Tracker',
}
const appLabel = (slug: string): string => APP_LABELS[slug] ?? slug
const nowSec = () => Math.floor(Date.now() / 1000)

/** Providers the redemption seam offers (runtime: Cognito Hosted-UI IdPs). */
export const AVAILABLE_IDPS: IdpProvider[] = ['native', 'google', 'facebook', 'microsoft']

export function idpLabel(provider: IdpProvider): string {
  switch (provider) {
    case 'native':
      return 'Email & password'
    case 'google':
      return 'Google'
    case 'facebook':
      return 'Facebook'
    case 'microsoft':
      return 'Microsoft'
  }
}

/** Map a resolved bundle (or its absence) to a link state. Ported verbatim. */
export function deriveLinkState(bundle: InvitationBundle | null | undefined): RedemptionLinkState {
  if (!bundle) return 'not-found'
  if (bundle.status === 'revoked') return 'revoked'
  if (bundle.status === 'accepted') return 'already-redeemed'
  if (bundle.status === 'expired' || bundle.expiresAt < nowSec()) return 'expired'
  return 'valid'
}

const normalizeEmail = (e: string): string => e.trim().toLowerCase()
export function emailsMatch(invited: string, authenticated: string): boolean {
  return normalizeEmail(invited) === normalizeEmail(authenticated)
}

/**
 * Display preview from the resolved bundle. The link-as-bearer invitee is NOT
 * yet a member of any targeted account, so account NAMES cannot be resolved
 * client-side → account-invite uses a NAME-FREE target ("a <app> account"). The
 * APPLIED screen shows real account names (the redeem result resolves them
 * server-side). Only the post-auth email-mismatch screen renders this preview.
 */
export function buildPreview(bundle: InvitationBundle): RedemptionBundlePreview {
  return {
    bundleId: bundle.bundleId,
    invitedEmail: bundle.email,
    grants: bundle.grants.map((g) => ({
      grantId: g.grantId,
      kind: g.kind,
      appSlug: g.appSlug,
      target: g.kind === 'account-invite' ? `a ${appLabel(g.appSlug)} account` : appLabel(g.appSlug),
    })),
  }
}

/** Placeholder preview for needs-auth (never rendered — the flow auto-forwards). */
function emptyPreview(bundleId: string): RedemptionBundlePreview {
  return { bundleId, invitedEmail: '', grants: [] }
}

/**
 * PURE evaluation (auth-first). `ctx.bundle` is the POST-auth resolved bundle:
 *   - no identity → needs-auth (sign in first; bundle not resolved yet).
 *   - identity → link validity → Option-D email match → verification → ready.
 */
export function evaluateRedemption(ctx: RedemptionContext): RedemptionEvaluation {
  const identity = ctx.identity ?? null
  if (!identity) {
    return { status: 'needs-auth', preview: emptyPreview(ctx.bundleId), providers: AVAILABLE_IDPS }
  }

  const bundle = ctx.bundle ?? null
  const linkState = deriveLinkState(bundle)
  if (linkState !== 'valid' || !bundle) {
    return { status: 'link-invalid', linkState: linkState === 'valid' ? 'not-found' : linkState }
  }

  const preview = buildPreview(bundle)
  const matches = emailsMatch(bundle.email, identity.email)
  if (!matches && !ctx.confirmedMismatchBind) {
    return { status: 'email-mismatch', preview, identity, invitedEmail: bundle.email }
  }

  const policy = ctx.policy ?? DEFAULT_REDEMPTION_POLICY
  if (policy.requireVerifiedEmail && !identity.emailVerified) {
    return { status: 'needs-verification', preview, identity }
  }

  return { status: 'ready-to-apply', preview, identity, boundDespiteMismatch: !matches }
}

/** Resolve the bundle (post-auth) via A1. 404/error → null (→ link 'not-found'). */
export async function resolveBundle(bundleId: string): Promise<InvitationBundle | null> {
  try {
    return (await getControlPlaneClient().getInvitationBundle(bundleId)).bundle
  } catch {
    return null
  }
}

const isAppGrantLanding = (r: GrantRedemptionResult): boolean =>
  r.kind === 'app-grant' && r.outcome !== 'expired' && r.outcome !== 'rejected'
const isAccountInviteLanding = (r: GrantRedemptionResult): boolean =>
  r.kind === 'account-invite' && r.outcome !== 'expired' && r.outcome !== 'rejected'

/**
 * Apply the bundle via the real A5 redeem (binds to the authenticated identity;
 * Option D). Shapes `applied`, partitioning per-kind landings. A control-plane
 * refusal (disabled user / not-found) surfaces as a link-invalid terminal state.
 */
export async function applyRedemption(
  bundleId: string,
  identity: AuthenticatedIdentity,
): Promise<RedemptionEvaluation> {
  try {
    const response = await getControlPlaneClient().redeemBundle(bundleId)

    // Redemption just added the invitee's Cognito access groups + account
    // memberships SERVER-SIDE. The current token predates them (it was minted at
    // sign-in), so force a fresh token NOW — the pre-token trigger re-issues the
    // `apps`/`accounts` claims on refresh — BEFORE the Launchpad hand-off. Without
    // this the invitee lands on the Launchpad with apps=[] (#485). Best-effort: a
    // failed refresh degrades to a manual refresh / re-login, not a hard failure.
    await authService.refreshTokens().catch(() => {})

    const results = response.results
    return {
      status: 'applied',
      identity,
      response,
      appGrantLandings: results.filter(isAppGrantLanding),
      accountInviteLandings: results.filter(isAccountInviteLanding),
    }
  } catch {
    const linkState = deriveLinkState(await resolveBundle(bundleId))
    return { status: 'link-invalid', linkState: linkState === 'valid' ? 'not-found' : linkState }
  }
}
