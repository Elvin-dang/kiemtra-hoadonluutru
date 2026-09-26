"use client";

import { useMemo, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

import { DEFAULT_VISIBLE_COLUMNS, TABLE_COLUMNS } from "../utils/tableColumns";
import { filterRows, nextSort, paginate, sortRows } from "../utils/tableView";
import { ColumnMenu } from "./ColumnMenu";
import { ResultTable } from "./ResultTable";
import { SummaryTiles } from "./SummaryTiles";

import type { AnalysisResult } from "../types/invoice";
import type { ColumnId } from "../utils/tableColumns";
import type { SortState, StatusFilter } from "../utils/tableView";

type ResultsViewProps = { analysis: AnalysisResult };

const PAGE_SIZE = 50;

export function ResultsView({ analysis }: ResultsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_VISIBLE_COLUMNS);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(() => new Set());

  const view = useMemo(
    () => paginate(sortRows(filterRows(analysis.results, statusFilter, search), sort), page, PAGE_SIZE),
    [analysis.results, statusFilter, search, sort, page],
  );
  const columns = TABLE_COLUMNS.filter((column) => visibleColumns.includes(column.id));

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
    setVisibleColumns((current) =>
      current.includes(column) ? current.filter((id) => id !== column) : [...current, column],
    );
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
        <div className="sm:ml-auto">
          <ColumnMenu visibleColumns={visibleColumns} onToggle={handleToggleColumn} />
        </div>
      </div>

      <ResultTable
        rows={view.rows}
        columns={columns}
        sort={sort}
        expandedRows={expandedRows}
        onSort={handleSort}
        onToggleRow={handleToggleRow}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {view.total === 0 ? "0 dòng" : `${view.from}–${view.to} / ${view.total} dòng`}
          {view.total !== analysis.results.length && ` (lọc từ ${analysis.results.length})`}
        </span>
        {view.pageCount > 1 && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </div>
    </section>
  );
}
