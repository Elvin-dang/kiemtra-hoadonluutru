import { cn } from "cn";

import type { Counts } from "../types/invoice";
import type { StatusFilter } from "../utils/tableView";

type SummaryTilesProps = {
  counts: Counts;
  activeFilter: StatusFilter;
  onSelect: (filter: StatusFilter) => void;
};

// The tiles double as the status filter: click one to show only those rows.
export function SummaryTiles({ counts, activeFilter, onSelect }: SummaryTilesProps) {
  const tiles: { filter: StatusFilter; label: string; value: number; tone: string }[] = [
    { filter: "all", label: "Tổng hóa đơn", value: counts.total, tone: "text-foreground" },
    { filter: "Bình thường", label: "Bình thường", value: counts.ok, tone: "text-green-700" },
    { filter: "Cảnh báo", label: "Cảnh báo", value: counts.warn, tone: "text-red-600" },
    { filter: "Không xác định", label: "Không xác định", value: counts.unknown, tone: "text-amber-600" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {tiles.map((tile) => {
        const isActive = activeFilter === tile.filter;
        return (
          <button
            key={tile.label}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(tile.filter)}
            className={cn(
              "flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              isActive && "border-foreground ring-1 ring-foreground",
            )}
          >
            <span className="text-sm text-muted-foreground">{tile.label}</span>
            <span className={cn("text-3xl font-bold", tile.tone)}>{tile.value}</span>
          </button>
        );
      })}
    </div>
  );
}
