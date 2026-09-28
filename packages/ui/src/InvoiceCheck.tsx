"use client";

import { useCallback, useEffect } from "react";

import { AiSettingsPanel } from "./AiSettingsPanel";
import { BatchResults } from "./BatchResults";
import { ColumnMapping } from "./ColumnMapping";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { usePlatform } from "./platform";
import { ResultsView } from "./ResultsView";
import { useAiSettings } from "./useAiSettings";
import { useInvoiceCheck } from "./useInvoiceCheck";
import { VersionBadge } from "./VersionBadge";

import type { ChangeEvent } from "react";

export function InvoiceCheck() {
  const platform = usePlatform();
  const ai = useAiSettings();
  const {
    state,
    savedTo,
    saveError,
    openFiles,
    handleConfirmMapping,
    handleCancel,
    handleSave,
    handleSaveAs,
    handleSaveWarnings,
  } = useInvoiceCheck(ai.settings);
  const isProcessing = state.phase === "processing" || (state.phase === "batch" && state.isRunning);
  const isDone = state.phase === "done";
  const warnCount = state.phase === "done" ? state.analysis.counts.warn : 0;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void openFiles(Promise.all(files.map(async (file) => ({ name: file.name, path: null, data: await file.arrayBuffer() }))));
  };

  // Desktop: files dropped on the window or passed at launch.
  useEffect(() => platform.onExternalFiles?.((files) => void openFiles(files)), [platform, openFiles]);

  const handlePick = useCallback(() => {
    if (platform.pickFiles && !isProcessing) void openFiles(platform.pickFiles());
  }, [platform, isProcessing, openFiles]);

  // Desktop shortcuts: Ctrl+O open, Ctrl+S save, Ctrl+Shift+S save as (Cmd on macOS).
  useEffect(() => {
    if (!platform.pickFiles) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "o" && !event.shiftKey) handlePick();
      else if (key === "s" && isDone) void (event.shiftKey ? handleSaveAs() : handleSave());
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [platform, isDone, handlePick, handleSave, handleSaveAs]);

  return (
    <main className="flex w-full flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-bold">Kiểm tra thời điểm lập hóa đơn lưu trú</h1>
          <VersionBadge />
        </div>
        <p className="text-muted-foreground">
          Tải lên file Excel xuất hóa đơn điện tử bán ra. Hệ thống tìm ngày check-out và cảnh báo hóa đơn lập trễ.
        </p>
        <p className="text-sm text-muted-foreground">{platform.privacyNotice}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {platform.pickFiles ? (
          <Button variant="outline" disabled={isProcessing} onClick={handlePick} title="Ctrl+O">
            Chọn file Excel
          </Button>
        ) : (
          <Input
            type="file"
            accept=".xlsx,.xlsm"
            aria-label="Chọn file Excel"
            multiple
            className="max-w-sm"
            disabled={isProcessing}
            onChange={(event) => void handleChange(event)}
          />
        )}
        {isDone && (
          <>
            <Button onClick={() => void handleSave()} title="Ctrl+S">
              {platform.kind === "desktop" ? "Lưu kết quả" : "Tải kết quả"}
            </Button>
            {platform.saveResultAs && (
              <Button variant="outline" onClick={() => void handleSaveAs()} title="Ctrl+Shift+S">
                Lưu thành…
              </Button>
            )}
            {warnCount > 0 && (
              <Button variant="outline" onClick={() => void handleSaveWarnings()}>
                Lưu Cảnh báo ({warnCount})
              </Button>
            )}
          </>
        )}
      </div>

      {savedTo && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-green-700">Đã lưu: {savedTo}</span>
          {platform.openResult && (
            <Button variant="outline" size="sm" onClick={() => void platform.openResult?.(savedTo)}>
              Mở file
            </Button>
          )}
          {platform.revealFile && (
            <Button variant="outline" size="sm" onClick={() => void platform.revealFile?.(savedTo)}>
              Mở thư mục
            </Button>
          )}
        </div>
      )}
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <AiSettingsPanel
        settings={ai.settings}
        limits={ai.limits}
        onChange={ai.updateSettings}
        onReset={ai.resetSettings}
      />

      {state.phase === "processing" && <p className="text-muted-foreground">Đang xử lý…</p>}

      {state.phase === "mapping" && (
        <ColumnMapping
          key={state.source.name}
          fileName={state.source.name}
          columns={state.columns}
          initialMapping={state.mapping}
          onConfirm={handleConfirmMapping}
          onCancel={handleCancel}
        />
      )}

      {state.phase === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.phase === "done" && <ResultsView key={state.runId} analysis={state.analysis} />}

      {state.phase === "batch" && <BatchResults items={state.items} isRunning={state.isRunning} />}
    </main>
  );
}
