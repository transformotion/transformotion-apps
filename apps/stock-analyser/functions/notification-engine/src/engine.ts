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
  generateAnalysis: (ticker: string) => Promise<StockAnalysisResult>;
  writeSharedAnalysisCache: (ticker: string, analysis: StockAnalysisResult) => Promise<void>;
  sendEmail: (recipient: MemberRow, transition: NotificationTransition) => Promise<void>;
  log?: (message: string, context?: Record<string, unknown>) => void;
}

export interface NotificationEngineResult {
  accountsDiscovered: number;
  accountsProcessed: number;
  accountsSkippedNotDue: number;
  accountsSkippedNoConsent: number;
  transitionsFired: number;
  emailsSent: number;
}

export function stateSk(type: NotificationSourceType, ticker: string): string {
  return `NOTIF#${type}#${ticker.toUpperCase()}`;
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

export async function eligibleRecipients(
  deps: Pick<NotificationEngineDeps, 'readLiveMember' | 'readMemberConsent' | 'log'>,
  accountId: string,
  candidates: MemberRow[],
): Promise<MemberRow[]> {
  const recipients: MemberRow[] = [];
  for (const candidate of candidates) {
    let live: MemberRow | null;
    let consent: NotificationMemberConsent | null;
    try {
      live = await deps.readLiveMember(accountId, candidate.userId);
      consent = await deps.readMemberConsent(accountId, candidate.userId);
    } catch (err) {
      deps.log?.('delivery-gate-skip-lookup-error', { accountId, userId: candidate.userId, err: String(err) });
      continue;
    }
    if (!live) continue;
    if (live.status && live.status !== 'active') continue;
    if (live.role === 'viewer') continue;
    if (!consent?.receiveConsent) continue;
    recipients.push({ ...candidate, ...live, email: live.email ?? candidate.email });
  }
  return recipients;
}

function configEnablesType(config: NotificationAccountConfig, type: NotificationSourceType): boolean {
  const notificationType: NotificationType = type === 'Portfolio' ? 'portfolio' : 'watchlist';
  return config.activeTypes.includes(notificationType);
}

async function processTicker(
  deps: NotificationEngineDeps,
  accountId: string,
  type: NotificationSourceType,
  ticker: string,
  previous: NotificationStateRecord | undefined,
  candidateMembers: MemberRow[],
  today: string,
): Promise<{ fired: number; sent: number }> {
  const normalisedTicker = ticker.toUpperCase();
  const analysis = await deps.generateAnalysis(normalisedTicker);
  await deps.writeSharedAnalysisCache(normalisedTicker, analysis);

  const transition = evaluateTransition({ accountId, type, ticker: normalisedTicker, analysis, previous });
  let sent = 0;
  if (transition.shouldNotify) {
    const recipients = await eligibleRecipients(deps, accountId, candidateMembers);
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      await deps.sendEmail(recipient, transition);
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

  return { fired: transition.shouldNotify ? 1 : 0, sent };
}

export async function runNotificationEngine(deps: NotificationEngineDeps): Promise<NotificationEngineResult> {
  const result: NotificationEngineResult = {
    accountsDiscovered: 0,
    accountsProcessed: 0,
    accountsSkippedNotDue: 0,
    accountsSkippedNoConsent: 0,
    transitionsFired: 0,
    emailsSent: 0,
  };

  const today = deps.today();
  const grouped = groupMembersByAccount(await deps.listStockAnalyserMembers());
  result.accountsDiscovered = grouped.size;

  for (const [accountId, candidateMembers] of grouped) {
    const recipients = await eligibleRecipients(deps, accountId, candidateMembers);
    if (recipients.length === 0) {
      result.accountsSkippedNoConsent += 1;
      continue;
    }

    const [configFromStore, states] = await Promise.all([
      deps.readNotificationConfig(accountId),
      deps.readNotificationStates(accountId),
    ]);
    const config = configFromStore ?? defaultNotificationAccountConfig(accountId, `${today}T00:00:00.000Z`);

    if (!accountIsDue(states, config.intervalDays, today)) {
      result.accountsSkippedNotDue += 1;
      continue;
    }

    const statesByKey = new Map(states.map((state) => [state.sk, state]));
    const work: Array<{ type: NotificationSourceType; ticker: string }> = [];
    if (configEnablesType(config, 'Portfolio')) {
      const holdings = await deps.readPortfolio(accountId);
      for (const holding of holdings) work.push({ type: 'Portfolio', ticker: holding.ticker });
    }
    if (configEnablesType(config, 'Watchlist')) {
      const items = await deps.readWatchlist(accountId);
      for (const item of items) work.push({ type: 'Watchlist', ticker: item.ticker });
    }

    for (const item of work) {
      const processed = await processTicker(
        deps,
        accountId,
        item.type,
        item.ticker,
        statesByKey.get(stateSk(item.type, item.ticker)),
        candidateMembers,
        today,
      );
      result.transitionsFired += processed.fired;
      result.emailsSent += processed.sent;
    }

    result.accountsProcessed += 1;
  }

  return result;
}
