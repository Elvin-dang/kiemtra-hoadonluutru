import { useEffect, useState } from "react";
import { ArrowUpCircleIcon } from "lucide-react";

import { noteItems, parseChangelog } from "@kiemtra/core";

import { Button, buttonVariants } from "./components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { usePlatform } from "./platform";

import type { UpdateInfo } from "./platform";

const SEEN_VERSION_KEY = "kiemtra-hoadon:seen-version";

function readSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeSeenVersion(version: string) {
  try {
    window.localStorage.setItem(SEEN_VERSION_KEY, version);
  } catch {
    // Storage off: the "Mới" mark just shows again next time.
  }
}

function NoteList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

// A small version button in the corner: marks a newer release (ask before updating) or
// what changed since the last run, and never takes space from the workspace.
export function VersionBadge() {
  const { app } = usePlatform();
  const [version, setVersion] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app) return;
    let isActive = true;
    void app.version().then((current) => {
      if (!isActive) return;
      const seen = readSeenVersion();
      setVersion(current);
      if (seen && seen !== current) setIsNew(true);
      else writeSeenVersion(current);
    });
    void app.checkUpdate().then((info) => isActive && setUpdate(info)).catch(() => {});
    return () => {
      isActive = false;
    };
  }, [app]);

  if (!app || !version) return null;

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && isNew) {
      writeSeenVersion(version);
      setIsNew(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await app.installUpdate();
    } catch (installError) {
      setError(String(installError));
      setIsInstalling(false);
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger className={buttonVariants({ variant: "ghost", size: "sm" })}>
        {update ? (
          <>
            <ArrowUpCircleIcon className="text-green-700" />
            <span>
              v{version} · <span className="text-green-700">Có bản {update.version}</span>
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            v{version}
            {isNew && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">Mới</span>}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto p-4 text-sm">
        {update && (
          <div className="flex flex-col gap-2 border-b pb-3">
            <p className="font-medium">Có phiên bản mới {update.version}</p>
            <NoteList items={noteItems(update.notes)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={isInstalling} onClick={() => void handleInstall()}>
                {isInstalling ? "Đang tải bản cập nhật…" : "Cập nhật ngay"}
              </Button>
              {error && <span className="text-destructive">{error}</span>}
            </div>
          </div>
        )}
        <p className="font-medium">Có gì mới</p>
        {parseChangelog(app.changelog).map((entry) => (
          <div key={entry.version} className="flex flex-col gap-1">
            <p className="font-medium">
              {entry.version}
              {entry.version === version && <span className="font-normal text-muted-foreground"> (đang dùng)</span>}
              {entry.date && <span className="font-normal text-muted-foreground"> — {entry.date}</span>}
            </p>
            <NoteList items={entry.items} />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
