import type {
  NotificationAccountConfig,
  NotificationMemberConsent,
  NotificationType,
} from '@transformotion/contracts/stock-analyser/notification-preferences';
import {
  defaultNotificationAccountConfig,
} from '@transformotion/contracts/stock-analyser/notification-preferences';
import type { PortfolioHolding, WatchlistItem } from '@transformotion/contracts/stock-analyser/types';
import type { StockAnalysisResult } from '../../../lib/services/portfolio/types';

export type ActionableVerdict = 'BUY' | 'SELL';
export type Verdict = ActionableVerdict | 'HOLD' | 'NEUTRAL';
export type NotificationSourceType = 'Portfolio' | 'Watchlist';

export interface MemberRow {
  accountId: string;
  userId: string;
  email?: string;
  role?: string;
  status?: string;
  appSlug?: string;
}

export interface NotificationStateRecord {
  accountId: string;
  sk: string;
  type: NotificationSourceType;
  ticker: string;
  lastVerdict?: Verdict;
  lastNotifiedAt?: number;
  lastProcessedDate?: string;
}

export interface NotificationTransition {
  accountId: string;
  type: NotificationSourceType;
  ticker: string;
  previousVerdict?: Verdict;
  currentVerdict: Verdict;
  actionable: boolean;
  shouldNotify: boolean;
  analysis: StockAnalysisResult;
}

export interface AnalysisGenerationContext {
  accountId: string;
  runId: string;
  sourceType: NotificationSourceType;
}

export interface NotificationEngineDeps {
  today: () => string;
  nowEpochSeconds: () => number;
  listStockAnalyserMembers: () => Promise<MemberRow[]>;
  readNotificationConfig: (accountId: string) => Promise<NotificationAccountConfig | null>;
  readMemberConsent: (accountId: string, userId: string) => Promise<NotificationMemberConsent | null>;
  readLiveMember: (accountId: string, userId: string) => Promise<MemberRow | null>;
  readNotificationStates: (accountId: string) => Promise<NotificationStateRecord[]>;
  putNotificationState: (record: NotificationStateRecord) => Promise<void>;
  readPortfolio: (accountId: string) => Promise<PortfolioHolding[]>;
  readWatchlist: (accountId: string) => Promise<WatchlistItem[]>;
  readSharedAnalysisCache: (ticker: string) => Promise<StockAnalysisResult | null>;
  generateAnalysis: (ticker: string, context?: AnalysisGenerationContext) => Promise<StockAnalysisResult>;
  writeSharedAnalysisCache: (ticker: string, analysis: StockAnalysisResult) => Promise<void>;
  sendEmail: (recipient: MemberRow, transition: NotificationTransition) => Promise<void>;
  log?: (message: string, context?: Record<string, unknown>) => void;
  // ── #572 send-log (audit) ────────────────────────────────────────────────
  /** Mint a run id (injectable so tests are deterministic). */
  newRunId: () => string;
  /** Best-effort account display name (read-time enrichment; falls back to id). */
  readAccountName?: (accountId: string) => Promise<string | undefined>;
  /** Persist the run's audit record (run summary + per-account + member outcomes). */
  recordSendLog: (run: SendLogRun) => Promise<void>;
  /** #571 kill-switch: app-wide `notificationsEnabled` (default ON). */
  readEngineEnabled: () => Promise<boolean>;
  /**
   * #584: warm the market-wide analysis cache (`MARKET#{region}` for each
   * region). Runs ONCE per job execution, AFTER the kill-switch gate, so an
   * engine-OFF run does NO market warming. Optional so unit tests can omit it.
   */
  warmMarketCache?: () => Promise<void>;
  /**
   * #594: warm the ETF caches (`ETF#{market}` for each market) by async-invoking
   * the runEtfs engine. Runs ONCE per job execution, AFTER the kill-switch gate and
   * after the market warm, so an engine-OFF run does NO ETF warming. Optional so
   * unit tests can omit it.
   */
  warmEtfsCache?: () => Promise<void>;
}

