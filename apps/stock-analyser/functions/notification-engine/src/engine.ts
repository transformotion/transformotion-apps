import type {
  NotificationAccountConfig,
  NotificationMemberConsent,
  NotificationType,
  WarmSurface,
  WarmSurfaces,
  WarmSurfaceState,
} from '@transformotion/contracts/stock-analyser/notification-preferences';
import {
  defaultNotificationAccountConfig,
  resolveWarmSurfaceState,
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
   * Per-surface warm gates (M19). Read ONCE per run, AFTER the kill-switch gate.
   * `undefined` (absent config) ⇒ every surface ON (zero-migration default).
   * Optional so unit tests can omit it (⇒ all surfaces warm).
   */
  readWarmSurfaces?: () => Promise<WarmSurfaces | undefined>;
  /**
   * #584: warm the market-wide analysis cache (`MARKET#{region}` for each
   * region). Runs ONCE per job execution, AFTER the kill-switch gate, so an
   * engine-OFF run does NO market warming. Optional so unit tests can omit it.
   *
   * `opts.warmRecs` carries the resolved Recs gate: the market warm fans Recs out
   * per region (#595) ONLY when Recs is effective this run (recs flag ON AND —
   * enforced upstream — market flag ON). With `warmRecs:false` the market cache is
   * still warmed but NO Recs are fanned out.
   */
  warmMarketCache?: (opts?: { warmRecs: boolean }) => Promise<void>;
  /**
   * Distinct Portfolio/Watchlist ticker warm-set across ALL accounts — the union
   * of holdings from whichever of `opts.portfolio` / `opts.watchlist` is ON. No
   * consent/eligibility filter (the warm produces SHARED, non-account-private
   * `ANALYSIS#`; consent gates SENDS only). Optional so unit tests can omit it
   * (⇒ empty warm-set). Backs the unconditional P&W `ANALYSIS#` warm step.
   */
  listWarmTickers?: (opts: { portfolio: boolean; watchlist: boolean }) => Promise<string[]>;
  /**
   * #594: warm the ETF caches (`ETF#{market}` for each market) by async-invoking
   * the runEtfs engine. Runs ONCE per job execution, AFTER the kill-switch gate and
   * after the market warm, so an engine-OFF run does NO ETF warming. Optional so
   * unit tests can omit it.
   */
  warmEtfsCache?: () => Promise<void>;
  /**
   * #627: warm the Metals cache (the single global `METALS` key) by async-invoking
   * the runMetals engine. Runs ONCE per job execution, AFTER the kill-switch gate and
   * after the ETF warm, so an engine-OFF run does NO Metals warming. Optional so unit
   * tests can omit it.
   */
  warmMetalsCache?: () => Promise<void>;
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
  /**
   * #579: tickers whose evaluation was SKIPPED this run because no fresh ANALYSIS#
   * entry existed (Option B pure-reader). Surfaced in run-history detail as the
   * "why didn't I get notified about X" answer. Omitted when empty.
   */
  skippedTickers?: string[];
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

/**
 * M19 P&W warm step: compute + SHARED-write `ANALYSIS#{ticker}` for the distinct
 * union of Portfolio/Watchlist holdings across ALL accounts (whichever surfaces
 * are effective this run), via the SAME cache-first compute path a live Analyser
 * run uses (`createAnalysisResolver`: read SHARED cache → else generate → write).
 * Cache-first ⇒ a same-day fresh entry is a skip (no model call). No consent /
 * eligibility filter — the warm produces SHARED, non-account-private results, so
 * there is nothing private to gate (consent gates SENDS, not the warm-set).
 * Per-ticker best-effort: one ticker's failure never blocks the rest.
 */
async function warmPortfolioWatchlist(
  deps: NotificationEngineDeps,
  warm: Record<WarmSurface, WarmSurfaceState>,
): Promise<void> {
  const resolveAnalysis = createAnalysisResolver(deps);
  const tickers = (await deps.listWarmTickers?.({
    portfolio: warm.portfolio.effective,
    watchlist: warm.watchlist.effective,
  })) ?? [];
  let warmed = 0;
  let failed = 0;
  for (const ticker of tickers) {
    try {
      await resolveAnalysis(ticker);
      warmed += 1;
    } catch (err) {
      failed += 1;
      deps.log?.('notification-pw-warm-ticker-error', { ticker, err: String(err) });
    }
  }
  deps.log?.('notification-pw-warm-complete', {
    tickerCount: tickers.length,
    warmed,
    failed,
    portfolio: warm.portfolio.effective,
    watchlist: warm.watchlist.effective,
  });
}

type ProcessedTicker =
  | { skipped: true }
  | { skipped?: false; transition: NotificationTransition; sentUserIds: string[]; sent: number };

async function processTicker(
  deps: NotificationEngineDeps,
  accountId: string,
  runId: string,
  type: NotificationSourceType,
  ticker: string,
  previous: NotificationStateRecord | undefined,
  eligible: MemberRow[],
  today: string,
): Promise<ProcessedTicker> {
  const normalisedTicker = ticker.toUpperCase();
  // Option B (M19): notification evaluation is a PURE READER of the SHARED
  // ANALYSIS# cache — it NEVER computes on miss (the resolver's compute path is
  // invoked only by the warm step). A missing/stale entry ⇒ skip this ticker's
  // evaluation this run (logged, not an error). Consequence-by-design: a surface
  // whose warm flag is OFF writes no ANALYSIS#, so its notifications are simply
  // not generated — the warm flag is the single spend lever.
  const analysis = await deps.readSharedAnalysisCache(normalisedTicker);
  if (!analysis) {
    deps.log?.('notification-eval-skip-no-analysis', { accountId, runId, type, ticker: normalisedTicker });
    return { skipped: true };
  }

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
  const skippedTickers: string[] = [];
  let emailsSent = 0;

  for (const item of work) {
    const processed = await processTicker(
      deps,
      accountId,
      sendLog.runId,
      item.type,
      item.ticker,
      statesByKey.get(stateSk(item.type, item.ticker)),
      eligible,
      today,
    );
    // Option B: no ANALYSIS# for this ticker this run → evaluation skipped (no
    // transition, no state write, no send). Neither a fire nor a failure — but
    // RECORDED (#579) so run-history can answer "why didn't I get notified about X".
    if (processed.skipped) {
      skippedTickers.push(item.ticker.toUpperCase());
      continue;
    }
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

  const account: SendLogAccount = {
    accountId,
    accountName,
    status: 'processed',
    transitions,
    emailsSent,
    memberOutcomes,
    ...(skippedTickers.length > 0 ? { skippedTickers } : {}),
  };
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

    // Per-surface warm gates (M19). Read ONCE, AFTER the master kill-switch —
    // absent config ⇒ every surface ON (zero-migration). `resolveWarmSurfaceState`
    // applies the one cross-surface dependency (recs⇒market): Recs is effective
    // only when BOTH recs and market flags are ON, and (enforced inside
    // warmMarketCache via `warmRecs`) fans out only after a region's market warm
    // SUCCEEDS. recs-on + market-off ⇒ recs suppressed, logged.
    const warmSurfaces = await deps.readWarmSurfaces?.();
    const warm = resolveWarmSurfaceState(warmSurfaces);
    if (warm.recs.blockedBy === 'market') {
      deps.log?.('notification-recs-warm-suppressed-market-off', {});
    }

    // #584: warm MARKET#{region} ONCE per run, AFTER the kill-switch gate (engine
    // OFF → no warming AND no sends). #595 Recs fan-out is carried by `warmRecs`.
    // Best-effort: a warming failure must never abort the notification run.
    if (warm.market.effective) {
      try {
        await deps.warmMarketCache?.({ warmRecs: warm.recs.effective });
      } catch (err) {
        deps.log?.('notification-market-warm-error', { err: String(err) });
      }
    } else {
      deps.log?.('notification-market-warm-skipped-flag-off', {});
    }

    // #594: warm the ETF#{market} caches (all 3 markets). Independent best-effort
    // concern: an ETF warming failure must never abort the run (or sibling warms).
    if (warm.etfs.effective) {
      try {
        await deps.warmEtfsCache?.();
      } catch (err) {
        deps.log?.('notification-etfs-warm-error', { err: String(err) });
      }
    } else {
      deps.log?.('notification-etfs-warm-skipped-flag-off', {});
    }

    // #627: warm the METALS cache. Independent best-effort concern.
    if (warm.metals.effective) {
      try {
        await deps.warmMetalsCache?.();
      } catch (err) {
        deps.log?.('notification-metals-warm-error', { err: String(err) });
      }
    } else {
      deps.log?.('notification-metals-warm-skipped-flag-off', {});
    }

    // M19 P&W: unconditional per-ticker ANALYSIS# warm for the distinct union of
    // Portfolio/Watchlist holdings (whichever surfaces are effective), DECOUPLED
    // from the notification due/eligibility/type gates. Runs AFTER the list warms,
    // BEFORE the notification loop, so evaluation (a pure reader) finds warm
    // entries. Best-effort: any failure is logged and never aborts the run.
    if (warm.portfolio.effective || warm.watchlist.effective) {
      try {
        await warmPortfolioWatchlist(deps, warm);
      } catch (err) {
        deps.log?.('notification-pw-warm-error', { err: String(err) });
      }
    }

    const today = deps.today();
    const grouped = groupMembersByAccount(await deps.listStockAnalyserMembers());
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
        sendLog.accounts.push(await processAccount(deps, accountId, accountName, candidateMembers, today, result, sendLog));
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
