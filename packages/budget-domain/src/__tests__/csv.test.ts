import { describe, it, expect } from "vitest";
import { parseCSVLine, normaliseDate, parseCSV } from "../csv.js";

describe("parseCSVLine", () => {
  it("splits simple comma-separated values", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCSVLine('"Hello, World",foo,bar')).toEqual(["Hello, World", "foo", "bar"]);
  });

  it("trims whitespace from fields", () => {
    expect(parseCSVLine(" a , b , c ")).toEqual(["a", "b", "c"]);
  });
});

describe("normaliseDate", () => {
  it("passes through DD/MM/YYYY unchanged", () => {
    expect(normaliseDate("30/01/2026")).toBe("30/01/2026");
  });

  it("converts YYYY-MM-DD to DD/MM/YYYY", () => {
    expect(normaliseDate("2026-01-30")).toBe("30/01/2026");
  });

  it("converts DD-Mon-YY (Macquarie short year)", () => {
    expect(normaliseDate("30-Jan-26")).toBe("30/01/2026");
  });

  it("converts DD-Mon-YYYY (Macquarie long year)", () => {
    expect(normaliseDate("30-Jan-2026")).toBe("30/01/2026");
  });

  it("handles single-digit day", () => {
    expect(normaliseDate("5-Mar-26")).toBe("05/03/2026");
  });

  it("returns raw value for unrecognised format", () => {
    expect(normaliseDate("not-a-date")).toBe("not-a-date");
  });
});

describe("parseCSV — ANZ headerless format", () => {
  const ANZ_CSV = `30/01/2026,-8050.94,PAYMENT TO MOODIE STEVEN JAMES
28/01/2026,3500.00,PAYMENT FROM Hawkins E A`;

  it("parses 2 transactions", () => {
    const txs = parseCSV(ANZ_CSV, "ANZ Jan.csv");
    expect(txs).toHaveLength(2);
  });

  it("preserves amount sign", () => {
    const txs = parseCSV(ANZ_CSV, "ANZ Jan.csv");
    expect(txs[0].amount).toBe("-8050.94");
    expect(txs[1].amount).toBe("3500");
  });

  it("sets file property", () => {
    const txs = parseCSV(ANZ_CSV, "ANZ Jan.csv");
    expect(txs[0].file).toBe("ANZ Jan.csv");
  });

  it("initialises category and subcategory as empty strings", () => {
    const txs = parseCSV(ANZ_CSV, "ANZ Jan.csv");
    expect(txs[0].category).toBe("");
    expect(txs[0].subcategory).toBe("");
  });
});

describe("parseCSV — Macquarie header format with debit/credit columns", () => {
  const MAC_CSV = `Date,Description,Debit,Credit
30-Jan-26,COLES ONLINE,145.23,
28-Jan-26,SALARY DIRECT DEPOSIT,,4250.00`;

  it("parses 2 transactions", () => {
    const txs = parseCSV(MAC_CSV, "Macquarie Jan.csv");
    expect(txs).toHaveLength(2);
  });

  it("debit is negative, credit is positive", () => {
    const txs = parseCSV(MAC_CSV, "Macquarie Jan.csv");
    expect(parseFloat(txs[0].amount)).toBeLessThan(0);
    expect(parseFloat(txs[1].amount)).toBeGreaterThan(0);
  });

  it("normalises Macquarie date format", () => {
    const txs = parseCSV(MAC_CSV, "Macquarie Jan.csv");
    expect(txs[0].date).toBe("30/01/2026");
  });
});

describe("parseCSV — skips rows with no date or description", () => {
  it("skips empty rows", () => {
    const csv = `30/01/2026,-100.00,COFFEE SHOP\n\n  \n`;
    expect(parseCSV(csv, "test.csv")).toHaveLength(1);
  });
});
