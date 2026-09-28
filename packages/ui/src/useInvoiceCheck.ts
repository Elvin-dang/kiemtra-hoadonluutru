"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  analyze,
  applyManualDates,
  fetchAiOutcomes,
  InputError,
  mightHaveDate,
  NO_DATE_NOTE,
  needsAi,
  onlyWarnings,
  recallMapping,
  rememberManualDates,
  rememberMapping,
  resultTemplate,
  sameInvoiceWithoutDate,
  setManualCheckout,
  withAiCache,
} from "@kiemtra/core";

import { usePlatform } from "./platform";

import type {
  AiOutcome,
  AiProgress,
  AiSettings,
  AnalysisResult,
  ColumnMapping,
  Counts,
  InputErrorCode,
  SheetColumn,
} from "@kiemtra/core";
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

// After a date is typed: the other dateless lines of that invoice, offered the same date.
export type InvoiceFill = { invoiceNo: string; checkout: Date; stts: number[] };

export type CheckState =
  | { phase: "idle" }
  | { phase: "processing"; fileName: string }
  | { phase: "mapping"; source: SourceRef; workbook: ExcelJS.Workbook; columns: SheetColumn[]; mapping: ColumnMapping }
  | { phase: "done"; runId: number; source: SourceRef; analysis: AnalysisResult; threshold: number }
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

async function buildWorkbook(analysis: AnalysisResult, sourceName: string): Promise<ArrayBuffer> {
  const { writeResult } = await import("@kiemtra/core/workbook");
  return writeResult(resultTemplate(), analysis, sourceName);
}