export interface NotificationEngineResult {
  accountsDiscovered: number;
  accountsProcessed: number;
  accountsSkippedNotDue: number;
  accountsSkippedNoConsent: number;
  transitionsFired: number;
  emailsSent: number;
  /** #572: the audit record assembled for this run (also persisted via deps). */
  sendLog: SendLogRun;
}

// ── #572 send-log record schema (run → per-account → embedded member leaf) ───
export type SendLogReason =
  | 'delivered'                  // sent
  | 'consent-off'                // gated: member has not opted in
  | 'disabled'                   // gated: member status !== active
  | 'viewer'                     // gated: viewers never receive
  | 'not-a-member'               // gated: no live membership row
  | 'lookup-error'               // gated: live/consent read failed (fail-closed)
  | 'no-actionable-transition'   // eligible, but no ticker transition fired this run
  | 'account-not-due';           // eligible, but the account's interval had not elapsed

/** A member's leaf outcome — identity + reason kept (NOT counts): the verification signal. */
export interface MemberOutcome {
  userId: string;
  email?: string;
  outcome: 'sent' | 'skipped';
  reason: SendLogReason;
  /** For `sent`: which ticker transitions were delivered to this member. */
  tickers?: string[];
}

export interface SendLogTransition {
  ticker: string;
  type: NotificationSourceType;
  fromVerdict?: Verdict;
  toVerdict: Verdict;
}

export type SendLogAccountStatus =
  | 'processed'
  | 'skipped-not-due'
  | 'skipped-no-eligible'
  | 'failed';

export interface SendLogAccount {
  accountId: string;
  accountName?: string;
  status: SendLogAccountStatus;
  transitions: SendLogTransition[];
  emailsSent: number;
  memberOutcomes: MemberOutcome[];
  error?: string;
}

export type SendLogStatus = 'success' | 'partial' | 'failed';

export interface SendLogRun {
  runId: string;
  ranAt: number;                 // epoch seconds
  status: SendLogStatus;
  accountsEvaluated: number;
  accountsProcessed: number;
  accountsSkippedNotDue: number;
  accountsSkippedNoEligible: number;
  emailsSent: number;
  accounts: SendLogAccount[];
  error?: string;
  /** #571: set to `engine-disabled` when the run no-op'd because the kill-switch was OFF. */
  note?: string;
}

export function stateSk(type: NotificationSourceType, ticker: string): string {
  return `NOTIF#${type}#${ticker.toUpperCase()}`;
}

/**
 * Build a member's leaf outcome with `email` OMITTED when the member has none
 * (#578). A member with no email must yield `{ userId, outcome, reason }` — NOT
 * `{ email: undefined, ... }`. The DynamoDB DocumentClient rejects `undefined`
 * by default, and one such value previously threw mid-write and dropped every
 * subsequent account from the send-log (run fd4461f3). Keep the record clean at
 * the source; the marshaller's `removeUndefinedValues` is only the safety net.
 */
function memberOutcome(
  userId: string,
  email: string | undefined,
  outcome: MemberOutcome['outcome'],
  reason: SendLogReason,
  tickers?: string[],
): MemberOutcome {
  return {
    userId,
    ...(email ? { email } : {}),
    outcome,
    reason,
    ...(tickers && tickers.length > 0 ? { tickers } : {}),
  };
}

function coerceVerdict(value: unknown): Verdict {
  const upper = String(value ?? '').toUpperCase();
  return upper === 'BUY' || upper === 'SELL' || upper === 'HOLD' || upper === 'NEUTRAL' ? upper : 'NEUTRAL';
}

function actionableFor(type: NotificationSourceType): Set<Verdict> {
  return type === 'Portfolio' ? new Set<Verdict>(['BUY', 'SELL']) : new Set<Verdict>(['BUY']);
}

