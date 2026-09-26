"use client";

import { useCallback, useState } from "react";

import { saveFile } from "@/shared/utils/saveFile";

import { fetchAiOutcomes, resultTemplate } from "@kiemtra/core";
import { analyze, needsAi } from "@kiemtra/core";
import { InputError } from "@kiemtra/core";

import type { AiSettings, AnalysisResult, ColumnMapping, SheetColumn } from "@kiemtra/core";
import type { InputErrorCode } from "@kiemtra/core";
import type ExcelJS from "exceljs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ERROR_MESSAGES: Record<InputErrorCode | "too_large" | "unexpected", string> = {
  unreadable: "Không đọc được file Excel.",
  no_sheet: "File không có sheet dữ liệu.",
  no_rows: "File chưa có dòng hóa đơn nào.",
  too_many_rows: "File có quá 5.000 dòng dữ liệu.",
  too_large: "File vượt quá 10 MB.",
  unexpected: "Đã xảy ra lỗi khi xử lý file.",
};

export type CheckState =
  | { phase: "idle" }
  | { phase: "processing"; fileName: string }
  | {
      phase: "mapping";
      fileName: string;
      workbook: ExcelJS.Workbook;
      columns: SheetColumn[];
      mapping: ColumnMapping;
    }
  | { phase: "done"; runId: number; fileName: string; analysis: AnalysisResult; output: ArrayBuffer }
  | { phase: "error"; message: string };

function outputFileName(fileName: string): string {
  return `${fileName.replace(/\.(xlsx|xlsm)$/i, "")}_ket_qua.xlsx`;
}

function errorMessage(error: unknown): string {
  return error instanceof InputError ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES.unexpected;
}

export function useInvoiceCheck(aiSettings: AiSettings) {
  const [state, setState] = useState<CheckState>({ phase: "idle" });

  const runAnalysis = useCallback(async (fileName: string, workbook: ExcelJS.Workbook, mapping: ColumnMapping) => {
    setState({ phase: "processing", fileName });
    try {
      const { readRows, writeResult } = await import("@kiemtra/core/workbook");
      const input = readRows(workbook, mapping);
      const aiIndices = needsAi(input.rows);
      const outcomes = await fetchAiOutcomes(
        aiIndices.map((index) => input.rows[index].info),
        aiSettings,
      );
      const ai = new Map(aiIndices.map((rowIndex, k) => [rowIndex, outcomes[k]]));
      const analysis = analyze(input.rows, input.threshold, ai);
      const output = await writeResult(resultTemplate(), analysis, fileName);
      setState({ phase: "done", runId: Date.now(), fileName, analysis, output });
    } catch (error) {
      setState({ phase: "error", message: errorMessage(error) });
    }
  }, [aiSettings]);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        setState({ phase: "error", message: ERROR_MESSAGES.too_large });
        return;
      }
      setState({ phase: "processing", fileName: file.name });
      try {
        const { inspectInput } = await import("@kiemtra/core/workbook");
        const inspected = await inspectInput(await file.arrayBuffer());
        if (inspected.isComplete) {
          await runAnalysis(file.name, inspected.workbook, inspected.mapping);
          return;
        }
        const { workbook, columns, mapping } = inspected;
        setState({ phase: "mapping", fileName: file.name, workbook, columns, mapping });
      } catch (error) {
        setState({ phase: "error", message: errorMessage(error) });
      }
    },
    [runAnalysis],
  );

  const handleConfirmMapping = useCallback(
    (mapping: ColumnMapping) => {
      if (state.phase !== "mapping") return;
      void runAnalysis(state.fileName, state.workbook, mapping);
    },
    [state, runAnalysis],
  );

  const handleCancel = useCallback(() => setState({ phase: "idle" }), []);

  const handleDownload = useCallback(() => {
    if (state.phase !== "done") return;
    saveFile(state.output, outputFileName(state.fileName), XLSX_MIME);
  }, [state]);

  return { state, handleFile, handleConfirmMapping, handleCancel, handleDownload };
}
