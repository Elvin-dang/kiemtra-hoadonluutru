import { describe, expect, it } from "vitest";

import { analyze } from "./analyze";
import { applyManualDates, rememberManualDates, sameInvoiceWithoutDate } from "./manualDates";

import type { InputRow } from "./types";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

const line = (invoiceNo: number, info: string, invoiceDate = "17/03/2025"): InputRow => ({
  invoiceNo,
  invoiceDate,
  taxCode: "-",
  buyer: "A",
  info,
});

const MARCH_15 = new Date(Date.UTC(2025, 2, 15));

describe("manual dates", () => {
  it("puts a typed date back when the same invoice line is checked again", () => {
    const storage = memoryStorage();
    const first = analyze([line(4, "Thuê phòng nghỉ"), line(5, "Thuê phòng nghỉ")], 1);
    rememberManualDates([first.results[0]], MARCH_15, storage);

    const again = applyManualDates(analyze([line(4, "Thuê phòng nghỉ "), line(5, "Thuê phòng nghỉ")], 1), 1, storage);

    expect(again.results[0]).toMatchObject({ checkout: MARCH_15, method: "Thủ công", delay: 2, status: "Cảnh báo" });
    expect(again.results[1].checkout).toBeNull();
    expect(again.counts).toEqual({ total: 2, ok: 0, warn: 1, unknown: 1 });
  });

  it("does not match a different invoice date", () => {
    const storage = memoryStorage();
    rememberManualDates(analyze([line(4, "Thuê phòng nghỉ")], 1).results, MARCH_15, storage);
    const other = applyManualDates(analyze([line(4, "Thuê phòng nghỉ", "20/04/2025")], 1), 1, storage);
    expect(other.results[0].checkout).toBeNull();
  });

  it("finds the other lines of the same invoice that still lack a date", () => {
    const analysis = analyze(
      [
        line(4, "Thuê phòng nghỉ (504)"),
        line(4, "Thuê phòng nghỉ (404)"),
        line(4, "Thuê phòng (01/03/2025-02/03/2025)"),
        line(4, "Thuê phòng nghỉ", "18/03/2025"),
        line(7, "Thuê phòng nghỉ"),
      ],
      1,
    );
    expect(sameInvoiceWithoutDate(analysis, 1).map((row) => row.stt)).toEqual([2]);
  });
});
