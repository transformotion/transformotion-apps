import { describe, it, expect } from "vitest";
import type { Subcategory, Transaction } from "../contracts";
import { potBalance, potMonthEndBalances, potProjection } from "../savings";

const POT = "sub-holiday";

function tx(date: string, amount: string, subcategoryId: string | null = POT): Transaction {
  return {
    transactionId: Math.random().toString(36).slice(2),
    accountId: "acct-1",
    date,
    amount,
    description: "",
    categoryId: null,
    subcategoryId,
    file: "t.csv",
    _manual: false,
    _business: false,
  };
}

const pot: Subcategory = {
  subcategoryId: POT,
  name: "Holiday",
  displayOrder: 0,
  role: "savings",
  potOpeningBalance: 100,
  potTarget: 1000,
  potDeadline: "2026-06",
};

// Signed: contributions +, withdrawals −.
const TXNS: Transaction[] = [
  tx("15/01/2026", "200"), //  +200 (Jan)
  tx("15/02/2026", "150"), //  +150 (Feb)
  tx("20/02/2026", "-50"), //  −50 withdrawal (Feb)
  tx("15/03/2026", "100"), //  +100 (Mar)
  tx("10/03/2026", "999", "sub-other"), // a different pot — ignored
];

describe("potBalance", () => {
  it("opening + signed sum of all pot transactions (contribution +, withdrawal −)", () => {
    // 100 + 200 + 150 − 50 + 100 = 500; the sub-other tx is ignored
    expect(potBalance(pot, TXNS)).toBe(500);
  });

  it("defaults the opening balance to 0", () => {
    const noOpening: Subcategory = { ...pot, potOpeningBalance: undefined };
    expect(potBalance(noOpening, TXNS)).toBe(400);
  });
});

describe("potMonthEndBalances", () => {
  it("cumulative month-end balances across the window", () => {
    expect(potMonthEndBalances(pot, TXNS, "2026-01", "2026-04")).toEqual([
      { month: "2026-01", balance: 300 }, // 100 + 200
      { month: "2026-02", balance: 400 }, // + 150 − 50
      { month: "2026-03", balance: 500 }, // + 100
      { month: "2026-04", balance: 500 }, // no transactions
    ]);
  });
});

describe("potProjection", () => {
  it("trailing-3-month contribution rate + BEHIND-pace delta", () => {
    const p = potProjection(pot, TXNS, "2026-03");
    expect(p.currentBalance).toBe(500);
    // trailing Jan/Feb/Mar net = 200 + 100 + 100 = 400 over 3 months
    expect(p.contributionRate).toBeCloseTo(400 / 3);
    // deadline 3 months out; remaining 500 → required 500/3
    expect(p.requiredRate).toBeCloseTo(500 / 3);
    // monthsToTarget = 500 / (400/3) = 3.75 → delta = 3 − 3.75 = −0.75 (behind pace)
    expect(p.monthsDelta).toBeCloseTo(3 - 3.75);
    expect(p.monthsDelta as number).toBeLessThan(0);
  });

  it("ahead-of-pace when the contribution rate exceeds the required rate", () => {
    const p = potProjection({ ...pot, potTarget: 600 }, TXNS, "2026-03"); // remaining 100
    // monthsToTarget = 100 / (400/3) = 0.75 → delta = 3 − 0.75 = 2.25 (early)
    expect(p.monthsDelta).toBeCloseTo(2.25);
    expect(p.monthsDelta as number).toBeGreaterThan(0);
  });

  it("null required/delta when target or deadline is unset", () => {
    const p = potProjection({ ...pot, potDeadline: undefined }, TXNS, "2026-03");
    expect(p.requiredRate).toBeNull();
    expect(p.monthsDelta).toBeNull();
  });

  it("already at/over target → early by the full remaining window", () => {
    const p = potProjection({ ...pot, potTarget: 400 }, TXNS, "2026-03"); // balance 500 ≥ 400
    expect(p.monthsDelta).toBe(3);
  });
});
