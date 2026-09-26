import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { cn } from "cn";

import { cellText, formatDate } from "@kiemtra/core";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

import type { ColumnId, RowResult, SortState, Status, TableColumn } from "@kiemtra/core";
import type { KeyboardEvent } from "react";

type ResultTableProps = {
  rows: RowResult[];
  columns: TableColumn[];
  sort: SortState;
  expandedRows: Set<number>;
  onSort: (column: ColumnId) => void;
  onToggleRow: (stt: number) => void;
};

const STATUS_TONE: Record<Status, string> = {
  "Cảnh báo": "text-red-600 font-semibold",
  "Bình thường": "text-green-700",
  "Không xác định": "text-amber-600",
};

function cellContent(row: RowResult, id: ColumnId): string {
  switch (id) {
    case "stt":
      return String(row.stt);
    case "invoiceNo":
      return cellText(row.invoiceNo);
    case "status":
      return row.status;
    case "delay":
      return row.delay === null ? "" : String(row.delay);
    case "invoiceDate":
      return formatDate(row.invoiceDate);
    case "checkout":
      return formatDate(row.checkout);
    case "buyer":
      return cellText(row.buyer);
    case "info":
      return row.info;
    case "taxCode":
      return cellText(row.taxCode);
    case "method":
      return row.method;
    case "note":
      return row.note;
  }
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (direction === "asc") return <ArrowUpIcon className="size-3.5" />;
  if (direction === "desc") return <ArrowDownIcon className="size-3.5" />;
  return <ArrowUpDownIcon className="size-3.5 opacity-40" />;
}

export function ResultTable({ rows, columns, sort, expandedRows, onSort, onToggleRow }: ResultTableProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, stt: number) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggleRow(stt);
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const direction = sort?.column === column.id ? sort.direction : null;
              return (
                <TableHead
                  key={column.id}
                  aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.id)}
                    className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {column.label}
                    <SortIcon direction={direction} />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                Không có dòng phù hợp.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => {
            const isExpanded = expandedRows.has(row.stt);
            return (
              <TableRow
                key={row.stt}
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => onToggleRow(row.stt)}
                onKeyDown={(event) => handleKeyDown(event, row.stt)}
                className={cn(
                  "cursor-pointer align-top",
                  row.status === "Cảnh báo" && "bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50",
                )}
              >
                {columns.map((column) => {
                  const text = cellContent(row, column.id);
                  return (
                    <TableCell
                      key={column.id}
                      title={column.isLongText && !isExpanded ? text : undefined}
                      className={cn(
                        column.isNumeric && "tabular-nums",
                        column.id === "status" && STATUS_TONE[row.status],
                        column.isLongText && "min-w-40 max-w-xs whitespace-normal break-words",
                        column.isLongText && column.id === "note" && "text-muted-foreground",
                      )}
                    >
                      {column.isLongText ? <span className={cn(!isExpanded && "line-clamp-2")}>{text}</span> : text}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
