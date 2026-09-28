import { extractCheckout, toDate } from "./checkout";

import type { AiOutcome, AnalysisResult, Counts, InputRow, Method, RowResult, Status } from "./types";

const DAY_MS = 86_400_000;
const INVALID_INVOICE_DATE = "Ngày hóa đơn không hợp lệ";

type Judged = { delay: number | null; status: Status; note?: string };

// Days from check-out to the invoice date, and whether that is late.
function judge(checkout: Date | null, invoiceDate: Date | null, threshold: number): Judged {
  if (!checkout) return { delay: null, status: "Không xác định", note: "Cần kiểm tra thủ công" };
  if (!invoiceDate) return { delay: null, status: "Không xác định", note: INVALID_INVOICE_DATE };
  const delay = Math.round((invoiceDate.getTime() - checkout.getTime()) / DAY_MS);
  return { delay, status: delay >= threshold ? "Cảnh báo" : "Bình thường" };
}

function countStatuses(results: RowResult[]): Counts {
  const counts: Counts = { total: results.length, ok: 0, warn: 0, unknown: 0 };
  for (const row of results) {
    if (row.status === "Cảnh báo") counts.warn++;
    else if (row.status === "Bình thường") counts.ok++;
    else counts.unknown++;
  }
  return counts;
}

// Rules first: the invoice date anchors day/month dates that have no year.
function ruleCheckout(row: InputRow): Date | null {
  return extractCheckout(row.info, toDate(row.invoiceDate));
}

export const NO_DATE_NOTE = "Nội dung không có ngày — nhập ngày trong bảng";

// Words that can carry a date without two numbers ("đêm 12", "ngày mai", "check-out", "May 3").
const DATE_WORDS = /ngày|tháng|đêm|hôm|tuần|night|check|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/;

// Pre-check before AI: "Thuê phòng nghỉ" or "Thuê phòng nghỉ (504)" (a room number) cannot
// hold a date, so asking AI only costs time and money. Errs towards sending.
export function mightHaveDate(text: string): boolean {
  const normalized = text.normalize("NFC").toLowerCase();
  return (normalized.match(/\d+/g)?.length ?? 0) >= 2 || DATE_WORDS.test(normalized);
}

export function needsAi(rows: InputRow[]): number[] {
  return rows.flatMap((row, index) => (row.info.trim() !== "" && !ruleCheckout(row) ? [index] : []));
}

export function analyze(rows: InputRow[], threshold: number, ai: Map<number, AiOutcome> = new Map()): AnalysisResult {
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
    const judged = judge(checkout, invoiceDate, threshold);
    const { delay, status } = judged;
    // An invalid invoice date outranks any AI note; "check by hand" only fills an empty note.
    if (judged.note === INVALID_INVOICE_DATE) note = judged.note;
    else if (judged.note) note = note || judged.note;

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

  return { results, counts: countStatuses(results) };
}

// A check-out date typed by the user replaces whatever rules or AI found for that row.
export function setManualCheckout(analysis: AnalysisResult, stt: number, checkout: Date, threshold: number): AnalysisResult {
  const results = analysis.results.map((row): RowResult => {
    if (row.stt !== stt) return row;
    const { delay, status, note } = judge(checkout, row.invoiceDate, threshold);
    return { ...row, checkout, method: "Thủ công", confidence: null, delay, status, note: note ?? "Nhập tay" };
  });
  return { results, counts: countStatuses(results) };
}

// The Cảnh báo rows alone (original STT kept), for a follow-up file.
export function onlyWarnings({ results }: AnalysisResult): AnalysisResult {
  const warnings = results.filter((row) => row.status === "Cảnh báo");
  return { results: warnings, counts: { total: warnings.length, ok: 0, warn: warnings.length, unknown: 0 } };
}
