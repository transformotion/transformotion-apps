import { describe, it, expect } from "vitest";
import { isExcludedFromCashflow } from "../exclusions.js";
import type { Transaction } from "../contracts.js";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    transactionId: "1",
    accountId: "acc",
    date: "01/01/2026",
    amount: "-100",
    description: "TEST",
    categoryId: null,
    subcategoryId: null,
    category: "Groceries",
    subcategory: "Supermarket",
    file: "test.csv",
    _manual: false,
    _business: false,
    ...overrides,
  };
}

describe("isExcludedFromCashflow", () => {
  it("includes normal expense transactions", () => {
    expect(isExcludedFromCashflow(tx({}))).toBe(false);
  });

  it("excludes Transfer subcategory", () => {
    expect(isExcludedFromCashflow(tx({ subcategory: "Transfer" }))).toBe(true);
  });

  it("excludes _business transactions", () => {
    expect(isExcludedFromCashflow(tx({ _business: true }))).toBe(true);
  });

  it("excludes Renovations category (project category)", () => {
    expect(isExcludedFromCashflow(tx({ category: "Renovations", subcategory: "Materials & supplies" }))).toBe(true);
  });

  it("excludes Capital purchases subcategory (project subcategory)", () => {
    expect(isExcludedFromCashflow(tx({ category: "Financial & Insurance", subcategory: "Capital purchases" }))).toBe(true);
  });

  it("respects custom project categories override", () => {
    expect(
      isExcludedFromCashflow(
        tx({ category: "NewCar", subcategory: "Deposit" }),
        { projectCategories: ["NewCar"] }
      )
    ).toBe(true);
  });

  it("includes Income transactions", () => {
    expect(isExcludedFromCashflow(tx({ category: "Income", subcategory: "Your take-home pay" }))).toBe(false);
  });
});
