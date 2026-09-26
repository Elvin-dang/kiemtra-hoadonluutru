"use client";

import { AiSettingsPanel } from "./AiSettingsPanel";
import { ColumnMapping } from "./ColumnMapping";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { usePlatform } from "./platform";
import { ResultsView } from "./ResultsView";
import { useAiSettings } from "./useAiSettings";
import { useInvoiceCheck } from "./useInvoiceCheck";

import type { ChangeEvent } from "react";

export function InvoiceCheck() {
  const platform = usePlatform();
  const ai = useAiSettings();
  const { state, savedTo, saveError, handleFile, handleConfirmMapping, handleCancel, handleSave } = useInvoiceCheck(
    ai.settings,
  );
  const isProcessing = state.phase === "processing";

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (file) await handleFile({ name: file.name, path: null, data: await file.arrayBuffer() });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Kiểm tra thời điểm lập hóa đơn lưu trú</h1>
        <p className="text-muted-foreground">
          Tải lên file Excel xuất hóa đơn điện tử bán ra. Hệ thống tìm ngày check-out và cảnh báo hóa đơn lập trễ.
        </p>
        <p className="text-sm text-muted-foreground">{platform.privacyNotice}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="file"
          accept=".xlsx,.xlsm"
          aria-label="Chọn file Excel"
          className="max-w-sm"
          disabled={isProcessing}
          onChange={(event) => void handleChange(event)}
        />
        {state.phase === "done" && (
          <Button onClick={() => void handleSave()}>{platform.kind === "desktop" ? "Lưu kết quả" : "Tải kết quả"}</Button>
        )}
      </div>

      {savedTo && <p className="text-sm text-green-700">Đã lưu: {savedTo}</p>}
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

      {isProcessing && <p className="text-muted-foreground">Đang xử lý…</p>}

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
    </main>
  );
}
