import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { formatDate } from "./formatDate";

import { analyze, needsAi, onlyWarnings, setManualCheckout } from "./analyze";
import { inspectInput, readRows } from "./workbook";

import type { InputRow } from "./types";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

function row(overrides: Partial<InputRow>): InputRow {
  return { invoiceNo: 1, invoiceDate: "03/05/2025", taxCode: "-", buyer: "A", info: "(30/04/2025-02/05/2025)", ...overrides };
}

describe("analyze — golden: anonymised XUAT HDDT BAN RA export", () => {
  it("matches the hand-checked result for each description format in the file", async () => {
    const buffer = readFileSync("fixtures/br-chitiet.xlsx");
    const inspected = await inspectInput(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const input = readRows(inspected.workbook, inspected.mapping);
    const { results, counts } = analyze(input.rows, input.threshold);
    const pick = (stt: number) => {
      const r = results[stt - 1];
      return [formatDate(r.invoiceDate), formatDate(r.checkout), r.delay, r.status];
    };

    expect(counts).toEqual({ total: 76, ok: 40, warn: 8, unknown: 28 });
    // list of nights → the last date listed (user's decision)
    expect(pick(1)).toEqual(["04/02/2025", "03/02/2025", 1, "Cảnh báo"]);
    expect(pick(5)).toEqual(["05/03/2025", "04/03/2025", 1, "Cảnh báo"]);
    // no date at all → manual check
    expect(pick(6)).toEqual(["17/03/2025", "", null, "Không xác định"]);
    expect(pick(20)).toEqual(["27/06/2025", "", null, "Không xác định"]); // "Thuê phòng nghỉ (504)" is a room, not a date
    // day/month without a year → year from the invoice date
    expect(pick(34)).toEqual(["10/09/2025", "09/09/2025", 1, "Cảnh báo"]); // (9/9)
    expect(pick(35)).toEqual(["12/09/2025", "12/09/2025", 0, "Bình thường"]); // từ 10/09 đến 12/9
    expect(pick(36)).toEqual(["12/09/2025", "13/09/2025", -1, "Bình thường"]); // invoiced the day before check-out
    expect(pick(41)).toEqual(["18/10/2025", "17/10/2025", 1, "Cảnh báo"]); // từ 16/10 đến 17/10
    expect(pick(42)).toEqual(["20/10/2025", "20/10/2025", 0, "Bình thường"]); // partial start, full end
    // typo 23/09/22025 → 23/09 rescued with the invoice's year
    expect(pick(39)).toEqual(["23/09/2025", "23/09/2025", 0, "Bình thường"]);
    // ranges with "-", over New Year, invoice before check-out, very late invoice
    expect(pick(48)).toEqual(["26/11/2025", "26/11/2025", 0, "Bình thường"]);
    expect(pick(53)).toEqual(["01/01/2026", "01/01/2026", 0, "Bình thường"]);
    expect(pick(54)).toEqual(["20/01/2026", "21/01/2026", -1, "Bình thường"]);
    expect(pick(75)).toEqual(["23/06/2026", "21/03/2026", 94, "Cảnh báo"]);
  });
});

describe("analyze — row rules", () => {
  it("marks an unreadable description for manual check when there is no AI outcome", () => {
    const [result] = analyze([row({ info: "Phòng 1604" })], 1).results;
    expect(result).toMatchObject({ status: "Không xác định", delay: null, checkout: null, note: "Cần kiểm tra thủ công" });
  });

  it("marks an invalid invoice date", () => {
    const [result] = analyze([row({ invoiceDate: "không rõ" })], 1).results;
    expect(result).toMatchObject({ status: "Không xác định", delay: null, note: "Ngày hóa đơn không hợp lệ" });
    expect(result.checkout).toEqual(d(2025, 5, 2));
  });

  it("uses an AI date when the rules fail", () => {
    const ai = new Map([[0, { date: d(2025, 5, 2) }]]);
    const [result] = analyze([row({ info: "trả phòng mùng 2" })], 1, ai).results;
    expect(result).toMatchObject({ method: "AI", confidence: null, delay: 1, status: "Cảnh báo", note: "" });
  });

  it("carries the AI note when AI could not decide", () => {
    const ai = new Map([[0, { date: null, note: "AI chưa được bật" }]]);
    const [result] = analyze([row({ info: "trả phòng mùng 2" })], 1, ai).results;
    expect(result).toMatchObject({ method: "Quy tắc", status: "Không xác định", note: "AI chưa được bật" });
  });

  it("applies the threshold and treats early invoices as normal", () => {
    const { results } = analyze(
      [row({ invoiceDate: "04/05/2025" }), row({ invoiceDate: "01/05/2025" })],
      3,
    );
    expect(results.map((r) => [r.delay, r.status])).toEqual([
      [2, "Bình thường"],
      [-1, "Bình thường"],
    ]);
  });

  it("computes the delay from a real date cell even in a negative UTC offset", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const [result] = analyze([row({ invoiceDate: d(2025, 5, 3) })], 1).results;
      expect(result.delay).toBe(1);
    } finally {
      process.env.TZ = previous;
    }
  });
});

