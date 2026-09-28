import { useEffect, useState } from "react";

import { parseChangelog } from "@kiemtra/core";

import { Button } from "./components/ui/button";
import { usePlatform } from "./platform";

export function VersionFooter() {
  const { app } = usePlatform();
  const [version, setVersion] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    void app?.version().then(setVersion);
  }, [app]);

  if (!app || !version) return null;

  return (
    <footer className="flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Phiên bản {version}</span>
        <span aria-hidden>·</span>
        <Button variant="link" size="sm" className="h-auto p-0" aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "Ẩn nhật ký thay đổi" : "Có gì mới"}
        </Button>
      </div>
      {isOpen && (
        <div className="flex flex-col gap-3">
          {parseChangelog(app.changelog).map((entry) => (
            <div key={entry.version}>
              <p className="font-medium text-foreground">
                {entry.version}
                {entry.date && <span className="font-normal text-muted-foreground"> — {entry.date}</span>}
              </p>
              <ul className="list-disc pl-5">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}
