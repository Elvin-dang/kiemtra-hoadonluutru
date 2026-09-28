import { cellText } from "./tableColumns";

import type { RowResult } from "./types";

export type CustomerSummary = { buyer: string; taxCode: string; total: number; warn: number; unknown: number };

// One line per buyer (tax code, else name): who has the most late invoices first.
export function summarizeByCustomer(results: RowResult[]): CustomerSummary[] {
  const byKey = new Map<string, CustomerSummary>();
  for (const row of results) {
    const taxCode = cellText(row.taxCode).trim();
    const buyer = cellText(row.buyer).trim();
    const key = taxCode && taxCode !== "-" ? taxCode : buyer.toLowerCase();
    const summary = byKey.get(key) ?? { buyer, taxCode, total: 0, warn: 0, unknown: 0 };
    summary.total++;
    if (row.status === "Cảnh báo") summary.warn++;
    else if (row.status === "Không xác định") summary.unknown++;
    byKey.set(key, summary);
  }
  return [...byKey.values()].sort(
    (a, b) => b.warn - a.warn || b.unknown - a.unknown || b.total - a.total || a.buyer.localeCompare(b.buyer, "vi"),
  );
}
