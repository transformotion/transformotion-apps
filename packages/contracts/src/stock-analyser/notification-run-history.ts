import type { AccountId, EmailAddress, ISODateTime, UserId } from '../_shared/api';
import type { NotificationViewerContext } from './notification-preferences';

/**
 * Notification run-history (send-log) READ model — canonical, M19 #573.
 *
 * The daily market-analysis notification job emits a run record each time it
 * executes. This contract is the canonical READ shape that #572's backend
 * conforms to and runtime's read endpoint returns. v0 authors it here (surface
 * + visibility + read contract); the send-log DATA/write is #572 (backend), and
 * the read endpoint is runtime, conforming to THIS shape.
 *
 * Three RATIFIED levels, hierarchical (run → accounts → members):
 *  1. {@link NotificationRunSummary} — one run: id, time, status, rollups, and
 *     its per-account records.
 *  2. {@link NotificationRunAccount} — how the run treated ONE account:
 *     identity, status, the ticker verdict transitions that motivated sends,
 *     emails sent, and the per-member outcomes.
 *  3. {@link NotificationMemberOutcome} (LEAF) — per-member: sent or skipped,
 *     WHY (reason), and (for sends) the tickers included.
 *
 * The read returns a bounded, most-recent-first LIST of runs
 * ({@link NotificationRunHistoryPage} → {@link projectRunHistoryForViewer}): the
 * surface is the HISTORY of runs, each run independently expandable into the
 * account/member detail above. The per-account visibility scoping is applied
 * PER RUN, identical to the single-run case.
 *
 * VISIBILITY is resolved PER ACCOUNT as the MAX of two INDEPENDENT, ADDITIVE
 * grants — an admin grant (summary) and an account-relationship grant (detail) —
 * NOT a single role lookup. So a user who is BOTH admin AND owner/manager of
 * some accounts sees, in ONE view: the cross-account header, a summary line for
 * every account, full member detail ONLY on the accounts they own/manage, and
 * summary-only on the rest. Encoded as pure resolvers
 * ({@link resolveAccountRunVisibility}, {@link projectRunForViewer}) so the UI
 * and runtime share one source of truth. See
 * `notification-run-history.behaviour.md` for the matrix and the load-bearing
 * CONSTRAINT: this is a UX convenience, NOT access control — runtime MUST scope
 * the WIRE PAYLOAD server-side (per-member detail reaches only an owner/manager
 * of THAT account; admin-without-ownership gets summary-only) regardless of
 * what the UI hides.
 */

/**
 * Per-ticker analysis verdict, used to describe a notification transition. The
 * job sends when a holding/watchlist ticker's verdict CHANGES. (Canonical for
 * the notification domain; mirrors the legacy `BUY|SELL|HOLD|NEUTRAL` band.)
 */
export type NotificationVerdict = 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';

/** Whether a member was delivered a notification in a run. */
export type NotificationOutcome = 'sent' | 'skipped';

/**
 * WHY a member was or wasn't delivered in a run (leaf reason). Exactly one
 * applies per member outcome. Split into three display classes (see
 * {@link isErrorOutcomeReason}):
 *
 * SENT:
 *  - `delivered` — SENT: actionable transition, consent ON, engine enabled.
 *
 * ROUTINE SKIPS (not a problem — expected, by-design non-delivery):
 *  - `consent-off` — skipped: the member has not opted in (consent OFF).
 *  - `disabled` — skipped: the app-wide engine kill-switch (#571) was OFF.
 *  - `viewer` — skipped: read-only viewer, who can never receive.
 *  - `not-a-member` — skipped: no live membership on the account at run time.
 *  - `no-actionable-transition` — skipped: none of this member's tickers had a
 *    verdict change worth sending.
 *
 * ERRORS (a PROBLEM the member's owner/manager may need to troubleshoot — M19
 * Issue B). These are DETAIL: they reach ONLY an owner/manager of the account,
 * never an admin-without-ownership (stripped with the rest of member detail):
 *  - `lookup-error` — a data/lookup error prevented evaluating this member.
 *  - `send-failed` — the message failed to send (delivery/transport error).
 *  - `credit-balance` — not sent: the email credit balance was too low.
 */
export type NotificationOutcomeReason =
  | 'delivered'
  | 'consent-off'
  | 'disabled'
  | 'viewer'
  | 'not-a-member'
  | 'no-actionable-transition'
  | 'lookup-error'
  | 'send-failed'
  | 'credit-balance';

