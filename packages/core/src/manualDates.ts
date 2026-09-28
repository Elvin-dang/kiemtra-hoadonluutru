import { browserStorage } from "./aiSettings";
import { fromIsoDate, toIsoDate } from "./checkout";
import { setManualCheckout } from "./analyze";
import { cellText } from "./tableColumns";

import type { AnalysisResult, RowResult } from "./types";

const STORAGE_KEY = "kiemtra-hoadon:manual-dates";
// ponytail: one localStorage entry (~0.5 MB at the cap); move to a file if it grows.
const LIMIT = 5000;

type DateStorage = Pick<Storage, "getItem" | "setItem">;

// An invoice line: number + invoice date + description. The same line in a later export gets the same key.
export function lineKey(row: Pick<RowResult, "invoiceNo" | "invoiceDate" | "info">): string {
  const date = row.invoiceDate ? toIsoDate(row.invoiceDate) : "";
  return `${cellText(row.invoiceNo).trim()}|${date}|${row.info.normalize("NFC").trim()}`;
}

function load(storage: DateStorage | undefined): Map<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return new Map();
  }
}

export function rememberManualDates(
  rows: RowResult[],
  checkout: Date,
  storage: DateStorage | undefined = browserStorage(),
): void {
  const dates = load(storage);
  for (const row of rows) {
    const key = lineKey(row);
    dates.delete(key);
    dates.set(key, toIsoDate(checkout));
  }
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...dates].slice(-LIMIT)));
  } catch {
    // Storage full or off: typed dates last for this session only.
  }
}

// Dates typed for these invoice lines before (in this or an earlier check) are put back.
export function applyManualDates(
  analysis: AnalysisResult,
  threshold: number,
  storage: DateStorage | undefined = browserStorage(),
): AnalysisResult {
  const dates = load(storage);
  if (dates.size === 0) return analysis;
  return analysis.results.reduce((current, row) => {
    const date = fromIsoDate(dates.get(lineKey(row)) ?? "");
    return date ? setManualCheckout(current, row.stt, date, threshold) : current;
  }, analysis);
}

// The other lines of the same invoice that still have no date: a stay usually shares one check-out.
export function sameInvoiceWithoutDate(analysis: AnalysisResult, stt: number): RowResult[] {
  const row = analysis.results.find((candidate) => candidate.stt === stt);
  if (!row || cellText(row.invoiceNo).trim() === "") return [];
  const invoice = cellText(row.invoiceNo).trim();
  const invoiceDate = row.invoiceDate?.getTime();
  return analysis.results.filter(
    (other) =>
      other.stt !== stt &&
      !other.checkout &&
      cellText(other.invoiceNo).trim() === invoice &&
      other.invoiceDate?.getTime() === invoiceDate,
  );
}
