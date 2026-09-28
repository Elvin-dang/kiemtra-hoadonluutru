import { useEffect, useState } from "react";

import { noteItems, parseChangelog } from "@kiemtra/core";

import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
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
    // Private storage off: the "what's new" note just shows again next time.
  }
}

function NoteList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 list-disc pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

// A newer release on GitHub (ask before updating), or what changed right after an update.
export function UpdateNotice() {
  const { app } = usePlatform();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [justUpdated, setJustUpdated] = useState<{ version: string; items: string[] } | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app) return;
    let isActive = true;
    void app.version().then((version) => {
      // A cancelled run (StrictMode's first mount) must not mark the version as seen.
      if (!isActive) return;
      const seen = readSeenVersion();
      if (seen && seen !== version) {
        const entry = parseChangelog(app.changelog).find((candidate) => candidate.version === version);
        setJustUpdated({ version, items: entry?.items ?? [] });
      }
      writeSeenVersion(version);
    });
    void app.checkUpdate().then((info) => isActive && setUpdate(info)).catch(() => {});
    return () => {
      isActive = false;
    };
  }, [app]);

  if (!app) return null;

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
    <>
      {update && (
        <Alert>
          <AlertTitle>Có phiên bản mới {update.version}</AlertTitle>
          <AlertDescription>
            <NoteList items={noteItems(update.notes)} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={isInstalling} onClick={() => void handleInstall()}>
                {isInstalling ? "Đang tải bản cập nhật…" : "Cập nhật ngay"}
              </Button>
              <Button size="sm" variant="ghost" disabled={isInstalling} onClick={() => setUpdate(null)}>
                Để sau
              </Button>
              {error && <span className="text-destructive">{error}</span>}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {justUpdated && (
        <Alert>
          <AlertTitle>Đã cập nhật lên phiên bản {justUpdated.version} — Có gì mới</AlertTitle>
          <AlertDescription>
            <NoteList items={justUpdated.items} />
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setJustUpdated(null)}>
              Đóng
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