/**
 * The member-outcome reasons that represent an ERROR (a problem), as opposed to
 * a routine skip or a successful send. Shared by UI and runtime so "is this a
 * problem?" is decided in ONE place. An errored member should read as a problem,
 * not a routine skip.
 */
export const ERROR_OUTCOME_REASONS = [
  'lookup-error',
  'send-failed',
  'credit-balance',
] as const satisfies readonly NotificationOutcomeReason[];

/** True when a member outcome reason is an error (a problem to troubleshoot). */
export function isErrorOutcomeReason(reason: NotificationOutcomeReason): boolean {
  return (ERROR_OUTCOME_REASONS as readonly NotificationOutcomeReason[]).includes(reason);
}

/** LEAF (level 3): one member's outcome within an account in a run. */
export interface NotificationMemberOutcome {
  userId: UserId;
  email: EmailAddress;
  outcome: NotificationOutcome;
  reason: NotificationOutcomeReason;
  /**
   * Tickers included in the delivered notification. Present and non-empty ONLY
   * when `outcome === 'sent'` (`reason === 'delivered'`); omitted for skips.
   */
  tickers?: string[];
}

/** A single ticker verdict transition that motivated notifications in a run. */
export interface NotificationTransition {
  ticker: string;
  from: NotificationVerdict;
  to: NotificationVerdict;
}

/**
 * How the run treated one account:
 *  - `processed` — the account was evaluated this run (it may still have sent 0
 *    emails, e.g. every member skipped).
 *  - `skipped` — the account was not processed (e.g. interval not yet elapsed,
 *    no active types).
 *  - `error` — an account-level error halted processing for it.
 */
export type NotificationRunAccountStatus = 'processed' | 'skipped' | 'error';

/**
 * WHY an account errored (account-level — M19 Issue B). Set iff
 * `accountStatus === 'error'`. This is SUMMARY-tier: it is part of the account
 * line, so an admin-without-ownership DOES see which accounts errored and why
 * (it is NOT member detail). Distinct from per-member error reasons, which are
 * detail and reach only the account's owner/manager.
 *  - `processing-failed` — the account failed to process (generic engine error).
 *  - `credit-balance` — the account's email credit balance was too low to send.
 *  - `write-failed` — persisting the run record / send-log write failed.
 */
export type AccountRunErrorReason =
  | 'processing-failed'
  | 'credit-balance'
  | 'write-failed';

/** PER-ACCOUNT (level 2): one account's record within a run. */
export interface NotificationRunAccount {
  accountId: AccountId;
  accountName: string;
  accountStatus: NotificationRunAccountStatus;
  /**
   * Account-level error reason. Present iff `accountStatus === 'error'`.
   * SUMMARY-tier — preserved for summary-only accounts (admins see WHICH
   * accounts errored and why, across all accounts).
   */
  error?: AccountRunErrorReason;
  /** Ticker verdict transitions that motivated sends for this account. */
  transitions: NotificationTransition[];
  /** Emails sent for this account this run (equals members with `outcome: 'sent'`). */
  emailsSent: number;
  memberOutcomes: NotificationMemberOutcome[];
}

/** Overall run status: all-ok, some accounts errored, or the run failed. */
export type NotificationRunStatus = 'success' | 'partial' | 'failed';

/** RUN SUMMARY (level 1): one notification job run, with its account records. */
export interface NotificationRunSummary {
  runId: string;
  ranAt: ISODateTime;
  status: NotificationRunStatus;
  /** Cross-account rollup: how many accounts the run evaluated. */
  accountsEvaluated: number;
  /**
   * Cross-account rollup: how many accounts ERRORED this run (M19 Issue B) —
   * the summary-tier error SIGNAL. Anyone who sees the summary sees that errors
   * occurred ("2 accounts errored"). Equals the accounts with
   * `accountStatus === 'error'`.
   */
  accountsErrored: number;
  /** Cross-account rollup: total emails sent across all accounts. */
  emailsSent: number;
  accounts: NotificationRunAccount[];
}

// ---------------------------------------------------------------------------
// Per-account visibility model (CORRECTED v2 — additive MAX of two grants)
// ---------------------------------------------------------------------------

