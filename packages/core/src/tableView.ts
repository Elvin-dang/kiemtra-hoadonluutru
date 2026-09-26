import { formatDate } from "./formatDate";

import { normalizeHeader } from "./columns";
import { cellText, TABLE_COLUMNS } from "./tableColumns";

import type { RowResult, Status } from "./types";
import type { ColumnId, SortValue } from "./tableColumns";

export type StatusFilter = Status | "all";
export type SortState = { column: ColumnId; direction: "asc" | "desc" } | null;
export type Page = { rows: RowResult[]; page: number; pageCount: number; from: number; to: number; total: number };

const COLLATOR = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

function searchText(row: RowResult): string {
  const fields = [
    cellText(row.invoiceNo),
    cellText(row.buyer),
    row.info,
    cellText(row.taxCode),
    row.note,
    formatDate(row.invoiceDate),
    formatDate(row.checkout),
  ];
  return normalizeHeader(fields.join(" "));
}

// Accent-, case- and punctuation-insensitive ("cong ty" finds "CÔNG TY").
export function filterRows(rows: RowResult[], status: StatusFilter, search: string): RowResult[] {
  const query = normalizeHeader(search);
  return rows.filter((row) => (status === "all" || row.status === status) && (!query || searchText(row).includes(query)));
}

// Numbers before text; empty cells always last, whichever the direction.
function compare(a: SortValue, b: SortValue, direction: "asc" | "desc"): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  let result: number;
  if (typeof a === "number" && typeof b === "number") result = a - b;
  else if (typeof a === "number") result = -1;
  else if (typeof b === "number") result = 1;
  else result = COLLATOR.compare(a, b);
  return direction === "asc" ? result : -result;
}

export function sortRows(rows: RowResult[], sort: SortState): RowResult[] {
  if (!sort) return rows;
  const column = TABLE_COLUMNS.find((c) => c.id === sort.column);
  if (!column) return rows;
  return [...rows].sort((a, b) => compare(column.sortValue(a), column.sortValue(b), sort.direction));
}

export function nextSort(current: SortState, column: ColumnId): SortState {
  if (current?.column !== column) return { column, direction: "asc" };
  return current.direction === "asc" ? { column, direction: "desc" } : null;
}

export function paginate(rows: RowResult[], page: number, pageSize: number): Page {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  return {
    rows: pageRows,
    page: current,
    pageCount,
    from: pageRows.length ? start + 1 : 0,
    to: start + pageRows.length,
    total: rows.length,
  };
}
