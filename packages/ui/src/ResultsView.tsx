"use client";

import { useMemo, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";

import {
  DEFAULT_TABLE_PREFS,
  filterRows,
  formatDate,
  loadTablePrefs,
  moveColumn,
  nextSort,
  PAGE_SIZES,
  paginate,
  saveTablePrefs,
  sortRows,
  TABLE_COLUMNS,
} from "@kiemtra/core";

import { ColumnMenu } from "./ColumnMenu";
import { CustomerSummary } from "./CustomerSummary";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { NativeSelect, NativeSelectOption } from "./components/ui/native-select";
import { ResultTable } from "./ResultTable";
import { SummaryTiles } from "./SummaryTiles";

import type { AnalysisResult, ColumnId, SortState, StatusFilter, TablePrefs } from "@kiemtra/core";
import type { InvoiceFill } from "./useInvoiceCheck";

type ResultsViewProps = {
  analysis: AnalysisResult;
  onEditCheckout?: (stt: number, checkout: Date) => void;
  invoiceFill?: InvoiceFill | null;
  onApplyInvoiceFill?: () => void;
  onDismissInvoiceFill?: () => void;
};
type Mode = "rows" | "customers";

const MODES: [Mode, string][] = [
  ["rows", "Từng hóa đơn"],
  ["customers", "Theo khách hàng"],
];
const COLUMNS_BY_ID = new Map(TABLE_COLUMNS.map((column) => [column.id, column]));

export function ResultsView({
  analysis,
  onEditCheckout,
  invoiceFill,
  onApplyInvoiceFill,
  onDismissInvoiceFill,
}: ResultsViewProps) {
  const [mode, setMode] = useState<Mode>("rows");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  // Only rendered after an upload (never on the server), so reading localStorage here is safe.
  const [prefs, setPrefs] = useState<TablePrefs>(() => loadTablePrefs());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(() => new Set());

  const filteredRows = useMemo(
    () => filterRows(analysis.results, statusFilter, search),
    [analysis.results, statusFilter, search],
  );
  const view = useMemo(
    () => paginate(sortRows(filteredRows, sort), page, prefs.pageSize),
    [filteredRows, sort, page, prefs.pageSize],
  );
  const columns = prefs.columnOrder
    .filter((id) => prefs.visibleColumns.includes(id))
    .flatMap((id) => COLUMNS_BY_ID.get(id) ?? []);

  const updatePrefs = (next: TablePrefs) => {
    setPrefs(next);
    saveTablePrefs(next);
  };

  const handleFilter = (filter: StatusFilter) => {
    setStatusFilter((current) => (current === filter ? "all" : filter));
    setPage(1);
  };
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const handleSort = (column: ColumnId) => {
    setSort((current) => nextSort(current, column));
    setPage(1);
  };
  const handleToggleColumn = (column: ColumnId) => {
    const visible = prefs.visibleColumns;
    updatePrefs({
      ...prefs,
      visibleColumns: visible.includes(column) ? visible.filter((id) => id !== column) : [...visible, column],
    });
  };
  const handleMoveColumn = (column: ColumnId, direction: -1 | 1) => {
    updatePrefs({ ...prefs, columnOrder: moveColumn(prefs.columnOrder, column, direction) });
  };
  const handleResetColumns = () => {
    updatePrefs({ ...prefs, columnOrder: DEFAULT_TABLE_PREFS.columnOrder, visibleColumns: DEFAULT_TABLE_PREFS.visibleColumns });
  };
  const handlePageSize = (value: string) => {
    updatePrefs({ ...prefs, pageSize: PAGE_SIZES.find((size) => String(size) === value) ?? DEFAULT_TABLE_PREFS.pageSize });
    setPage(1);
  };
  const handleToggleRow = (stt: number) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(stt)) next.delete(stt);
      else next.add(stt);
      return next;
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <SummaryTiles counts={analysis.counts} activeFilter={statusFilter} onSelect={handleFilter} />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Cách xem" className="inline-flex rounded-lg border p-0.5">
          {MODES.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? "secondary" : "ghost"}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-96">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Tìm kiếm"
            placeholder="Tìm số HĐ, người mua, nội dung…"
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
            className="pl-8"
          />
        </div>
        {statusFilter !== "all" && (
          <Button variant="secondary" onClick={() => handleFilter("all")} aria-label="Bỏ lọc trạng thái">
            Đang lọc: {statusFilter}
            <XIcon />
          </Button>
        )}
        <div className={cn("sm:ml-auto", mode !== "rows" && "hidden")}>
          <ColumnMenu
            columnOrder={prefs.columnOrder}
            visibleColumns={prefs.visibleColumns}
            onToggle={handleToggleColumn}
            onMove={handleMoveColumn}
            onReset={handleResetColumns}
          />
        </div>
      </div>

      {mode === "customers" ? (
        <CustomerSummary results={filteredRows} />
      ) : (
        <>
          {invoiceFill && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
              <span>
                Áp dụng ngày {formatDate(invoiceFill.checkout)} cho {invoiceFill.stts.length} dòng khác chưa có ngày
                của HĐ số {invoiceFill.invoiceNo}?
              </span>
              <Button size="sm" onClick={onApplyInvoiceFill}>
                Áp dụng
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismissInvoiceFill}>
                Bỏ qua
              </Button>
            </div>
          )}
          <ResultTable
            rows={view.rows}
            columns={columns}
            sort={sort}
            expandedRows={expandedRows}
            onSort={handleSort}
            onToggleRow={handleToggleRow}
            onEditCheckout={onEditCheckout}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {view.total === 0 ? "0 dòng" : `${view.from}–${view.to} / ${view.total} dòng`}
              {view.total !== analysis.results.length && ` (lọc từ ${analysis.results.length})`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                Số dòng/trang
                <NativeSelect
                  size="sm"
                  aria-label="Số dòng/trang"
                  value={String(prefs.pageSize)}
                  onChange={(event) => handlePageSize(event.target.value)}
                >
                  {PAGE_SIZES.map((size) => (
                    <NativeSelectOption key={size} value={String(size)}>
                      {size}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              {view.pageCount > 1 && (
                <>
                  <Button variant="outline" size="sm" disabled={view.page === 1} onClick={() => setPage(view.page - 1)}>
                    ‹ Trước
                  </Button>
                  <span>
                    Trang {view.page}/{view.pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={view.page === view.pageCount}
                    onClick={() => setPage(view.page + 1)}
                  >
                    Sau ›
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
