import { describe, expect, it } from "vitest";

import { DEFAULT_VISIBLE_COLUMNS, TABLE_COLUMNS } from "./tableColumns";
import { filterRows, nextSort, paginate, sortRows } from "./tableView";

import type { RowResult } from "../types/invoice";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

function row(overrides: Partial<RowResult>): RowResult {
  return {
    stt: 1,
    invoiceNo: 1,
    invoiceDate: d(2025, 5, 3),
    taxCode: "4202013626",
    buyer: "CÔNG TY CỔ PHẦN A",
    info: "Thuê phòng nghỉ",
    checkout: d(2025, 5, 2),
    method: "Quy tắc",
    confidence: 1,
    delay: 1,
    status: "Cảnh báo",
    note: "",
    ...overrides,
  };
}

const ROWS = [
  row({ stt: 1, invoiceNo: 10, buyer: "CÔNG TY CỔ PHẦN TRÀNG AN", delay: 3, status: "Cảnh báo" }),
  row({ stt: 2, invoiceNo: 2, buyer: "Văn phòng đại diện Bình Minh", delay: 0, status: "Bình thường", taxCode: "0101" }),
  row({ stt: 3, invoiceNo: "A7", buyer: "Ánh Dương", delay: null, checkout: null, status: "Không xác định", note: "AI không xác định được" }),
  row({ stt: 4, invoiceNo: 2, buyer: "Công ty Hà Nội", delay: 1, status: "Cảnh báo", invoiceDate: d(2025, 1, 9) }),
];

const stts = (rows: RowResult[]) => rows.map((r) => r.stt);

describe("columns", () => {
  it("puts the result next to the invoice number and hides tax code and method by default", () => {
    expect(TABLE_COLUMNS.map((c) => c.id).slice(0, 4)).toEqual(["stt", "invoiceNo", "status", "delay"]);
    expect(DEFAULT_VISIBLE_COLUMNS).not.toContain("taxCode");
    expect(DEFAULT_VISIBLE_COLUMNS).not.toContain("method");
    expect(DEFAULT_VISIBLE_COLUMNS).toContain("info");
  });
});

describe("filterRows", () => {
  it("filters by status", () => {
    expect(stts(filterRows(ROWS, "Cảnh báo", ""))).toEqual([1, 4]);
    expect(stts(filterRows(ROWS, "all", ""))).toEqual([1, 2, 3, 4]);
  });

  it("searches buyer, info, invoice number, tax code and note, ignoring accents and case", () => {
    expect(stts(filterRows(ROWS, "all", "cong ty"))).toEqual([1, 4]);
    expect(stts(filterRows(ROWS, "all", "TRANG AN"))).toEqual([1]);
    expect(stts(filterRows(ROWS, "all", "a7"))).toEqual([3]);
    expect(stts(filterRows(ROWS, "all", "0101"))).toEqual([2]);
    expect(stts(filterRows(ROWS, "all", "không xác định được"))).toEqual([3]);
  });

  it("combines status and search", () => {
    expect(stts(filterRows(ROWS, "Cảnh báo", "ha noi"))).toEqual([4]);
  });
});

describe("sortRows", () => {
  it("returns the original order when unsorted", () => {
    expect(stts(sortRows(ROWS, null))).toEqual([1, 2, 3, 4]);
  });

  it("sorts numbers by value and keeps empty cells last in both directions", () => {
    expect(stts(sortRows(ROWS, { column: "delay", direction: "asc" }))).toEqual([2, 4, 1, 3]);
    expect(stts(sortRows(ROWS, { column: "delay", direction: "desc" }))).toEqual([1, 4, 2, 3]);
  });

  it("sorts dates by value", () => {
    expect(stts(sortRows(ROWS, { column: "invoiceDate", direction: "asc" }))).toEqual([4, 1, 2, 3]);
  });

  it("sorts invoice numbers numerically, with text after numbers, and keeps ties stable", () => {
    expect(stts(sortRows(ROWS, { column: "invoiceNo", direction: "asc" }))).toEqual([2, 4, 1, 3]);
  });

  it("sorts Vietnamese text alphabetically", () => {
    expect(sortRows(ROWS, { column: "buyer", direction: "asc" }).map((r) => r.buyer)).toEqual([
      "Ánh Dương",
      "CÔNG TY CỔ PHẦN TRÀNG AN", // "cổ" before "hà": c < h
      "Công ty Hà Nội",
      "Văn phòng đại diện Bình Minh",
    ]);
  });

  it("sorts status by severity: warnings first", () => {
    expect(stts(sortRows(ROWS, { column: "status", direction: "asc" }))).toEqual([1, 4, 3, 2]);
  });

  it("does not mutate its input", () => {
    const copy = [...ROWS];
    sortRows(ROWS, { column: "delay", direction: "desc" });
    expect(ROWS).toEqual(copy);
  });
});

describe("nextSort", () => {
  it("cycles ascending → descending → off, and restarts on a new column", () => {
    const asc = nextSort(null, "delay");
    expect(asc).toEqual({ column: "delay", direction: "asc" });
    const desc = nextSort(asc, "delay");
    expect(desc).toEqual({ column: "delay", direction: "desc" });
    expect(nextSort(desc, "delay")).toBeNull();
    expect(nextSort(desc, "buyer")).toEqual({ column: "buyer", direction: "asc" });
  });
});

describe("paginate", () => {
  const many = Array.from({ length: 76 }, (_, i) => row({ stt: i + 1 }));

  it("returns the requested page with its range", () => {
    const second = paginate(many, 2, 50);
    expect(second).toMatchObject({ page: 2, pageCount: 2, from: 51, to: 76, total: 76 });
    expect(second.rows).toHaveLength(26);
  });

  it("clamps a page past the end (e.g. after filtering) to the last page", () => {
    expect(paginate(many.slice(0, 10), 3, 50)).toMatchObject({ page: 1, pageCount: 1, from: 1, to: 10 });
  });

  it("handles no rows", () => {
    expect(paginate([], 1, 50)).toMatchObject({ rows: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});
