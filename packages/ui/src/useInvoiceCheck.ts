"use client";

import { useCallback, useState } from "react";

import { analyze, fetchAiOutcomes, InputError, needsAi, onlyWarnings, resultTemplate } from "@kiemtra/core";

import { usePlatform } from "./platform";

import type { AiSettings, AnalysisResult, ColumnMapping, Counts, InputErrorCode, SheetColumn } from "@kiemtra/core";
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
const NEEDS_MAPPING = "Không tự nhận được cột — mở riêng file này để chọn cột.";

type SourceRef = Pick<SourceFile, "name" | "path">;

export type BatchItem = {
  name: string;
  status: "waiting" | "working" | "done" | "error";
  counts?: Counts;
  savedTo?: string | null;
  message?: string;
};

export type CheckState =
  | { phase: "idle" }
  | { phase: "processing"; fileName: string }
  | { phase: "mapping"; source: SourceRef; workbook: ExcelJS.Workbook; columns: SheetColumn[]; mapping: ColumnMapping }
  | { phase: "done"; runId: number; source: SourceRef; analysis: AnalysisResult; output: ArrayBuffer }
  | { phase: "batch"; items: BatchItem[]; isRunning: boolean }
  | { phase: "error"; message: string };

function stem(fileName: string): string {
  return fileName.replace(/\.(xlsx|xlsm)$/i, "");
}

export function outputFileName(fileName: string): string {
  return `${stem(fileName)}_ket_qua.xlsx`;
}

export function warningsFileName(fileName: string): string {
  return `${stem(fileName)}_canh_bao.xlsx`;
}

function errorMessage(error: unknown): string {
  return error instanceof InputError ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES.unexpected;
}

export function useInvoiceCheck(aiSettings: AiSettings) {
  const platform = usePlatform();
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const check = useCallback(
    async (source: SourceRef, workbook: ExcelJS.Workbook, mapping: ColumnMapping) => {
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
      return { analysis, output };
    },
    [aiSettings, platform],
  );

  const runAnalysis = useCallback(
    async (source: SourceRef, workbook: ExcelJS.Workbook, mapping: ColumnMapping) => {
      setState({ phase: "processing", fileName: source.name });
      setSavedTo(null);
      setSaveError(null);
      try {
        const { analysis, output } = await check(source, workbook, mapping);
        setState({ phase: "done", runId: Date.now(), source, analysis, output });
      } catch (error) {
        setState({ phase: "error", message: errorMessage(error) });
      }
    },
    [check],
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

  // Several files: each is checked in turn and its result saved next to it; one failure never stops the rest.
  const runBatch = useCallback(
    async (files: SourceFile[]) => {
      setSavedTo(null);
      setSaveError(null);
      const items: BatchItem[] = files.map((file) => ({ name: file.name, status: "waiting" }));
      const update = (index: number, item: Partial<BatchItem>, isRunning = true) => {
        items[index] = { ...items[index], ...item };
        setState({ phase: "batch", items: [...items], isRunning });
      };
      const { inspectInput } = await import("@kiemtra/core/workbook");
      for (const [index, file] of files.entries()) {
        update(index, { status: "working" });
        try {
          if (file.data.byteLength > MAX_FILE_BYTES) throw new Error(ERROR_MESSAGES.too_large);
          const source: SourceRef = { name: file.name, path: file.path };
          const inspected = await inspectInput(file.data);
          if (!inspected.isComplete) throw new Error(NEEDS_MAPPING);
          const { analysis, output } = await check(source, inspected.workbook, inspected.mapping);
          const { savedTo } = await platform.saveResult(output, outputFileName(file.name), source);
          update(index, { status: "done", counts: analysis.counts, savedTo });
        } catch (error) {
          const message = error instanceof InputError ? errorMessage(error) : error instanceof Error ? error.message : String(error);
          update(index, { status: "error", message: message || ERROR_MESSAGES.unexpected });
        }
      }
      setState({ phase: "batch", items: [...items], isRunning: false });
    },
    [check, platform],
  );

  const openFiles = useCallback(
    async (pending: Promise<SourceFile[]>) => {
      try {
        const files = await pending;
        // A cancelled picker (no files) leaves whatever is on screen untouched.
        if (files.length === 1) await handleFile(files[0]);
        else if (files.length > 1) await runBatch(files);
      } catch (error) {
        setState({ phase: "error", message: typeof error === "string" ? error : ERROR_MESSAGES.unreadable });
      }
    },
    [handleFile, runBatch],
  );

  const handleConfirmMapping = useCallback(
    (mapping: ColumnMapping) => {
      if (state.phase !== "mapping") return;
      void runAnalysis(state.source, state.workbook, mapping);
    },
    [state, runAnalysis],
  );

  const handleCancel = useCallback(() => setState({ phase: "idle" }), []);

  const save = useCallback(
    async (write: () => Promise<{ savedTo: string | null }>) => {
      try {
        const outcome = await write();
        if (outcome.savedTo) setSavedTo(outcome.savedTo);
        setSaveError(null);
      } catch (error) {
        setSaveError(`Không lưu được file: ${String(error)}`);
      }
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (state.phase !== "done") return;
    await save(() => platform.saveResult(state.output, outputFileName(state.source.name), state.source));
  }, [state, platform, save]);

  const handleSaveAs = useCallback(async () => {
    if (state.phase !== "done" || !platform.saveResultAs) return;
    const saveResultAs = platform.saveResultAs;
    await save(() => saveResultAs(state.output, outputFileName(state.source.name)));
  }, [state, platform, save]);

  const handleSaveWarnings = useCallback(async () => {
    if (state.phase !== "done") return;
    const { source, analysis } = state;
    await save(async () => {
      const { writeResult } = await import("@kiemtra/core/workbook");
      const data = await writeResult(resultTemplate(), onlyWarnings(analysis), source.name);
      return platform.saveResult(data, warningsFileName(source.name), source);
    });
  }, [state, platform, save]);

  return {
    state,
    savedTo,
    saveError,
    openFiles,
    handleConfirmMapping,
    handleCancel,
    handleSave,
    handleSaveAs,
    handleSaveWarnings,
  };
}
