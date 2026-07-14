import type { Subcategory, Transaction } from "./contracts";

/**
 * Savings "pot" calculations — pure, no fetching. A pot is a `Subcategory`
 * carrying pot metadata (`potOpeningBalance`, `potTarget`, `potDeadline`).
 *
 * SIGN CONVENTION (behaviour.md § "Savings pots"): amounts are SIGNED —
 * a contribution is positive, a withdrawal negative — so the raw transaction
 * amount IS the signed contribution. This supersedes the prior `Math.abs`
 * treatment.
 */

/** Trailing window (months) used to average the current contribution rate. */
const CONTRIBUTION_WINDOW_MONTHS = 3;

// ── month helpers (YYYY-MM) ───────────────────────────────────────────────────

function txMonthKey(tx: Transaction): string | null {
  const p = tx.date.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}` : null;
}

/** Absolute month ordinal for a YYYY-MM key (year*12 + monthIndex). */
function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

function monthFromIndex(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Inclusive list of YYYY-MM keys from start..end. */
function enumerateMonths(start: string, end: string): string[] {
  const a = monthIndex(start);
  const b = monthIndex(end);
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(monthFromIndex(i));
  return out;
}

function signedAmount(tx: Transaction): number {
  return parseFloat(tx.amount) || 0;
}

function potTransactions(sub: Subcategory, transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => t.subcategoryId === sub.subcategoryId);
}

/** Signed sum of `potTx` up to and including `month` (YYYY-MM). */
function signedSumUpTo(potTx: Transaction[], month: string): number {
  return potTx.reduce((s, t) => {
    const k = txMonthKey(t);
    return k !== null && k <= month ? s + signedAmount(t) : s;
  }, 0);
}

// ── pot calculations ──────────────────────────────────────────────────────────

/**
 * Current pot balance = openingBalance (default 0) + the SIGNED sum of ALL
 * transactions in that subcategory across full history.
 */
export function potBalance(sub: Subcategory, transactions: Transaction[]): number {
  const opening = sub.potOpeningBalance ?? 0;
  return potTransactions(sub, transactions).reduce((s, t) => s + signedAmount(t), opening);
}

export interface PotMonthBalance {
  month: string;
  balance: number;
}

/**
 * Month-end balances for a pot across [startMonth..endMonth] inclusive. Each
 * point is opening + the signed sum of the pot's transactions up to that
 * month-end (cumulative trajectory).
 */
export function potMonthEndBalances(
  sub: Subcategory,
  transactions: Transaction[],
  startMonth: string,
  endMonth: string,
): PotMonthBalance[] {
  const opening = sub.potOpeningBalance ?? 0;
  const potTx = potTransactions(sub, transactions);
  return enumerateMonths(startMonth, endMonth).map((month) => ({
    month,
    balance: opening + signedSumUpTo(potTx, month),
  }));
}

export interface PotProjection {
  asOfMonth: string;
  currentBalance: number;
  /** Trailing-3-month average net monthly contribution (signed). */
  contributionRate: number;
  /**
   * Monthly amount needed to reach `potTarget` by `potDeadline`. `null` when
   * either is unset or the deadline is not in the future.
   */
  requiredRate: number | null;
  /**
   * Months earlier (+) / later (−) than `potDeadline` the pot is projected to
   * hit `potTarget` at the current contribution rate. `null` when not
   * computable (no target/deadline; or rate ≤ 0 while still short of target).
   * A negative value is the behind-pace case.
   */
  monthsDelta: number | null;
}

/**
 * Projection for a pot as of `asOfMonth` (YYYY-MM): the current contribution
 * rate (trailing-3-month average), the rate required to hit `potTarget` by
 * `potDeadline`, and the early/late month delta at the current rate.
 */
export function potProjection(
  sub: Subcategory,
  transactions: Transaction[],
  asOfMonth: string,
): PotProjection {
  const opening = sub.potOpeningBalance ?? 0;
  const potTx = potTransactions(sub, transactions);
  const currentBalance = opening + signedSumUpTo(potTx, asOfMonth);

  // Trailing N months: asOfMonth and the N-1 months before it.
  const endIdx = monthIndex(asOfMonth);
  const startIdx = endIdx - (CONTRIBUTION_WINDOW_MONTHS - 1);
  const windowTotal = potTx.reduce((s, t) => {
    const k = txMonthKey(t);
    if (k === null) return s;
    const i = monthIndex(k);
    return i >= startIdx && i <= endIdx ? s + signedAmount(t) : s;
  }, 0);
  const contributionRate = windowTotal / CONTRIBUTION_WINDOW_MONTHS;

  let requiredRate: number | null = null;
  let monthsDelta: number | null = null;

  if (typeof sub.potTarget === "number" && sub.potDeadline) {
    const monthsToDeadline = monthIndex(sub.potDeadline) - endIdx;
    const remaining = sub.potTarget - currentBalance;

    if (monthsToDeadline > 0) {
      requiredRate = remaining / monthsToDeadline;
    }

    if (remaining <= 0) {
      // Already at/over target → as many months early as the deadline is away.
      monthsDelta = monthsToDeadline;
    } else if (contributionRate > 0) {
      const monthsToTarget = remaining / contributionRate;
      // + = reaches target before the deadline (early); − = after (late / behind pace).
      monthsDelta = monthsToDeadline - monthsToTarget;
    }
    // contributionRate ≤ 0 while still short → never reaches → monthsDelta stays null.
  }

  return { asOfMonth, currentBalance, contributionRate, requiredRate, monthsDelta };
}