export function useInvoiceCheck(aiSettings: AiSettings) {
  const platform = usePlatform();
  const askAi = useMemo(() => withAiCache(platform.askAi), [platform]);
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
  const [invoiceFill, setInvoiceFill] = useState<InvoiceFill | null>(null);
  // The result on screen (with any typed dates) has not been written to Excel yet.
  const [isUnsaved, setIsUnsaved] = useState(false);
  const stopRef = useRef<AbortController | null>(null);

  const check = useCallback(
    async (workbook: ExcelJS.Workbook, mapping: ColumnMapping, signal: AbortSignal) => {
      const { readRows } = await import("@kiemtra/core/workbook");
      const input = readRows(workbook, mapping);
      const candidates = needsAi(input.rows);
      const aiIndices = aiSettings.isPrecheckEnabled
        ? candidates.filter((index) => mightHaveDate(input.rows[index].info))
        : candidates;
      const outcomes = await fetchAiOutcomes(
        aiIndices.map((index) => input.rows[index].info),
        aiSettings,
        askAi,
        { signal, onProgress: (progress) => setAiProgress(progress.total > 0 ? progress : null) },
      );
      setAiProgress(null);
      const ai = new Map<number, AiOutcome>(candidates.map((rowIndex) => [rowIndex, { date: null, note: NO_DATE_NOTE }]));
      aiIndices.forEach((rowIndex, k) => ai.set(rowIndex, outcomes[k]));
      const analysis = applyManualDates(analyze(input.rows, input.threshold, ai), input.threshold);
      return { analysis, threshold: input.threshold };
    },
    [aiSettings, askAi],
  );

  // One stop button per run: it ends AI for the file being checked and any files after it.
  const startRun = () => {
    const controller = new AbortController();
    stopRef.current = controller;
    return controller.signal;
  };

  const runAnalysis = useCallback(
    async (source: SourceRef, workbook: ExcelJS.Workbook, mapping: ColumnMapping) => {
      setState({ phase: "processing", fileName: source.name });
      setInvoiceFill(null);
      setSavedTo(null);
      setSaveError(null);
      try {
        const { analysis, threshold } = await check(workbook, mapping, startRun());
        setState({ phase: "done", runId: Date.now(), source, analysis, threshold });
        setIsUnsaved(true);
      } catch (error) {
        setAiProgress(null);
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
        const remembered = inspected.isComplete ? null : recallMapping(inspected.columns);
        if (inspected.isComplete || remembered) {
          await runAnalysis(source, inspected.workbook, remembered ?? inspected.mapping);
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
      const signal = startRun();
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
          const mapping = inspected.isComplete ? inspected.mapping : recallMapping(inspected.columns);
          if (!mapping) throw new Error(NEEDS_MAPPING);
          const { analysis } = await check(inspected.workbook, mapping, signal);
          const output = await buildWorkbook(analysis, file.name);
          const { savedTo } = await platform.saveResult(output, outputFileName(file.name), source);
          update(index, { status: "done", counts: analysis.counts, savedTo });
        } catch (error) {
          setAiProgress(null);
          const message =
            error instanceof InputError ? errorMessage(error) : error instanceof Error ? error.message : String(error);
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
      rememberMapping(state.columns, mapping);
      void runAnalysis(state.source, state.workbook, mapping);
    },
    [state, runAnalysis],
  );

  const handleCancel = useCallback(() => setState({ phase: "idle" }), []);

  const handleStopAi = useCallback(() => stopRef.current?.abort(), []);

  const handleEditCheckout = useCallback(
    (stt: number, checkout: Date) => {
      if (state.phase !== "done") return;
      const row = state.analysis.results.find((candidate) => candidate.stt === stt);
      if (!row) return;
      rememberManualDates([row], checkout);
      const analysis = setManualCheckout(state.analysis, stt, checkout, state.threshold);
      setState({ ...state, analysis });
      setIsUnsaved(true);
      const others = sameInvoiceWithoutDate(analysis, stt);
      setInvoiceFill(
        others.length > 0 ? { invoiceNo: String(row.invoiceNo ?? ""), checkout, stts: others.map((o) => o.stt) } : null,
      );
    },
    [state],
  );

  const handleApplyInvoiceFill = useCallback(() => {
    if (state.phase !== "done" || !invoiceFill) return;
    const rows = state.analysis.results.filter((row) => invoiceFill.stts.includes(row.stt));
    rememberManualDates(rows, invoiceFill.checkout);
    const analysis = rows.reduce(
      (current, row) => setManualCheckout(current, row.stt, invoiceFill.checkout, state.threshold),
      state.analysis,
    );
    setState({ ...state, analysis });
    setIsUnsaved(true);
    setInvoiceFill(null);
  }, [state, invoiceFill]);

  const handleDismissInvoiceFill = useCallback(() => setInvoiceFill(null), []);

  const save = useCallback(async (write: () => Promise<{ savedTo: string | null }>, isFullResult = true) => {
    try {
      const outcome = await write();
      if (outcome.savedTo) setSavedTo(outcome.savedTo);
      if (outcome.savedTo && isFullResult) setIsUnsaved(false);
      setSaveError(null);
    } catch (error) {
      setSaveError(`Không lưu được file: ${String(error)}`);
    }
  }, []);

  // The workbook is built at save time, so dates typed into the table are included.
  const handleSave = useCallback(async () => {
    if (state.phase !== "done") return;
    const { analysis, source } = state;
    await save(async () =>
      platform.saveResult(await buildWorkbook(analysis, source.name), outputFileName(source.name), source),
    );
  }, [state, platform, save]);

  const handleSaveAs = useCallback(async () => {
    if (state.phase !== "done" || !platform.saveResultAs) return;
    const { analysis, source } = state;
    const saveResultAs = platform.saveResultAs;
    await save(async () => saveResultAs(await buildWorkbook(analysis, source.name), outputFileName(source.name)));
  }, [state, platform, save]);

  const handleSaveWarnings = useCallback(async () => {
    if (state.phase !== "done") return;
    const { analysis, source } = state;
    await save(
      async () =>
        platform.saveResult(await buildWorkbook(onlyWarnings(analysis), source.name), warningsFileName(source.name), source),
      false,
    );
  }, [state, platform, save]);

  return {
    state,
    savedTo,
    saveError,
    isUnsaved,
    aiProgress,
    openFiles,
    handleConfirmMapping,
    handleCancel,
    handleStopAi,
    handleEditCheckout,
    invoiceFill,
    handleApplyInvoiceFill,
    handleDismissInvoiceFill,
    handleSave,
    handleSaveAs,
    handleSaveWarnings,
  };
}
