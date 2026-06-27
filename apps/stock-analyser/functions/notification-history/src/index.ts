import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withAuthOnly, ok, type AuthClaims } from '@transformotion/lambda-middleware';
import { appAdminGroup } from '@transformotion/contracts/_shared/auth';
import {
  DEFAULT_RUN_HISTORY_LIMIT,
  projectRunHistoryForViewer,
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

function mapAccount(item: Record<string, unknown>): NotificationRunAccount {
  const accountId = String(item['accountId'] ?? '');
  const transitions = Array.isArray(item['transitions']) ? item['transitions'] : [];
  const memberOutcomes = Array.isArray(item['memberOutcomes']) ? item['memberOutcomes'] : [];
  return {
    accountId,
    accountName: typeof item['accountName'] === 'string' && item['accountName'] ? item['accountName'] : accountId,
    accountStatus: mapAccountStatus(item['status']),
    transitions: transitions.map((t) => mapTransition(t as Record<string, unknown>)),
    emailsSent: Number(item['emailsSent'] ?? 0),
    memberOutcomes: memberOutcomes.map((o) => mapMemberOutcome(o as Record<string, unknown>)),
  };
}

/** Assemble a contract run from its stored SUMMARY item + ACCT# items. */
function assembleRun(summary: Record<string, unknown>, accountItems: Record<string, unknown>[]): NotificationRunSummary {
  const ranAtEpoch = Number(summary['ranAt'] ?? 0);
  return {
    runId: String(summary['runId'] ?? ''),
    ranAt: new Date(ranAtEpoch * 1000).toISOString(),
    status: (summary['status'] as NotificationRunStatus) ?? 'success',
    accountsEvaluated: Number(summary['accountsEvaluated'] ?? 0),
    emailsSent: Number(summary['emailsSent'] ?? 0),
    accounts: accountItems.map(mapAccount),
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

async function loadAccessibleAccountIds(userId: string): Promise<string[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: ACCOUNT_MEMBERS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ProjectionExpression: 'accountId, appSlug, #r',
    ExpressionAttributeNames: { '#r': 'role' },
  }));
  const rows = (res.Items ?? []) as Array<{ accountId?: string; appSlug?: string; role?: string }>;
  return rows
    .filter((r) => r.appSlug === APP_SLUG && (r.role === 'owner' || r.role === 'manager') && !!r.accountId)
    .map((r) => r.accountId!);
}

export const handler = createHandler({
  loadRecentRuns,
  loadAccessibleAccountIds,
  log: (message, context) => console.log(JSON.stringify({ message, ...context })),
});
