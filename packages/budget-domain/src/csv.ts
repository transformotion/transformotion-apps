import type { RawTransaction, CSVMapping } from "./contracts.js";

export function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuote = !inQuote;
    } else if (line[i] === "," && !inQuote) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += line[i];
    }
  }
  cols.push(cur.trim());
  return cols;
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function normaliseDate(raw: string): string {
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;

  // DD-Mon-YY or DD-Mon-YYYY (Macquarie)
  const monMatch = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (monMatch) {
    const mo = MONTH_MAP[monMatch[2].toLowerCase()];
    const yr = monMatch[3].length === 2 ? "20" + monMatch[3] : monMatch[3];
    if (mo) return `${monMatch[1].padStart(2, "0")}/${mo}/${yr}`;
  }

  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  return raw;
}

function getCellValue(cols: string[], idx: number): string {
  return (cols[idx] ?? "").trim().replace(/^"|"$/g, "");
}

/** Parse CSV using a pre-confirmed CSVMapping (production path). */
export function parseCSVWithMapping(
  text: string,
  filename: string,
  mapping: CSVMapping
): RawTransaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const dataLines = mapping.hasHeader ? lines.slice(1) : lines;
  const isSplit = mapping.debitColumn !== undefined && mapping.creditColumn !== undefined;

  return dataLines.flatMap((line) => {
    const cols = parseCSVLine(line);
    const date = normaliseDate(getCellValue(cols, mapping.dateColumn));
    const desc = getCellValue(cols, mapping.descriptionColumn);

    let amount: number;
    if (isSplit) {
      const debit = parseFloat(getCellValue(cols, mapping.debitColumn!).replace(/,/g, "")) || 0;
      const credit = parseFloat(getCellValue(cols, mapping.creditColumn!).replace(/,/g, "")) || 0;
      if (debit === 0 && credit === 0) return [];
      amount = credit > 0 ? credit : -debit;
    } else {
      amount = parseFloat(getCellValue(cols, mapping.amountColumn!).replace(/,/g, "")) || 0;
    }

    if (!date || !desc) return [];
    return [{ date, amount: amount.toString(), description: desc, file: filename, categoryId: null, subcategoryId: null }];
  });
}

/**
 * Auto-detect CSV format and parse.
 * Handles ANZ (no header, date/amount/description order) and
 * Macquarie/other (header row with named columns).
 *
 * Prefer parseCSVWithMapping when a confirmed CSVMapping is available.
 */
export function parseCSV(text: string, filename: string): RawTransaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) return [];

  const firstCols = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const firstIsDate = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(
    firstCols[0].replace(/^"+|"+$/g, "")
  );
  const hasHeader = !firstIsDate;

  let dateIdx: number;
  let descIdx: number;
  let amtIdx: number;
  let debitIdx: number;
  let creditIdx: number;
  let isSplit: boolean;
  let dataLines: string[];

  if (hasHeader) {
    const header = firstCols;
    dateIdx = header.findIndex((h) => h.includes("date"));
    descIdx =
      header.findIndex((h) => h === "original description") !== -1
        ? header.findIndex((h) => h === "original description")
        : header.findIndex(
            (h) =>
              h.includes("description") ||
              h.includes("narrative") ||
              h.includes("detail") ||
              h.includes("memo")
          );
    amtIdx = header.findIndex((h) => h === "amount");
    debitIdx = header.findIndex((h) => h === "debit");
    creditIdx = header.findIndex((h) => h === "credit");

    if (dateIdx === -1 || descIdx === -1 || (amtIdx === -1 && debitIdx === -1)) return [];
    isSplit = amtIdx === -1 && debitIdx !== -1;
    dataLines = lines.slice(1);
  } else {
    // No header — ANZ format: date, amount, description
    dateIdx = 0;
    amtIdx = 1;
    descIdx = 2;
    debitIdx = -1;
    creditIdx = -1;
    isSplit = false;
    dataLines = lines;
  }

  return dataLines.flatMap((line) => {
    const cols = parseCSVLine(line);
    const date = normaliseDate(getCellValue(cols, dateIdx));
    const desc = getCellValue(cols, descIdx);

    let amount: number;
    if (isSplit) {
      const debit = parseFloat(getCellValue(cols, debitIdx).replace(/,/g, "")) || 0;
      const credit = parseFloat(getCellValue(cols, creditIdx).replace(/,/g, "")) || 0;
      if (debit === 0 && credit === 0) return [];
      amount = credit > 0 ? credit : -debit;
    } else {
      amount = parseFloat(getCellValue(cols, amtIdx).replace(/,/g, "")) || 0;
    }

    if (!date || !desc) return [];
    return [{ date, amount: amount.toString(), description: desc, file: filename, categoryId: null, subcategoryId: null }];
  });
}
