import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { formatDate } from "@/shared/utils/formatDate";

import { analyze, needsAi } from "./analyze";
import { inspectInput, readRows } from "./workbook";

import type { InputRow } from "../types/invoice";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

function row(overrides: Partial<InputRow>): InputRow {
  return { invoiceNo: 1, invoiceDate: "03/05/2025", taxCode: "-", buyer: "A", info: "(30/04/2025-02/05/2025)", ...overrides };
}

describe("analyze — golden sample", () => {
  it("matches the reference results for fixtures/sample.xlsx", async () => {
    const buffer = readFileSync("fixtures/sample.xlsx");
    const inspected = await inspectInput(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const input = readRows(inspected.workbook, inspected.mapping);
    const { results, counts } = analyze(input.rows, input.threshold);

    expect(counts).toEqual({ total: 9, ok: 1, warn: 8, unknown: 0 });
    expect(results.map((r) => [formatDate(r.checkout), r.delay, r.status])).toEqual([
      ["02/05/2025", 1, "Cảnh báo"],
      ["01/05/2025", 4, "Cảnh báo"],
      ["05/05/2025", 2, "Cảnh báo"],
      ["15/05/2025", 4, "Cảnh báo"],
      ["29/10/2025", 2, "Cảnh báo"],
      ["03/07/2026", 0, "Bình thường"],
      ["03/07/2026", 1, "Cảnh báo"],
      ["03/07/2026", 2, "Cảnh báo"],
      ["03/07/2026", 3, "Cảnh báo"],
    ]);
    expect(results.every((r) => r.method === "Quy tắc" && r.confidence === 1)).toBe(true);
    expect(results.map((r) => r.stt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
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

describe("needsAi", () => {
  it("returns indices of non-empty descriptions the rules cannot parse", () => {
    const rows = [row({}), row({ info: "Phòng 1604" }), row({ info: "  " }), row({ info: "không có ngày" })];
    expect(needsAi(rows)).toEqual([1, 3]);
  });
});
