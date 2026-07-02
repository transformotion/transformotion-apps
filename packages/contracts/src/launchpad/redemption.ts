/**
 * M16 — Invitation REDEMPTION EXPERIENCE contract (launchpad-side).
 *
 * Canonical authority: this file owns the redemption-EXPERIENCE shapes (the
 * post-authentication identity the IdP seam returns, link-validity states, the
 * Option-D email-match decision, and the policy + evaluation result that the
 * shared redemption state-machine produces). The v0 prototype's
 * `m11-redemption-machine` and the runtime implementation must import/adapt
 * these shapes, never redefine them.
 *
 * Relationship to neighbouring contracts:
 * - `invitations.ts` remains authoritative for the BUNDLE/GRANT domain and the
 *   PERSISTED redemption result (`RedeemBundleResponse` / `GrantRedemptionResult`).
 *   This file does not restate those; it REFERENCES them.
 * - `_shared/auth.ts` remains authoritative for identity/claims. The
 *   `AuthenticatedIdentity` here is the EXPERIENCE-level projection of "who the
 *   IdP says you are right now" — the minimal shape the redemption seam needs,
 *   not a token format.
 *
 * Policy note (authoritative behaviour, conforms to `auth-model.md`):
 * - Redemption is a POST-AUTHENTICATION action: the invitee authenticates with
 *   an identity provider FIRST, then the (now-known) identity redeems the
 *   bundle. The link is the bearer; the signed-in identity is who the grants
 *   bind to.
 * - Option D (email match): when the authenticated email differs from the
 *   invited email, redemption is NOT blocked. The invitee may CONFIRM and bind
 *   the invitation to the account they are signed in as. Strict same-email
 *   matching is explicitly NOT required.
 * - Verified-email is a STRICTER-MVP option: `requireVerifiedEmail` defaults to
 *   `false` (the link itself is the proof of address ownership). Runtime may
 *   flip it on without a contract change.
 *
 * AUTHORIZATION IS UNCHANGED by anything in this file: the existing grant
 * redemption rules (app-access group gating, idempotency, disabled-user fail
 * closed) are owned by `invitations.ts` + the control-plane. This contract only
 * models the EXPERIENCE/decision surface that precedes calling redeem.
 */

import type { EmailAddress } from '../_shared/api';
import type { EntitledAppSlug } from '../_shared/auth';
import type { GrantRedemptionResult, InvitationBundle, RedeemBundleResponse } from './invitations';

// ---------------------------------------------------------------------------
// Identity provider seam (the runtime's Cognito Hosted-UI swap point)
// ---------------------------------------------------------------------------

/**
 * Identity providers the invitee can authenticate with before redeeming. In
 * the v0 prototype this is a MOCKED seam; in runtime each maps to a Cognito
 * Hosted-UI identity provider. `native` = Cognito user-pool (email + password)
 * sign-up/sign-in; the rest are federated social providers.
 */
export type IdpProvider = 'native' | 'google' | 'facebook' | 'microsoft';

/**
 * The post-authentication identity the IdP seam returns — the minimal,
 * experience-level "who you are right now" projection the redemption flow needs.
 * NOT a token/claims format (see `_shared/auth.ts` for those). The runtime
 * builds this from the Cognito session after Hosted-UI returns.
 */
