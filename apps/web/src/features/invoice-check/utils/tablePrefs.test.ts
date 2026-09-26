import { describe, expect, it } from "vitest";

import { DEFAULT_VISIBLE_COLUMNS, TABLE_COLUMNS } from "./tableColumns";
import {
  DEFAULT_TABLE_PREFS,
  PAGE_SIZES,
  loadTablePrefs,
  moveColumn,
  sanitizeTablePrefs,
  saveTablePrefs,
} from "./tablePrefs";

const DEFAULT_ORDER = TABLE_COLUMNS.map((column) => column.id);

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("defaults", () => {
  it("use the table's column order, its default-visible columns and 50 rows per page", () => {
    expect(DEFAULT_TABLE_PREFS).toEqual({ columnOrder: DEFAULT_ORDER, visibleColumns: DEFAULT_VISIBLE_COLUMNS, pageSize: 50 });
    expect(PAGE_SIZES).toEqual([20, 50, 100, 200]);
  });
});

describe("moveColumn", () => {
  it("moves a column one place left or right", () => {
    expect(moveColumn(["stt", "invoiceNo", "status"], "status", -1)).toEqual(["stt", "status", "invoiceNo"]);
    expect(moveColumn(["stt", "invoiceNo", "status"], "stt", 1)).toEqual(["invoiceNo", "stt", "status"]);
  });

  it("does nothing at either end or for an unknown column", () => {
    const order = ["stt", "invoiceNo", "status"] as const;
    expect(moveColumn([...order], "stt", -1)).toEqual([...order]);
    expect(moveColumn([...order], "status", 1)).toEqual([...order]);
    expect(moveColumn([...order], "note", 1)).toEqual([...order]);
  });
});

describe("sanitizeTablePrefs", () => {
  it("keeps a valid saved order and adds any columns it does not mention at the end", () => {
    const saved = { columnOrder: ["note", "stt"], visibleColumns: ["stt", "note"], pageSize: 100 };
    const prefs = sanitizeTablePrefs(saved);
    expect(prefs.columnOrder.slice(0, 2)).toEqual(["note", "stt"]);
    expect([...prefs.columnOrder].sort()).toEqual([...DEFAULT_ORDER].sort());
    expect(prefs.visibleColumns).toEqual(["stt", "note"]);
    expect(prefs.pageSize).toBe(100);
  });

  it("drops unknown and duplicate columns", () => {
    const prefs = sanitizeTablePrefs({ columnOrder: ["stt", "bogus", "stt", "note"], visibleColumns: ["bogus", "note", "note"], pageSize: 20 });
    expect(prefs.columnOrder.filter((id) => id === "stt")).toHaveLength(1);
    expect(prefs.columnOrder).not.toContain("bogus");
    expect(prefs.visibleColumns).toEqual(["note"]);
  });

  it("falls back to defaults for missing, empty or invalid values", () => {
    expect(sanitizeTablePrefs(null)).toEqual(DEFAULT_TABLE_PREFS);
    expect(sanitizeTablePrefs({ columnOrder: "x", visibleColumns: [], pageSize: 37 })).toEqual(DEFAULT_TABLE_PREFS);
  });
});

describe("loadTablePrefs / saveTablePrefs", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const prefs = { ...DEFAULT_TABLE_PREFS, columnOrder: moveColumn(DEFAULT_ORDER, "note", -1), pageSize: 200 as const };
    saveTablePrefs(prefs, storage);
    expect(loadTablePrefs(storage)).toEqual(prefs);
  });

  it("never throws on broken storage or bad JSON", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadTablePrefs(broken)).toEqual(DEFAULT_TABLE_PREFS);
    expect(() => saveTablePrefs(DEFAULT_TABLE_PREFS, broken)).not.toThrow();
    expect(loadTablePrefs(memoryStorage({ "kiemtra-hoadon:table": "{nope" }))).toEqual(DEFAULT_TABLE_PREFS);
    expect(loadTablePrefs(undefined)).toEqual(DEFAULT_TABLE_PREFS);
  });
});
