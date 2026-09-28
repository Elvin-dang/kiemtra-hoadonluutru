import { extractCheckout, toDate } from "./checkout";

import type { AiOutcome, AnalysisResult, Counts, InputRow, Method, RowResult, Status } from "./types";

const DAY_MS = 86_400_000;

// Rules first: the invoice date anchors day/month dates that have no year.
function ruleCheckout(row: InputRow): Date | null {
  return extractCheckout(row.info, toDate(row.invoiceDate));
}

export function needsAi(rows: InputRow[]): number[] {
  return rows.flatMap((row, index) => (row.info.trim() !== "" && !ruleCheckout(row) ? [index] : []));
}

export function analyze(rows: InputRow[], threshold: number, ai: Map<number, AiOutcome> = new Map()): AnalysisResult {
  const counts: Counts = { total: rows.length, ok: 0, warn: 0, unknown: 0 };

  const results = rows.map((row, index): RowResult => {
    let checkout = ruleCheckout(row);
    let method: Method = "Quy tắc";
    let note = "";
    if (!checkout) {
      const outcome = ai.get(index);
      if (outcome?.date) {
        checkout = outcome.date;
        method = "AI";
      }
      note = outcome?.note ?? "";
    }

    const invoiceDate = toDate(row.invoiceDate);
    let delay: number | null = null;
    let status: Status;
    if (!checkout) {
      status = "Không xác định";
      note = note || "Cần kiểm tra thủ công";
    } else if (!invoiceDate) {
      status = "Không xác định";
      note = "Ngày hóa đơn không hợp lệ";
    } else {
      delay = Math.round((invoiceDate.getTime() - checkout.getTime()) / DAY_MS);
      status = delay >= threshold ? "Cảnh báo" : "Bình thường";
    }

    if (status === "Cảnh báo") counts.warn++;
    else if (status === "Bình thường") counts.ok++;
    else counts.unknown++;

    return {
      stt: index + 1,
      invoiceNo: row.invoiceNo,
      invoiceDate,
      taxCode: row.taxCode,
      buyer: row.buyer,
      info: row.info,
      checkout,
      method,
      confidence: checkout && method === "Quy tắc" ? 1 : null,
      delay,
      status,
      note,
    };
  });

  return { results, counts };
}

// The Cảnh báo rows alone (original STT kept), for a follow-up file.
export function onlyWarnings({ results }: AnalysisResult): AnalysisResult {
  const warnings = results.filter((row) => row.status === "Cảnh báo");
  return { results: warnings, counts: { total: warnings.length, ok: 0, warn: warnings.length, unknown: 0 } };
}