/**
 * What a viewer may see of ONE account's run record:
 *  - `detail`  — the full account record INCLUDING per-member outcomes (and the
 *    account's ticker transitions).
 *  - `summary` — the account line ONLY: name, status, emails-sent count. NO
 *    member rows, NO transitions (these are never sent over the wire).
 *  - `hidden`  — the account is not visible to this viewer at all.
 */
export type AccountRunVisibility = 'detail' | 'summary' | 'hidden';

/**
 * Per-account visibility = MAX( adminGrant, relationshipGrant ), where the two
 * grants are INDEPENDENT and ADDITIVE (NOT a single role lookup):
 *
 *   adminGrant(viewer)                     = 'summary' if app/site-admin, else 'hidden'
 *   relationshipGrant(viewer, account)     = 'detail'  if owner/manager OF THIS
 *                                            account, else 'hidden'
 *   effective = strongest of the two:  detail > summary > hidden
 *
 * Resulting cases:
 *  - admin + owns/manages this account        → detail
 *  - admin + does NOT own/manage this account  → summary (no member rows)
 *  - owner/manager (not admin) + owns this acct → detail
 *  - owner/manager (not admin) + another acct   → hidden
 *  - member/viewer / no relationship + not admin → hidden
 *
 * `accessibleAccountIds` is the set of accounts the viewer owns/manages (from a
 * LIVE membership read). The active-account `ctx.accountRole` is NOT used here:
 * ownership is per-account across ALL the viewer's accounts, not just the active
 * one — a user can own account A while merely viewing account B.
 */
export function resolveAccountRunVisibility(
  ctx: NotificationViewerContext,
  accountId: AccountId,
  accessibleAccountIds: readonly AccountId[],
): AccountRunVisibility {
  const ownsThisAccount = accessibleAccountIds.includes(accountId);
  if (ownsThisAccount) return 'detail'; // relationshipGrant=detail dominates
  if (ctx.isSiteAdmin || ctx.isAppAdmin) return 'summary'; // adminGrant only
  return 'hidden';
}

/** True when the viewer holds ANY admin grant (drives the cross-account header). */
export function viewerHasAdminGrant(ctx: NotificationViewerContext): boolean {
  return ctx.isSiteAdmin || ctx.isAppAdmin;
}

/** One account's record as projected for a viewer (carries its visibility level). */
export interface NotificationRunAccountView extends NotificationRunAccount {
  /**
   * `detail` → `memberOutcomes`/`transitions` populated; `summary` → both are
   * EMPTY (the server never sent them). `accountStatus` and `emailsSent` are
   * present at both levels (they are part of the summary line).
   */
  visibility: Exclude<AccountRunVisibility, 'hidden'>;
}

/** A run projected to what a specific viewer may see, per the MAX rule. */
export interface NotificationRunView {
  /**
   * Cross-account run-summary header (ranAt, status, total emails, accounts
   * evaluated). Shown to anyone with ANY admin grant. A pure owner/manager
   * (non-admin) gets NO cross-account header — only their own account lines.
   */
  showCrossAccountHeader: boolean;
  runId: string;
  ranAt: ISODateTime;
  status: NotificationRunStatus;
  /** Rollups over the VISIBLE accounts (summary + detail both count). */
  accountsEvaluated: number;
  /**
   * Errored accounts among the VISIBLE accounts (recomputed, summary-tier). An
   * owner/manager sees the count among THEIR accounts; an admin across all.
   */
  accountsErrored: number;
  emailsSent: number;
  accounts: NotificationRunAccountView[];
}

/**
 * Project a run for a viewer, MODELLING the server-side scoping boundary, with
 * visibility resolved PER ACCOUNT as `MAX(adminGrant, relationshipGrant)`:
 *
 *  - each account the viewer owns/manages → `detail` (full member rows).
 *  - each OTHER account, when the viewer is admin → `summary` (account line +
 *    status + count; member outcomes and transitions STRIPPED).
 *  - every other account → omitted entirely.
 *  - `showCrossAccountHeader` ← the viewer has any admin grant.
 *  - rollups (`accountsEvaluated`, `emailsSent`) are recomputed over the
 *    VISIBLE accounts (both summary and detail contribute their counts).
 *  - returns `null` when NO account is visible (member/viewer, or a pure
 *    owner/manager with no owned accounts in this run).
 *
 * In runtime this is the SERVER's job (fail-closed): per-member detail for an
 * account is sent ONLY to an owner/manager of THAT account. Admin-without-
 * ownership receives summary-only — member identities/outcomes are NOT in the
 * payload. UI hiding is not the boundary; the wire payload is. This pure helper
 * models that boundary so v0 and runtime agree on the projection.
 */
