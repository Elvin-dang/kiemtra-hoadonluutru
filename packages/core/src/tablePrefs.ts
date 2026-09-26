import { browserStorage } from "./aiSettings";
import { DEFAULT_VISIBLE_COLUMNS, TABLE_COLUMNS } from "./tableColumns";

import type { ColumnId } from "./tableColumns";

export const PAGE_SIZES = [20, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

// Per-browser table layout: column order, shown columns, rows per page. Web table only — the Excel keeps the template.
export type TablePrefs = { columnOrder: ColumnId[]; visibleColumns: ColumnId[]; pageSize: PageSize };

const ALL_COLUMNS: ColumnId[] = TABLE_COLUMNS.map((column) => column.id);
const STORAGE_KEY = "kiemtra-hoadon:table";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export const DEFAULT_TABLE_PREFS: TablePrefs = {
  columnOrder: ALL_COLUMNS,
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  pageSize: 50,
};

export function moveColumn(order: ColumnId[], column: ColumnId, direction: -1 | 1): ColumnId[] {
  const from = order.indexOf(column);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function knownColumns(value: unknown): ColumnId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is ColumnId => ALL_COLUMNS.includes(id as ColumnId)))];
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[name] : undefined;
}

export function sanitizeTablePrefs(value: unknown): TablePrefs {
  const order = knownColumns(field(value, "columnOrder"));
  const visible = knownColumns(field(value, "visibleColumns"));
  const pageSize = field(value, "pageSize");
  return {
    // Columns added in a later version (or missing from old saves) go at the end.
    columnOrder: order.length ? [...order, ...ALL_COLUMNS.filter((id) => !order.includes(id))] : ALL_COLUMNS,
    visibleColumns: visible.length ? visible : DEFAULT_VISIBLE_COLUMNS,
    pageSize: PAGE_SIZES.includes(pageSize as PageSize) ? (pageSize as PageSize) : DEFAULT_TABLE_PREFS.pageSize,
  };
}

export function loadTablePrefs(storage: KeyValueStorage | undefined = browserStorage()): TablePrefs {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return sanitizeTablePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_TABLE_PREFS;
  }
}

export function saveTablePrefs(prefs: TablePrefs, storage: KeyValueStorage | undefined = browserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the layout still applies for this visit.
  }
}
