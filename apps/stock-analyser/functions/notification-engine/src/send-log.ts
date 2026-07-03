// #578 — fault-tolerant send-log writer (follow-up to #572).
//
// The send-log is the audit trail behind run-history (#573). Persisting it must
// not be all-or-nothing: a single poison account (e.g. an item the marshaller
// rejects, throttling, an oversized item) must NOT drop the accounts that come
// after it, and the run's reported status must reflect any write loss instead
// of silently under-persisting (run fd4461f3 lost accounts 4–9 this way).
//
// This module is pure (item shaping + an isolated write loop over an injected
// `putItem`); the real DynamoDB `PutCommand` wrapping lives in index.ts, so the
// fault-tolerance is unit-testable without the AWS SDK.

import type { SendLogAccount, SendLogRun, SendLogStatus } from './engine';

/** Append-only audit that should age out (90 days). */
export const SEND_LOG_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Run SUMMARY item — GSI1 (RUNS → ranAt) drives the recency list. */
export function summaryItem(run: SendLogRun, status: SendLogStatus, expiresAt: number): Record<string, unknown> {
  return {
    pk: `RUN#${run.runId}`,
    sk: 'SUMMARY',
    gsi1pk: 'RUNS',
    gsi1sk: run.ranAt,
    runId: run.runId,
    ranAt: run.ranAt,
    status,
    accountsEvaluated: run.accountsEvaluated,
    accountsProcessed: run.accountsProcessed,
    accountsSkippedNotDue: run.accountsSkippedNotDue,
    accountsSkippedNoEligible: run.accountsSkippedNoEligible,
    emailsSent: run.emailsSent,
    ...(run.error ? { error: run.error } : {}),
    ...(run.note ? { note: run.note } : {}),
    expiresAt,
  };
}

/** Per-account item — GSI2 (ACCT#{id} → ranAt) drives per-account history. */
export function accountItem(run: SendLogRun, account: SendLogAccount, expiresAt: number): Record<string, unknown> {
  return {
    pk: `RUN#${run.runId}`,
    sk: `ACCT#${account.accountId}`,
    gsi2pk: `ACCT#${account.accountId}`,
    gsi2sk: run.ranAt,
    runId: run.runId,
    ranAt: run.ranAt,
    accountId: account.accountId,
    ...(account.accountName ? { accountName: account.accountName } : {}),
    status: account.status,
    transitions: account.transitions,
    emailsSent: account.emailsSent,
    memberOutcomes: account.memberOutcomes,
    ...(account.error ? { error: account.error } : {}),
    ...(account.skippedTickers && account.skippedTickers.length > 0 ? { skippedTickers: account.skippedTickers } : {}),
    expiresAt,
  };
}

/** The minimal honest marker for an account whose normal write failed (#578). */
function erroredAccountMarker(account: SendLogAccount, err: unknown): SendLogAccount {
  return {
    accountId: account.accountId,
    ...(account.accountName ? { accountName: account.accountName } : {}),
    status: 'failed',
    transitions: [],
    emailsSent: 0,
    memberOutcomes: [],
    error: `send-log write failed: ${String((err as Error)?.message ?? err)}`,
  };
}

export interface WriteSendLogOptions {
  ttlSeconds?: number;
  log?: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * Persist a run's audit record with PER-ACCOUNT ISOLATION (#578).
 *
 * Each account is written independently: if its write throws, that account is
 * re-written as a minimal `failed` marker and the loop CONTINUES — a poison
 * account never drops the rest of the run. Any write failure ESCALATES the run
 * to `partial` (a `failed` run-level status is never downgraded), and the
 * SUMMARY is written LAST so its status reflects the actual write outcome, not
 * the pre-write optimistic value. `run.status` is mutated so the value the
 * engine returns/logs is honest too.
 */
export async function writeSendLog(
  putItem: (item: Record<string, unknown>) => Promise<void>,
  run: SendLogRun,
  options: WriteSendLogOptions = {},
): Promise<void> {
  const expiresAt = run.ranAt + (options.ttlSeconds ?? SEND_LOG_TTL_SECONDS);
  let status: SendLogStatus = run.status;

  for (const account of run.accounts) {
    try {
      await putItem(accountItem(run, account, expiresAt));
    } catch (err) {
      // A write loss is at least a partial run (never downgrade an outright failure).
      if (status === 'success') status = 'partial';
      options.log?.('notification-send-log-account-write-error', { accountId: account.accountId, err: String(err) });
      // Record THIS account as errored and keep going — do not abort the loop.
      try {
        await putItem(accountItem(run, erroredAccountMarker(account, err), expiresAt));
      } catch (markerErr) {
        options.log?.('notification-send-log-account-marker-error', { accountId: account.accountId, err: String(markerErr) });
      }
    }
  }

  run.status = status; // honest run status reflects per-account write outcomes
  await putItem(summaryItem(run, status, expiresAt));
}