export function projectRunForViewer(
  run: NotificationRunSummary,
  ctx: NotificationViewerContext,
  accessibleAccountIds: readonly AccountId[],
): NotificationRunView | null {
  const accounts: NotificationRunAccountView[] = [];
  for (const account of run.accounts) {
    const level = resolveAccountRunVisibility(ctx, account.accountId, accessibleAccountIds);
    if (level === 'hidden') continue;
    if (level === 'detail') {
      accounts.push({ ...account, visibility: 'detail' });
    } else {
      // summary-only: strip member outcomes AND transitions — they are never
      // sent over the wire for an account the viewer does not own/manage. The
      // account-level `error` reason is SUMMARY-tier and is PRESERVED (spread):
      // admins see WHICH accounts errored and why, but NOT the per-member error
      // reasons (those go with memberOutcomes).
      accounts.push({
        ...account,
        transitions: [],
        memberOutcomes: [],
        visibility: 'summary',
      });
    }
  }

  if (accounts.length === 0) return null;

  return {
    showCrossAccountHeader: viewerHasAdminGrant(ctx),
    runId: run.runId,
    ranAt: run.ranAt,
    status: run.status,
    accountsEvaluated: accounts.length,
    accountsErrored: accounts.filter((a) => a.accountStatus === 'error').length,
    emailsSent: accounts.reduce((n, a) => n + a.emailsSent, 0),
    accounts,
  };
}

// ---------------------------------------------------------------------------
// Run-history LIST + pagination (M19 #573 extend — runs are a HISTORY)
// ---------------------------------------------------------------------------

/**
 * Default page size for the run-history list (the last N runs, newest first).
 * The read is bounded — it never returns the unbounded run log in one call.
 */
export const DEFAULT_RUN_HISTORY_LIMIT = 30;

/**
 * A bounded page of runs, MOST-RECENT-FIRST. This is what the read returns.
 *
 * #572's backend lists recent runs via GSI1 (`PK=RUNS`, `SK=ranAt` — the
 * recency index) in descending `ranAt` order, capped at `limit` (default
 * {@link DEFAULT_RUN_HISTORY_LIMIT}). `nextCursor` is the opaque key to fetch
 * the next (older) page; absent when there are no older runs. Each run carries
 * its full {@link NotificationRunSummary} (summary + per-account records); the
 * per-account WIRE-PAYLOAD scoping (the MAX rule) is applied to EACH run
 * server-side, identical to the single-run case.
 */
export interface NotificationRunHistoryPage {
  runs: NotificationRunSummary[];
  /** Opaque pagination cursor for the next (older) page; absent at the end. */
  nextCursor?: string;
}

/**
 * A page of runs PROJECTED per-viewer: each run scoped per the MAX rule, in the
 * same most-recent-first order, with the page cursor preserved.
 */
export interface NotificationRunHistoryView {
  runs: NotificationRunView[];
  /** Opaque cursor for the next (older) page; absent at the end. */
  nextCursor?: string;
}

/**
 * Project a PAGE of runs for a viewer. Each run is INDEPENDENTLY scoped via
 * {@link projectRunForViewer} (the per-account MAX-of-grants rule, applied
 * per-run); runs with NOTHING visible to the viewer are DROPPED (e.g. a run
 * that only touched accounts the viewer cannot see). Order (most-recent-first)
 * and `nextCursor` are preserved.
 *
 * Returns `null` when NO run in the page is visible (member/viewer, or an
 * owner/manager with no owned accounts in any run) so the UI omits the section
 * entirely — mirroring the single-run `null` contract.
 */
export function projectRunHistoryForViewer(
  page: NotificationRunHistoryPage,
  ctx: NotificationViewerContext,
  accessibleAccountIds: readonly AccountId[],
): NotificationRunHistoryView | null {
  const runs: NotificationRunView[] = [];
  for (const run of page.runs) {
    const view = projectRunForViewer(run, ctx, accessibleAccountIds);
    if (view) runs.push(view);
  }
  if (runs.length === 0) return null;
  return { runs, nextCursor: page.nextCursor };
}
