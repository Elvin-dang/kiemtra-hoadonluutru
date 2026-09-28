import { browserStorage } from "./aiSettings";
import { normalizeHeader, validateMapping } from "./columns";

import type { ColumnMapping, SheetColumn } from "./types";

const MEMORY_KEY = "kiemtra-hoadon:column-mappings";
const MEMORY_LIMIT = 20;

type MemoryStorage = Pick<Storage, "getItem" | "setItem">;
type Remembered = { signature: string; mapping: ColumnMapping };

// Same headers in the same order = same kind of export.
export function headerSignature(columns: SheetColumn[]): string {
  return columns.map((column) => normalizeHeader(column.header)).join("|");
}

function load(storage: MemoryStorage | undefined): Remembered[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(MEMORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Remembered[]) : [];
  } catch {
    return [];
  }
}

export function rememberMapping(
  columns: SheetColumn[],
  mapping: ColumnMapping,
  storage: MemoryStorage | undefined = browserStorage(),
): void {
  const signature = headerSignature(columns);
  const others = load(storage).filter((entry) => entry.signature !== signature);
  try {
    storage?.setItem(MEMORY_KEY, JSON.stringify([...others, { signature, mapping }].slice(-MEMORY_LIMIT)));
  } catch {
    // Storage off: the columns are just asked again next time.
  }
}

// The columns picked last time for a file with exactly these headers, if still valid for it.
export function recallMapping(
  columns: SheetColumn[],
  storage: MemoryStorage | undefined = browserStorage(),
): ColumnMapping | null {
  const signature = headerSignature(columns);
  const mapping = load(storage).find((entry) => entry.signature === signature)?.mapping;
  if (!mapping || typeof mapping !== "object") return null;
  const indices = Object.values(mapping);
  const isInRange = indices.every(
    (index) => index === null || (Number.isInteger(index) && index >= 1 && index <= columns.length),
  );
  return isInRange && validateMapping(mapping) === null ? mapping : null;
}
