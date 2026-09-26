"use client";

import { Columns3Icon } from "lucide-react";

import { buttonVariants } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

import { TABLE_COLUMNS } from "../utils/tableColumns";

import type { ColumnId } from "../utils/tableColumns";

type ColumnMenuProps = {
  visibleColumns: ColumnId[];
  onToggle: (column: ColumnId) => void;
};

export function ColumnMenu({ visibleColumns, onToggle }: ColumnMenuProps) {
  const isLastVisible = visibleColumns.length === 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })}>
        <Columns3Icon />
        Cột ({visibleColumns.length}/{TABLE_COLUMNS.length})
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {TABLE_COLUMNS.map((column) => {
          const isVisible = visibleColumns.includes(column.id);
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={isVisible}
              disabled={isVisible && isLastVisible}
              onCheckedChange={() => onToggle(column.id)}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
