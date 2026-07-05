import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withAuthOnly, ok, type AuthClaims } from '@transformotion/lambda-middleware';
import { appAdminGroup } from '@transformotion/contracts/_shared/auth';
import {
  DEFAULT_RUN_HISTORY_LIMIT,
  projectRunHistoryForViewer,
  type AccountRunErrorReason,
  type NotificationMemberOutcome,
  type NotificationOutcome,
  type NotificationOutcomeReason,
  type NotificationRunAccount,
  type NotificationRunAccountStatus,
  type NotificationRunStatus,
  type NotificationRunSummary,
  type NotificationTransition,
  type NotificationVerdict,
  type NotificationViewerContext,
} from '@transformotion/contracts/stock-analyser/notification-run-history';

// M19 #573 — notification run-history READ. Lists recent runs from the send-log
// table (#574) and PROJECTS each per-viewer SERVER-SIDE via the synced
// projectRunHistoryForViewer over LIVE membership, so per-member detail an
// account the caller does not own/manage NEVER reaches the wire.

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SEND_LOG_TABLE = process.env.SEND_LOG_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const APP_SLUG = 'stock-analyser';

// ── #574 stored record → synced contract shape ──────────────────────────────
function mapAccountStatus(status: unknown): NotificationRunAccountStatus {
  if (status === 'processed') return 'processed';
  if (status === 'failed') return 'error';
  return 'skipped'; // skipped-not-due / skipped-no-eligible → 'skipped'
}

function mapReason(reason: unknown): NotificationOutcomeReason {
  // `account-not-due` (#574 leaf) has no contract reason — the member was eligible
  // but the account did not process, i.e. nothing actionable for them this run.
  if (reason === 'account-not-due') return 'no-actionable-transition';
  return reason as NotificationOutcomeReason;
}

// #579: map the stored free-text account error message → the contract's summary-tier
// AccountRunErrorReason. The engine stores a raw message (a Claude credit failure, a
// send-log write-failure marker, or a generic processing error). Set only when the
// account status maps to `error`.
function mapAccountError(raw: unknown): AccountRunErrorReason {
  const msg = String(raw ?? '').toLowerCase();
  if (msg.includes('credit')) return 'credit-balance';
  if (msg.includes('write') || msg.includes('send-log')) return 'write-failed';
  return 'processing-failed';
}

function mapTransition(t: Record<string, unknown>): NotificationTransition {
  return {
    ticker: String(t['ticker'] ?? ''),
    from: (t['fromVerdict'] as NotificationVerdict) ?? 'NEUTRAL',
    to: (t['toVerdict'] as NotificationVerdict) ?? 'NEUTRAL',
  };
}

function mapMemberOutcome(o: Record<string, unknown>): NotificationMemberOutcome {
  const tickers = o['tickers'];
  return {
    userId: String(o['userId'] ?? ''),
    email: String(o['email'] ?? ''),
    outcome: o['outcome'] as NotificationOutcome,
    reason: mapReason(o['reason']),
    ...(Array.isArray(tickers) && tickers.length > 0 ? { tickers: tickers.map(String) } : {}),
  };
}

// Defence-in-depth (#581): never render a raw accountId (GUID) as the name. The
// engine now captures the name even for errored accounts, but a genuinely-absent
// name falls back to a readable label rather than the GUID.
const UNKNOWN_ACCOUNT_NAME = 'Unknown account';

export function mapAccount(item: Record<string, unknown>): NotificationRunAccount {
  const accountId = String(item['accountId'] ?? '');
  const transitions = Array.isArray(item['transitions']) ? item['transitions'] : [];
  const memberOutcomes = Array.isArray(item['memberOutcomes']) ? item['memberOutcomes'] : [];
  const skippedTickers = Array.isArray(item['skippedTickers']) ? item['skippedTickers'].map(String) : [];
  const rawName = typeof item['accountName'] === 'string' ? item['accountName'].trim() : '';
  const accountStatus = mapAccountStatus(item['status']);
  return {
    accountId,
    accountName: rawName || UNKNOWN_ACCOUNT_NAME,
    accountStatus,
    // #579: surface the account-level error (summary-tier — admins see WHICH accounts
    // errored + why) only when the account actually errored.
    ...(accountStatus === 'error' ? { error: mapAccountError(item['error']) } : {}),
    transitions: transitions.map((t) => mapTransition(t as Record<string, unknown>)),
    emailsSent: Number(item['emailsSent'] ?? 0),
    memberOutcomes: memberOutcomes.map((o) => mapMemberOutcome(o as Record<string, unknown>)),
    // #579: Option-B skipped tickers (detail-tier — the projection strips these for
    // summary-only viewers). Omitted when empty.
    ...(skippedTickers.length > 0 ? { skippedTickers } : {}),
  };
}

/** Assemble a contract run from its stored SUMMARY item + ACCT# items. */
export function assembleRun(summary: Record<string, unknown>, accountItems: Record<string, unknown>[]): NotificationRunSummary {
  const ranAtEpoch = Number(summary['ranAt'] ?? 0);
  const accounts = accountItems.map(mapAccount);
  return {
    runId: String(summary['runId'] ?? ''),
    ranAt: new Date(ranAtEpoch * 1000).toISOString(),
    status: (summary['status'] as NotificationRunStatus) ?? 'success',
    accountsEvaluated: Number(summary['accountsEvaluated'] ?? 0),
    // #579: summary-tier rollup — count of accounts that errored (the stored summary
    // does not carry it; derive from the account records).
    accountsErrored: accounts.filter((a) => a.accountStatus === 'error').length,
    emailsSent: Number(summary['emailsSent'] ?? 0),
    accounts,
  };
}

