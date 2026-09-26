"use client";

import { useCallback, useState } from "react";

import { analyze, fetchAiOutcomes, InputError, needsAi, resultTemplate } from "@kiemtra/core";

import { usePlatform } from "./platform";

import type { AiSettings, AnalysisResult, ColumnMapping, InputErrorCode, SheetColumn } from "@kiemtra/core";
import type ExcelJS from "exceljs";
import type { SourceFile } from "./platform";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ERROR_MESSAGES: Record<InputErrorCode | "too_large" | "unexpected", string> = {
  unreadable: "Không đọc được file Excel.",
  no_sheet: "File không có sheet dữ liệu.",
  no_rows: "File chưa có dòng hóa đơn nào.",
  too_many_rows: "File có quá 5.000 dòng dữ liệu.",
  too_large: "File vượt quá 10 MB.",
  unexpected: "Đã xảy ra lỗi khi xử lý file.",
};

type SourceRef = Pick<SourceFile, "name" | "path">;

export type CheckState =
  | { phase: "idle" }
  | { phase: "processing"; fileName: string }
  | { phase: "mapping"; source: SourceRef; workbook: ExcelJS.Workbook; columns: SheetColumn[]; mapping: ColumnMapping }
  | { phase: "done"; runId: number; source: SourceRef; analysis: AnalysisResult; output: ArrayBuffer }
  | { phase: "error"; message: string };

export function outputFileName(fileName: string): string {
  return `${fileName.replace(/\.(xlsx|xlsm)$/i, "")}_ket_qua.xlsx`;
}

function errorMessage(error: unknown): string {
  return error instanceof InputError ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES.unexpected;
}

export function useInvoiceCheck(aiSettings: AiSettings) {
  const platform = usePlatform();
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const runAnalysis = useCallback(
    async (source: SourceRef, workbook: ExcelJS.Workbook, mapping: ColumnMapping) => {
      setState({ phase: "processing", fileName: source.name });
      setSavedTo(null);
      setSaveError(null);
      try {
        const { readRows, writeResult } = await import("@kiemtra/core/workbook");
        const input = readRows(workbook, mapping);
        const aiIndices = needsAi(input.rows);
        const outcomes = await fetchAiOutcomes(
          aiIndices.map((index) => input.rows[index].info),
          aiSettings,
          platform.askAi,
        );
        const ai = new Map(aiIndices.map((rowIndex, k) => [rowIndex, outcomes[k]]));
        const analysis = analyze(input.rows, input.threshold, ai);
        const output = await writeResult(resultTemplate(), analysis, source.name);
        setState({ phase: "done", runId: Date.now(), source, analysis, output });
      } catch (error) {
        setState({ phase: "error", message: errorMessage(error) });
      }
    },
    [aiSettings, platform],
  );

  const handleFile = useCallback(
    async (file: SourceFile) => {
      if (file.data.byteLength > MAX_FILE_BYTES) {
        setState({ phase: "error", message: ERROR_MESSAGES.too_large });
        return;
      }
      const source: SourceRef = { name: file.name, path: file.path };
      setState({ phase: "processing", fileName: file.name });
      try {
        const { inspectInput } = await import("@kiemtra/core/workbook");
        const inspected = await inspectInput(file.data);
        if (inspected.isComplete) {
          await runAnalysis(source, inspected.workbook, inspected.mapping);
          return;
        }
        const { workbook, columns, mapping } = inspected;
        setState({ phase: "mapping", source, workbook, columns, mapping });
      } catch (error) {
        setState({ phase: "error", message: errorMessage(error) });
      }
    },
    [runAnalysis],
  );

  const handleConfirmMapping = useCallback(
    (mapping: ColumnMapping) => {
      if (state.phase !== "mapping") return;
      void runAnalysis(state.source, state.workbook, mapping);
    },
    [state, runAnalysis],
  );

  const handleCancel = useCallback(() => setState({ phase: "idle" }), []);

  const handleSave = useCallback(async () => {
    if (state.phase !== "done") return;
    try {
      const outcome = await platform.saveResult(state.output, outputFileName(state.source.name), state.source);
      setSavedTo(outcome.savedTo);
      setSaveError(null);
    } catch (error) {
      setSaveError(`Không lưu được file: ${String(error)}`);
    }
  }, [state, platform]);

  return { state, savedTo, saveError, handleFile, handleConfirmMapping, handleCancel, handleSave };
}