describe("analyze — dates without a year", () => {
  it("anchors a day/month to the row's invoice date", () => {
    const [result] = analyze([row({ info: "Thuê phòng nghỉ (từ ngày 10/09 đến ngày 12/9)", invoiceDate: "13/09/2025" })], 1).results;
    expect(result).toMatchObject({ checkout: d(2025, 9, 12), delay: 1, status: "Cảnh báo", method: "Quy tắc" });
  });

  it("does not send such rows to AI", () => {
    expect(needsAi([row({ info: "Thuê phòng nghỉ (9/9)", invoiceDate: "10/09/2025" })])).toEqual([]);
  });
});

describe("needsAi", () => {
  it("returns indices of non-empty descriptions the rules cannot parse", () => {
    const rows = [row({}), row({ info: "Phòng 1604" }), row({ info: "  " }), row({ info: "không có ngày" })];
    expect(needsAi(rows)).toEqual([1, 3]);
  });
});

describe("onlyWarnings", () => {
  it("keeps the Cảnh báo rows with their original STT and recounts", () => {
    const analysis = analyze([
      row({ info: "(30/04/2025-02/05/2025)", invoiceDate: "02/05/2025" }),
      row({ info: "(30/04/2025-02/05/2025)", invoiceDate: "20/05/2025" }),
      row({ info: "" }),
    ], 1);
    const warnings = onlyWarnings(analysis);
    expect(warnings.results.map((r) => [r.stt, r.status])).toEqual([[2, "Cảnh báo"]]);
    expect(warnings.counts).toEqual({ total: 1, ok: 0, warn: 1, unknown: 0 });
  });
});

describe("setManualCheckout", () => {
  it("judges a typed check-out date like any other and recounts", () => {
    const analysis = analyze([row({ info: "" }), row({ info: "(30/04/2025-02/05/2025)", invoiceDate: "02/05/2025" })], 1);
    expect(analysis.counts).toEqual({ total: 2, ok: 1, warn: 0, unknown: 1 });

    const fixed = setManualCheckout(analysis, 1, new Date(Date.UTC(2025, 3, 30)), 1);
    expect(fixed.results[0]).toMatchObject({ method: "Thủ công", delay: 3, status: "Cảnh báo", note: "Nhập tay" });
    expect(fixed.results[1]).toBe(analysis.results[1]);
    expect(fixed.counts).toEqual({ total: 2, ok: 1, warn: 1, unknown: 0 });
  });

  it("still flags a row whose invoice date is invalid", () => {
    const analysis = analyze([row({ invoiceDate: "không rõ" })], 1);
    const fixed = setManualCheckout(analysis, 1, new Date(Date.UTC(2025, 3, 30)), 1);
    expect(fixed.results[0]).toMatchObject({ status: "Không xác định", note: "Ngày hóa đơn không hợp lệ" });
  });
});
