import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, PencilIcon } from "lucide-react";
import { cn } from "cn";

import { cellText, formatDate, fromIsoDate, toIsoDate } from "@kiemtra/core";

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
  onEditCheckout?: (stt: number, checkout: Date) => void;
  // Bumped by "Nhập ngày còn thiếu": open the date box of the first dateless row shown.
  editRequest?: number;
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

type CheckoutCellProps = {
  row: RowResult;
  isEditing: boolean;
  onStartEdit: () => void;
  onDone: (checkout: Date | null, isEnter: boolean) => void;
};

// Click the pencil (or "Nhập ngày" on an unknown row) to type the check-out date by hand.
function CheckoutCell({ row, isEditing, onStartEdit, onDone }: CheckoutCellProps) {
  // Enter/Escape close the input, and the blur that follows must not commit a second time.
  const isFinished = useRef(false);
  useEffect(() => {
    if (isEditing) isFinished.current = false;
  }, [isEditing]);
  const finish = (checkout: Date | null, isEnter = false) => {
    if (isFinished.current) return;
    isFinished.current = true;
    onDone(checkout, isEnter);
  };
  if (isEditing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label={`Ngày phải lập HĐ, dòng ${row.stt}`}
        defaultValue={row.checkout ? toIsoDate(row.checkout) : ""}
        className="rounded-md border bg-background px-2 py-1 text-sm"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") finish(fromIsoDate(event.currentTarget.value), true);
          if (event.key === "Escape") finish(null);
        }}
        onBlur={(event) => finish(fromIsoDate(event.currentTarget.value))}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {formatDate(row.checkout)}
      <button
        type="button"
        aria-label={`Sửa ngày phải lập HĐ, dòng ${row.stt}`}
        title="Nhập ngày check-out"
        // The row itself toggles on Enter/Space; keep those keys for this button.
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onStartEdit();
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          row.checkout ? "opacity-40 hover:opacity-100" : "text-amber-700",
        )}
      >
        <PencilIcon className="size-3.5" />
        {!row.checkout && <span className="text-xs">Nhập ngày</span>}
      </button>
    </span>
  );
}

export function ResultTable({
  rows,
  columns,
  sort,
  expandedRows,
  onSort,
  onToggleRow,
  onEditCheckout,
  editRequest,
}: ResultTableProps) {
  const [editingStt, setEditingStt] = useState<number | null>(null);
  const [handledRequest, setHandledRequest] = useState(editRequest);
  if (editRequest !== handledRequest) {
    setHandledRequest(editRequest);
    setEditingStt(rows.find((row) => !row.checkout)?.stt ?? null);
  }

  // Enter moves straight to the next row on this page that still has no date.
  const handleEditDone = (stt: number, checkout: Date | null, isEnter: boolean) => {
    const index = rows.findIndex((row) => row.stt === stt);
    const next = isEnter && checkout ? rows.slice(index + 1).find((row) => !row.checkout) : undefined;
    setEditingStt(next?.stt ?? null);
    if (checkout) onEditCheckout?.(stt, checkout);
  };

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
                      title={
                        column.id === "status" ? row.note || undefined : column.isLongText && !isExpanded ? text : undefined
                      }
                      className={cn(
                        column.isNumeric && "tabular-nums",
                        column.id === "status" && STATUS_TONE[row.status],
                        column.isLongText && "min-w-40 max-w-xs whitespace-normal break-words",
                        column.isLongText && column.id === "note" && "text-muted-foreground",
                      )}
                    >
                      {column.id === "checkout" && onEditCheckout ? (
                        <CheckoutCell
                          row={row}
                          isEditing={editingStt === row.stt}
                          onStartEdit={() => setEditingStt(row.stt)}
                          onDone={(checkout, isEnter) => handleEditDone(row.stt, checkout, isEnter)}
                        />
                      ) : column.id === "status" && row.status === "Không xác định" && row.note ? (
                        <span className="flex flex-col">
                          {text}
                          <span className="max-w-48 text-xs font-normal whitespace-normal text-muted-foreground">
                            {row.note}
                          </span>
                        </span>
                      ) : column.isLongText ? (
                        <span className={cn(!isExpanded && "line-clamp-2")}>{text}</span>
                      ) : (
                        text
                      )}
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
