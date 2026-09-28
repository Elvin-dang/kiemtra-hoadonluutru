import { useState } from "react";
import { FileSpreadsheetIcon } from "lucide-react";

import { usePlatform } from "./platform";

import type { SourceFile } from "./platform";

type RecentFilesProps = { isDisabled: boolean; onOpen: (files: Promise<SourceFile[]>) => void };

// Desktop only: the last few files, one click to check again.
export function RecentFiles({ isDisabled, onOpen }: RecentFilesProps) {
  const { recentFiles, openRecent } = usePlatform();
  const [files] = useState(() => recentFiles?.() ?? []);
  if (!openRecent || files.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Mở gần đây</h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => onOpen(openRecent(file.path))}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            >
              <FileSpreadsheetIcon className="size-4 shrink-0 text-green-700" />
              <span className="font-medium">{file.name}</span>
              <span className="min-w-0 truncate text-sm text-muted-foreground">{file.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