function viewerContext(auth: AuthClaims): NotificationViewerContext {
  // Run-history visibility never uses `accountRole` (ownership is per-account from
  // the live read); admin grants are groups-authoritative.
  return {
    accountRole: null,
    isSiteAdmin: auth.groups.includes('site-admin'),
    isAppAdmin: auth.groups.includes(appAdminGroup(APP_SLUG)),
  };
}

export interface RunHistoryDeps {
  /** Recent runs (most-recent-first), each fully assembled from the store. */
  loadRecentRuns: (limit: number) => Promise<NotificationRunSummary[]>;
  /** LIVE set of accounts the user owns/manages (SA). Throw → caller fails closed. */
  loadAccessibleAccountIds: (userId: string) => Promise<string[]>;
  log?: (message: string, context?: Record<string, unknown>) => void;
}

export function createHandler(deps: RunHistoryDeps) {
  return withAuthOnly(async ({ auth }) => {
    const runs = await deps.loadRecentRuns(DEFAULT_RUN_HISTORY_LIMIT);

    // FAIL CLOSED: if live ownership cannot be read, no per-account DETAIL is
    // granted (empty set) — an admin still sees summaries, a non-admin sees
    // nothing. Detail is NEVER leaked on a membership-read failure.
    let accessibleAccountIds: string[] = [];
    try {
      accessibleAccountIds = await deps.loadAccessibleAccountIds(auth.userId);
    } catch (err) {
      deps.log?.('run-history-membership-read-failed', { userId: auth.userId, err: String(err) });
      accessibleAccountIds = [];
    }

    // SERVER-SIDE projection scopes the WIRE PAYLOAD (summary strips member rows +
    // transitions; hidden accounts/runs are dropped) — never rendered-then-hidden.
    const view = projectRunHistoryForViewer({ runs }, viewerContext(auth), accessibleAccountIds);
    return ok(view ?? { runs: [] });
  });
}

// ── IO ───────────────────────────────────────────────────────────────────────
async function loadRecentRuns(limit: number): Promise<NotificationRunSummary[]> {
  // GSI1 (RUNS → ranAt), most-recent-first, bounded.
  const res = await ddb.send(new QueryCommand({
    TableName: SEND_LOG_TABLE,
    IndexName: 'gsi1-runs-by-recency',
    KeyConditionExpression: 'gsi1pk = :runs',
    ExpressionAttributeValues: { ':runs': 'RUNS' },
    ScanIndexForward: false,
    Limit: limit,
  }));
  const summaries = (res.Items ?? []) as Record<string, unknown>[];
  return Promise.all(summaries.map(async (summary) => {
    const runId = String(summary['runId'] ?? '');
    // The run's ACCT# items (the SUMMARY row sk is 'SUMMARY'; accounts are 'ACCT#…').
    const runItems = await ddb.send(new QueryCommand({
      TableName: SEND_LOG_TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :acct)',
      ExpressionAttributeValues: { ':pk': `RUN#${runId}`, ':acct': 'ACCT#' },
    }));
    return assembleRun(summary, (runItems.Items ?? []) as Record<string, unknown>[]);
  }));
}

type MemberRow = { accountId?: string; appSlug?: string; role?: string };

/**
 * The accessible-account filter, isolated from IO so it is unit-testable. Strict
 * `appSlug === 'stock-analyser'` filtering is CORRECT and retained — a row for a
 * different app must not grant SA run-history detail. But a row that is MISSING
 * `appSlug` entirely (a data defect, #582) silently excludes an owner/manager from
 * their OWN account's detail; that exclusion is logged so it is observable, without
 * relaxing the filter.
 */
export function filterAccessibleAccountIds(
  rows: MemberRow[],
  log?: (message: string, context?: Record<string, unknown>) => void,
): string[] {
  const accessible: string[] = [];
  for (const r of rows) {
    const isOwnerOrManager = r.role === 'owner' || r.role === 'manager';
    if (!r.appSlug && isOwnerOrManager && r.accountId) {
      log?.('run-history-member-row-missing-appslug', { accountId: r.accountId, role: r.role });
      continue; // strict filter still drops it — the WARN just makes the drop visible
    }
    if (r.appSlug === APP_SLUG && isOwnerOrManager && r.accountId) accessible.push(r.accountId);
  }
  return accessible;
}

async function loadAccessibleAccountIds(userId: string): Promise<string[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ProjectionExpression: 'accountId, appSlug, #r',
    ExpressionAttributeNames: { '#r': 'role' },
  }));
  const rows = (res.Items ?? []) as MemberRow[];
  return filterAccessibleAccountIds(rows, (message, context) =>
    console.log(JSON.stringify({ message, userId, ...context })),
  );
}

export const handler = createHandler({
  loadRecentRuns,
  loadAccessibleAccountIds,
  log: (message, context) => console.log(JSON.stringify({ message, ...context })),
});