export interface AuthenticatedIdentity {
  provider: IdpProvider;
  email: EmailAddress;
  /**
   * Whether the IdP asserts the email is verified. For federated providers
   * this typically reflects the provider's own verification; for `native` it
   * reflects Cognito email verification. Only GATES redemption when the active
   * `RedemptionPolicy.requireVerifiedEmail` is `true`.
   */
  emailVerified: boolean;
  /** Optional human-friendly name the IdP supplied (display only). */
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Link validity & email match
// ---------------------------------------------------------------------------

/**
 * Validity of the redemption link itself, evaluated from the resolved bundle
 * BEFORE any apply is offered. Every member maps to a REAL backend condition
 * (none are speculative):
 * - `valid`            — bundle exists and is `pending` (redeemable now).
 * - `expired`          — bundle `status === 'expired'` (past `expiresAt`).
 * - `revoked`          — bundle `status === 'revoked'` (a real `InvitationStatus`;
 *                        e.g. a bundle whose last remaining grant was cancelled).
 * - `already-redeemed` — bundle `status === 'accepted'` (idempotent re-visit).
 * - `not-found`        — no bundle for the given id (unknown/malformed/garbage id).
 */
export type RedemptionLinkState =
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'already-redeemed'
  | 'not-found';

/** Whether the authenticated email equals the invited email (Option D input). */
export type EmailMatch = 'match' | 'mismatch';

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Tunable redemption policy. Kept tiny on purpose — the only currently-modelled
 * knob is the stricter-MVP verified-email gate.
 */
export interface RedemptionPolicy {
  /**
   * When `true`, an authenticated identity whose `emailVerified` is `false`
   * must verify before redemption can apply (`needs-verification`). Defaults to
   * `false`: the link is treated as the bearer/proof, so unverified identities
   * may still proceed. Runtime may enable without a contract change.
   */
  requireVerifiedEmail: boolean;
}

/** Default policy: verified-email NOT required (link is the bearer). */
export const DEFAULT_REDEMPTION_POLICY: RedemptionPolicy = {
  requireVerifiedEmail: false,
};

// ---------------------------------------------------------------------------
// Evaluation result (shared state-machine output)
// ---------------------------------------------------------------------------

export type RedemptionStatus =
  | 'link-invalid'
  | 'needs-auth'
  | 'email-mismatch'
  | 'needs-verification'
  | 'ready-to-apply'
  | 'applied';

/** Bundle preview shown to the invitee before they apply (display projection). */
export interface RedemptionBundlePreview {
  bundleId: string;
  invitedEmail: EmailAddress;
  /** Per-grant human-facing summary (kind + app + target label). */
  grants: Array<{
    grantId: string;
    kind: GrantRedemptionResult['kind'];
    appSlug: EntitledAppSlug;
    /** Account name (account-invite) or app label (app-grant). */
    target: string;
  }>;
}

/**
 * The link is unusable; nothing to apply. `linkState` is never `'valid'` here.
 */
export interface RedemptionLinkInvalid {
  status: 'link-invalid';
  linkState: Exclude<RedemptionLinkState, 'valid'>;
}

/** Link is valid but no one is signed in yet — show the IdP chooser. */
export interface RedemptionNeedsAuth {
  status: 'needs-auth';
  preview: RedemptionBundlePreview;
  /** Providers offered by the seam (runtime: configured Hosted-UI providers). */
  providers: IdpProvider[];
}

/**
 * Option D: authenticated, link valid, but the signed-in email differs from the
 * invited email. This is a CONFIRM state, NOT a block — the PRIMARY action is
 * "continue and bind this invitation to the account you're signed in as". The
 * secondary action is to switch identity.
 */
export interface RedemptionEmailMismatch {
  status: 'email-mismatch';
  preview: RedemptionBundlePreview;
  identity: AuthenticatedIdentity;
  invitedEmail: EmailAddress;
}

/** Stricter-MVP: authenticated but email unverified and policy requires it. */
export interface RedemptionNeedsVerification {
  status: 'needs-verification';
  preview: RedemptionBundlePreview;
  identity: AuthenticatedIdentity;
}

/** Authenticated and cleared all gates — ready to apply the bundle. */
export interface RedemptionReadyToApply {
  status: 'ready-to-apply';
  preview: RedemptionBundlePreview;
  identity: AuthenticatedIdentity;
  /** True when proceeding via Option-D continue-and-bind (email mismatch confirmed). */
  boundDespiteMismatch: boolean;
}

/**
 * Bundle applied. Carries the PERSISTED per-grant results so the UI routes EACH
 * grant kind to its correct landing — NEVER a generic "go to app":
 * - `app-grant` (no `resultingAccountId`) -> hand off to the create-first-account
 *   surface for `appSlug` ("create your first account in <app>").
 * - `account-invite` (`resultingAccountId` present) -> "you've joined <account>".
 * A mixed bundle surfaces both landings.
 */
export interface RedemptionApplied {
  status: 'applied';
  identity: AuthenticatedIdentity;
  response: RedeemBundleResponse;
  /** Convenience partitions over `response.results` for the per-kind landings. */
  appGrantLandings: GrantRedemptionResult[];
  accountInviteLandings: GrantRedemptionResult[];
}

/** Discriminated union of all redemption-experience outcomes. */
export type RedemptionEvaluation =
  | RedemptionLinkInvalid
  | RedemptionNeedsAuth
  | RedemptionEmailMismatch
  | RedemptionNeedsVerification
  | RedemptionReadyToApply
  | RedemptionApplied;

/**
 * Inputs the shared state-machine evaluates. `bundle` is the resolved bundle
 * (or `null`/`undefined` for `not-found`); `identity` is absent until the
 * invitee authenticates via the seam.
 */
export interface RedemptionContext {
  bundleId: string;
  bundle?: InvitationBundle | null;
  identity?: AuthenticatedIdentity | null;
  policy?: RedemptionPolicy;
  /** Set when the invitee has chosen Option-D continue-and-bind. */
  confirmedMismatchBind?: boolean;
}
