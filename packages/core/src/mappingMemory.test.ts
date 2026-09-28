import { describe, expect, it } from "vitest";

import { recallMapping, rememberMapping } from "./mappingMemory";

import type { ColumnMapping, SheetColumn } from "./types";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

const columns = (...headers: string[]): SheetColumn[] =>
  headers.map((header, i) => ({ index: i + 1, letter: String.fromCharCode(65 + i), header }));

const COLUMNS = columns("Số", "Ngày", "MST", "Khách", "Diễn giải");
const MAPPING: ColumnMapping = { invoiceNo: 1, invoiceDate: 2, taxCode: 3, buyer: 4, info: 5, buyerAlt: null };

describe("column mapping memory", () => {
  it("recalls the columns chosen for a file with the same headers", () => {
    const storage = memoryStorage();
    rememberMapping(COLUMNS, MAPPING, storage);
    expect(recallMapping(columns("số", "Ngày ", "MST", "Khách", "Diễn giải"), storage)).toEqual(MAPPING);
  });

  it("recalls nothing for different headers, and drops a choice that no longer fits", () => {
    const storage = memoryStorage();
    rememberMapping(COLUMNS, MAPPING, storage);
    expect(recallMapping(columns("Số", "Ngày", "MST", "Khách"), storage)).toBeNull();
    storage.setItem("kiemtra-hoadon:column-mappings", JSON.stringify([{ signature: "a|b", mapping: { ...MAPPING, info: 9 } }]));
    expect(recallMapping(columns("a", "b"), storage)).toBeNull();
  });
});
