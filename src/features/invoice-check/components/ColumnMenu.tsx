"use client";

import { ArrowDownIcon, ArrowUpIcon, Columns3Icon } from "lucide-react";

import { Button, buttonVariants } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";

import { TABLE_COLUMNS } from "../utils/tableColumns";

import type { ColumnId } from "../utils/tableColumns";

type ColumnMenuProps = {
  columnOrder: ColumnId[];
  visibleColumns: ColumnId[];
  onToggle: (column: ColumnId) => void;
  onMove: (column: ColumnId, direction: -1 | 1) => void;
  onReset: () => void;
};

const LABELS = new Map(TABLE_COLUMNS.map((column) => [column.id, column.label]));

// A popover, not a menu: each row mixes a checkbox with move buttons, which menus cannot reach by keyboard.
export function ColumnMenu({ columnOrder, visibleColumns, onToggle, onMove, onReset }: ColumnMenuProps) {
  const isLastVisible = visibleColumns.length === 1;
  return (
    <Popover>
      <PopoverTrigger className={buttonVariants({ variant: "outline" })}>
        <Columns3Icon />
        Cột ({visibleColumns.length}/{columnOrder.length})
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-2">
        <p className="px-2 py-1 text-xs text-muted-foreground">Hiện/ẩn cột và đổi thứ tự</p>
        <ul className="flex flex-col">
          {columnOrder.map((id, index) => {
            const label = LABELS.get(id) ?? id;
            const isVisible = visibleColumns.includes(id);
            return (
              <li key={id} className="flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-muted">
                <label className="flex flex-1 cursor-pointer items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={isVisible}
                    disabled={isVisible && isLastVisible}
                    onChange={() => onToggle(id)}
                  />
                  {label}
                </label>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Chuyển cột ${label} sang trái`}
                  disabled={index === 0}
                  onClick={() => onMove(id, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Chuyển cột ${label} sang phải`}
                  disabled={index === columnOrder.length - 1}
                  onClick={() => onMove(id, 1)}
                >
                  <ArrowDownIcon />
                </Button>
              </li>
            );
          })}
        </ul>
        <Button variant="outline" size="sm" className="mt-1" onClick={onReset}>
          Khôi phục mặc định
        </Button>
      </PopoverContent>
    </Popover>
  );
}