export function evaluateTransition(input: {
  accountId: string;
  type: NotificationSourceType;
  ticker: string;
  analysis: StockAnalysisResult;
  previous?: NotificationStateRecord;
}): NotificationTransition {
  const currentVerdict = coerceVerdict(input.analysis.verdict);
  const actionable = actionableFor(input.type).has(currentVerdict);
  const previousVerdict = input.previous?.lastVerdict;
  return {
    accountId: input.accountId,
    type: input.type,
    ticker: input.ticker.toUpperCase(),
    previousVerdict,
    currentVerdict,
    actionable,
    shouldNotify: actionable && currentVerdict !== previousVerdict,
    analysis: input.analysis,
  };
}

function daysBetween(dateA: string, dateB: string): number {
  const a = Date.parse(`${dateA}T00:00:00.000Z`);
  const b = Date.parse(`${dateB}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((b - a) / 86_400_000);
}

export function accountIsDue(states: NotificationStateRecord[], intervalDays: number, today: string): boolean {
  const processedDates = states
    .map((state) => state.lastProcessedDate)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort();
  const lastProcessedDate = processedDates.at(-1);
  if (!lastProcessedDate) return true;
  return daysBetween(lastProcessedDate, today) >= Math.max(1, Math.floor(intervalDays));
}

export function groupMembersByAccount(members: MemberRow[]): Map<string, MemberRow[]> {
  const grouped = new Map<string, MemberRow[]>();
  for (const member of members) {
    if (member.appSlug !== 'stock-analyser') continue;
    if (!member.accountId || !member.userId) continue;
    const rows = grouped.get(member.accountId) ?? [];
    rows.push(member);
    grouped.set(member.accountId, rows);
  }
  return grouped;
}

/** Gate reasons an evaluation can carry (the eligible case has no skip reason). */
export type GateReason = 'consent-off' | 'disabled' | 'viewer' | 'not-a-member' | 'lookup-error';

export interface RecipientDecision {
  candidate: MemberRow;
  /** The live-merged recipient (present iff eligible). */
  recipient?: MemberRow;
  eligible: boolean;
  skipReason?: GateReason;
}

/**
 * #572: evaluate EVERY candidate and emit its decision + gate reason — not just
 * the survivors. The reason was always computed at each gate; previously each
 * skip was a bare `continue` that discarded it. Capturing it here is the
 * mechanism behind skip-with-reason in the send-log and the adversarial test.
 */
export async function evaluateRecipients(
  deps: Pick<NotificationEngineDeps, 'readLiveMember' | 'readMemberConsent' | 'log'>,
  accountId: string,
  candidates: MemberRow[],
): Promise<RecipientDecision[]> {
  const decisions: RecipientDecision[] = [];
  for (const candidate of candidates) {
    let live: MemberRow | null;
    let consent: NotificationMemberConsent | null;
    try {
      live = await deps.readLiveMember(accountId, candidate.userId);
      consent = await deps.readMemberConsent(accountId, candidate.userId);
    } catch (err) {
      deps.log?.('delivery-gate-skip-lookup-error', { accountId, userId: candidate.userId, err: String(err) });
      decisions.push({ candidate, eligible: false, skipReason: 'lookup-error' });
      continue;
    }
    if (!live) { decisions.push({ candidate, eligible: false, skipReason: 'not-a-member' }); continue; }
    if (live.status && live.status !== 'active') { decisions.push({ candidate, eligible: false, skipReason: 'disabled' }); continue; }
    if (live.role === 'viewer') { decisions.push({ candidate, eligible: false, skipReason: 'viewer' }); continue; }
    if (!consent?.receiveConsent) { decisions.push({ candidate, eligible: false, skipReason: 'consent-off' }); continue; }
    decisions.push({ candidate, eligible: true, recipient: { ...candidate, ...live, email: live.email ?? candidate.email } });
  }
  return decisions;
}

/** Derived: the live-merged recipients who passed every gate (compat helper). */
export async function eligibleRecipients(
  deps: Pick<NotificationEngineDeps, 'readLiveMember' | 'readMemberConsent' | 'log'>,
  accountId: string,
  candidates: MemberRow[],
): Promise<MemberRow[]> {
  const decisions = await evaluateRecipients(deps, accountId, candidates);
  return decisions.filter((d) => d.eligible && d.recipient).map((d) => d.recipient!);
}

function configEnablesType(config: NotificationAccountConfig, type: NotificationSourceType): boolean {
  const notificationType: NotificationType = type === 'Portfolio' ? 'portfolio' : 'watchlist';
  return config.activeTypes.includes(notificationType);
}

function createAnalysisResolver(deps: NotificationEngineDeps) {
  const memo = new Map<string, Promise<StockAnalysisResult>>();
  return (ticker: string, context?: AnalysisGenerationContext): Promise<StockAnalysisResult> => {
    const normalisedTicker = ticker.toUpperCase();
    const existing = memo.get(normalisedTicker);
    if (existing) return existing;

    const promise = (async () => {
      const cached = await deps.readSharedAnalysisCache(normalisedTicker);
      if (cached) return cached;

      const generated = await deps.generateAnalysis(normalisedTicker, context);
      await deps.writeSharedAnalysisCache(normalisedTicker, generated);
      return generated;
    })();
    memo.set(normalisedTicker, promise);
    return promise;
  };
}

async function processTicker(
  deps: NotificationEngineDeps,
  resolveAnalysis: (ticker: string, context?: AnalysisGenerationContext) => Promise<StockAnalysisResult>,
  accountId: string,
  runId: string,
  type: NotificationSourceType,
  ticker: string,
  previous: NotificationStateRecord | undefined,
  eligible: MemberRow[],
  today: string,
): Promise<{ transition: NotificationTransition; sentUserIds: string[]; sent: number }> {
  const normalisedTicker = ticker.toUpperCase();
  const analysis = await resolveAnalysis(normalisedTicker, { accountId, runId, sourceType: type });

  const transition = evaluateTransition({ accountId, type, ticker: normalisedTicker, analysis, previous });
  const sentUserIds: string[] = [];
  let sent = 0;
  if (transition.shouldNotify) {
    // Eligibility is computed ONCE per account now (the previous per-ticker
    // re-evaluation is gone); every eligible member receives the fired transition.
    for (const recipient of eligible) {
      if (!recipient.email) continue;
      await deps.sendEmail(recipient, transition);
      sentUserIds.push(recipient.userId);
      sent += 1;
    }
  }

  await deps.putNotificationState({
    accountId,
    sk: stateSk(type, normalisedTicker),
    type,
    ticker: normalisedTicker,
    lastVerdict: transition.currentVerdict,
    lastNotifiedAt: sent > 0 ? deps.nowEpochSeconds() : previous?.lastNotifiedAt,
    lastProcessedDate: today,
  });

  return { transition, sentUserIds, sent };
}

/**
 * #572 tripwire: leakage is impossible by construction (groupMembersByAccount
 * only pairs a member with their OWN account) — so we VERIFY it every run.
 * Every outcome's userId must be a real candidate member of this account.
 */
export function assertNoCrossAccount(
  deps: Pick<NotificationEngineDeps, 'log'>,
  accountId: string,
  candidateMembers: MemberRow[],
  account: SendLogAccount,
): void {
  const members = new Set(candidateMembers.map((m) => m.userId));
  for (const outcome of account.memberOutcomes) {
    if (!members.has(outcome.userId)) {
      deps.log?.('cross-account-leak-detected', { accountId, userId: outcome.userId, outcome: outcome.outcome });
      account.error = `cross-account leak: ${outcome.userId} is not a member of ${accountId}`;
    }
  }
}

async function processAccount(
  deps: NotificationEngineDeps,
  resolveAnalysis: (ticker: string, context?: AnalysisGenerationContext) => Promise<StockAnalysisResult>,
  accountId: string,
  accountName: string | undefined,
  candidateMembers: MemberRow[],
  today: string,
  result: NotificationEngineResult,
  sendLog: SendLogRun,
): Promise<SendLogAccount> {

  const decisions = await evaluateRecipients(deps, accountId, candidateMembers);
  const eligible = decisions.filter((d) => d.eligible && d.recipient).map((d) => d.recipient!);
  const gatedOutcomes: MemberOutcome[] = decisions
    .filter((d) => !d.eligible)
    .map((d) => memberOutcome(d.candidate.userId, d.candidate.email, 'skipped', d.skipReason!));

  // No eligible recipients → skip account (every member is gated).
  if (eligible.length === 0) {
    result.accountsSkippedNoConsent += 1;
    sendLog.accountsSkippedNoEligible += 1;
    const account: SendLogAccount = { accountId, accountName, status: 'skipped-no-eligible', transitions: [], emailsSent: 0, memberOutcomes: gatedOutcomes };
    assertNoCrossAccount(deps, accountId, candidateMembers, account);
    return account;
  }

  const [configFromStore, states] = await Promise.all([
    deps.readNotificationConfig(accountId),
    deps.readNotificationStates(accountId),
  ]);
  const config = configFromStore ?? defaultNotificationAccountConfig(accountId, `${today}T00:00:00.000Z`);

  // Not due → skip; eligible members carry account-not-due, gated keep their reason.
  if (!accountIsDue(states, config.intervalDays, today)) {
    result.accountsSkippedNotDue += 1;
    sendLog.accountsSkippedNotDue += 1;
    const memberOutcomes: MemberOutcome[] = [
      ...gatedOutcomes,
      ...eligible.map((r): MemberOutcome => memberOutcome(r.userId, r.email, 'skipped', 'account-not-due')),
    ];
    const account: SendLogAccount = { accountId, accountName, status: 'skipped-not-due', transitions: [], emailsSent: 0, memberOutcomes };
    assertNoCrossAccount(deps, accountId, candidateMembers, account);
    return account;
  }

  // Process: evaluate each ticker once over the shared eligible set.
  const statesByKey = new Map(states.map((state) => [state.sk, state]));
  const work: Array<{ type: NotificationSourceType; ticker: string }> = [];
  if (configEnablesType(config, 'Portfolio')) {
    for (const holding of await deps.readPortfolio(accountId)) work.push({ type: 'Portfolio', ticker: holding.ticker });
  }
  if (configEnablesType(config, 'Watchlist')) {
    for (const item of await deps.readWatchlist(accountId)) work.push({ type: 'Watchlist', ticker: item.ticker });
  }

  const transitions: SendLogTransition[] = [];
  const sentTickersByUser = new Map<string, string[]>();
  let emailsSent = 0;

  for (const item of work) {
    const processed = await processTicker(
      deps,
      resolveAnalysis,
      accountId,
      sendLog.runId,
      item.type,
      item.ticker,
      statesByKey.get(stateSk(item.type, item.ticker)),
      eligible,
      today,
    );
    if (processed.transition.shouldNotify) {
      result.transitionsFired += 1;
      transitions.push({
        ticker: processed.transition.ticker,
        type: item.type,
        fromVerdict: processed.transition.previousVerdict,
        toVerdict: processed.transition.currentVerdict,
      });
      for (const uid of processed.sentUserIds) {
        sentTickersByUser.set(uid, [...(sentTickersByUser.get(uid) ?? []), processed.transition.ticker]);
      }
    }
    emailsSent += processed.sent;
  }

  result.accountsProcessed += 1;
  result.emailsSent += emailsSent;
  sendLog.accountsProcessed += 1;
  sendLog.emailsSent += emailsSent;

  const memberOutcomes: MemberOutcome[] = [
    ...gatedOutcomes,
    ...eligible.map((r): MemberOutcome => {
      const tickers = sentTickersByUser.get(r.userId);
      return tickers && tickers.length > 0
        ? memberOutcome(r.userId, r.email, 'sent', 'delivered', tickers)
        : memberOutcome(r.userId, r.email, 'skipped', 'no-actionable-transition');
    }),
  ];

  const account: SendLogAccount = { accountId, accountName, status: 'processed', transitions, emailsSent, memberOutcomes };
  assertNoCrossAccount(deps, accountId, candidateMembers, account);
  return account;
}

export async function runNotificationEngine(deps: NotificationEngineDeps): Promise<NotificationEngineResult> {
  const sendLog: SendLogRun = {
    runId: deps.newRunId(),
    ranAt: deps.nowEpochSeconds(),
    status: 'success',
    accountsEvaluated: 0,
    accountsProcessed: 0,
    accountsSkippedNotDue: 0,
    accountsSkippedNoEligible: 0,
    emailsSent: 0,
    accounts: [],
  };
  const result: NotificationEngineResult = {
    accountsDiscovered: 0,
    accountsProcessed: 0,
    accountsSkippedNotDue: 0,
    accountsSkippedNoConsent: 0,
    transitionsFired: 0,
    emailsSent: 0,
    sendLog,
  };

  let runError: unknown;
  try {
    // #571 kill-switch (OPTION A): flag-checked early-return at the TOP of the run.
    // EventBridge still fires daily and is UNCHANGED; the job simply no-ops when
    // OFF. A minimal `engine-disabled` audit record is written (via the finally)
    // so the history shows the engine fired-but-skipped. Re-enable = flag flip.
    if (!(await deps.readEngineEnabled())) {
      sendLog.note = 'engine-disabled';
      deps.log?.('notification-engine-disabled-skip', { runId: sendLog.runId });
      return result;
    }

    // #584: warm the market-wide analysis cache ONCE per run, AFTER the
    // kill-switch gate (engine OFF → no warming AND no sends — the switch pauses
    // the WHOLE batch, the bigger AI-credit consumer). Best-effort: a warming
    // failure must never abort the notification run.
    try {
      await deps.warmMarketCache?.();
    } catch (err) {
      deps.log?.('notification-market-warm-error', { err: String(err) });
    }

    // #594: warm the ETF#{market} caches (all 3 markets) AFTER the market warm and
    // under the same kill-switch gate. Independent best-effort concern: an ETF
    // warming failure must never abort the notification run (or the market warm).
    try {
      await deps.warmEtfsCache?.();
    } catch (err) {
      deps.log?.('notification-etfs-warm-error', { err: String(err) });
    }

    const today = deps.today();
    const grouped = groupMembersByAccount(await deps.listStockAnalyserMembers());
    const resolveAnalysis = createAnalysisResolver(deps);
    result.accountsDiscovered = grouped.size;
    sendLog.accountsEvaluated = grouped.size;

    for (const [accountId, candidateMembers] of grouped) {
      // Resolve the display name HERE (#581), independently of processing — it's a
      // separate best-effort lookup, so an errored account still records its name
      // rather than falling back to a raw GUID in run-history.
      const accountName = deps.readAccountName
        ? await deps.readAccountName(accountId).catch(() => undefined)
        : undefined;
      // Per-account guard (#572): one account's failure is RECORDED and downgrades
      // the run to `partial` — it never loses the whole run's audit record.
      try {
        sendLog.accounts.push(await processAccount(deps, resolveAnalysis, accountId, accountName, candidateMembers, today, result, sendLog));
      } catch (err) {
        deps.log?.('notification-account-error', { accountId, err: String(err) });
        sendLog.accounts.push({ accountId, ...(accountName ? { accountName } : {}), status: 'failed', transitions: [], emailsSent: 0, memberOutcomes: [], error: String((err as Error)?.message ?? err) });
        sendLog.status = 'partial';
      }
    }
  } catch (err) {
    // Run-level failure (e.g. member listing) — status failed; still recorded.
    runError = err;
    sendLog.status = 'failed';
    sendLog.error = String((err as Error)?.message ?? err);
    deps.log?.('notification-run-error', { err: String(err) });
  } finally {
    // Summary (+ all records) written in finally so a failed run still leaves an
    // audit trail — an audit log that vanishes on failure is worthless.
    try {
      await deps.recordSendLog(sendLog);
    } catch (logErr) {
      deps.log?.('notification-send-log-write-error', { err: String(logErr) });
    }
  }

  if (runError) throw runError; // preserve the failure signal to EventBridge/Lambda
  return result;
}
