import ExcelJS from "exceljs";

import { formatDate } from "@/shared/utils/formatDate";

import { InputError } from "./inputError";

import type { AnalysisResult, CellValue, InputRow } from "../types/invoice";

export const MAX_ROWS = 5000;
const SOURCE_SHEET = "DU_LIEU_GOC";
const CONFIG_SHEET = "CAU_HINH";
const DEFAULT_THRESHOLD = 1;

export type ParsedInput = { workbook: ExcelJS.Workbook; rows: InputRow[]; threshold: number };

export function normalizeCell(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) return value;
  if (typeof value === "boolean") return String(value);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
  return null;
}

function readThreshold(workbook: ExcelJS.Workbook): number {
  const value = normalizeCell(workbook.getWorksheet(CONFIG_SHEET)?.getCell("B4").value ?? null);
  const threshold = typeof value === "number" ? value : Number(value);
  return Number.isFinite(threshold) && value !== null && value !== "" ? threshold : DEFAULT_THRESHOLD;
}

export async function readInput(data: ArrayBuffer): Promise<ParsedInput> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new InputError("unreadable");
  }
  const sheet = workbook.getWorksheet(SOURCE_SHEET);
  if (!sheet) throw new InputError("no_sheet");

  const rows: InputRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = (column: number) => normalizeCell(sheet.getCell(r, column).value);
    const invoiceNo = cell(1);
    if (invoiceNo === null || invoiceNo === "") continue;
    const info = cell(5);
    rows.push({
      invoiceNo,
      invoiceDate: cell(2),
      taxCode: cell(3),
      buyer: cell(4),
      info: info instanceof Date ? formatDate(info) : String(info ?? ""),
    });
    if (rows.length > MAX_ROWS) throw new InputError("too_many_rows");
  }
  if (rows.length === 0) throw new InputError("no_rows");
  return { workbook, rows, threshold: readThreshold(workbook) };
}

const RESULT_SHEET = "KET_QUA_AI";
const DETAIL_SHEET = "PHAN_TICH_AI";
const RESULT_TEMPLATE_FIRST_ROW = 11;
const DATE_FORMAT = "dd/mm/yyyy";
const RED = "FFFF0000";
const BLACK = "FF000000";
const RESULT_HEADERS = [
  "STT", "Số hóa đơn", "Ngày hóa đơn", "Mã số thuế", "Tên người mua",
  "Thông tin thời gian lưu trú", "Ngày phải lập HĐ", "Số ngày chậm", "Trạng thái",
];
const DETAIL_HEADERS = ["STT", "Thông tin đầu vào", "Ngày AI nhận diện", "Phương pháp", "Độ tin cậy", "Kết quả", "Ghi chú"];

function clearRows(sheet: ExcelJS.Worksheet, firstRow: number, columns: number) {
  for (let r = firstRow; r <= sheet.rowCount; r++) {
    for (let c = 1; c <= columns; c++) sheet.getCell(r, c).value = null;
  }
}

function setRow(sheet: ExcelJS.Worksheet, rowNumber: number, values: CellValue[]) {
  values.forEach((value, i) => {
    const cell = sheet.getCell(rowNumber, i + 1);
    cell.value = value;
    if (value instanceof Date) cell.numFmt = DATE_FORMAT;
  });
}

function sheetOrCreate(workbook: ExcelJS.Workbook, name: string, headers: string[]) {
  const existing = workbook.getWorksheet(name);
  if (existing) return { sheet: existing, isTemplate: true };
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  return { sheet, isTemplate: false };
}

export async function writeResult(workbook: ExcelJS.Workbook, { results, counts }: AnalysisResult): Promise<ArrayBuffer> {
  const result = sheetOrCreate(workbook, RESULT_SHEET, RESULT_HEADERS);
  const detail = sheetOrCreate(workbook, DETAIL_SHEET, DETAIL_HEADERS);
  const firstResultRow = result.isTemplate ? RESULT_TEMPLATE_FIRST_ROW : 2;

  clearRows(result.sheet, firstResultRow, RESULT_HEADERS.length);
  clearRows(detail.sheet, 2, DETAIL_HEADERS.length);

  results.forEach((row, i) => {
    setRow(detail.sheet, 2 + i, [
      row.stt, row.info, row.checkout, row.method, row.confidence,
      row.checkout ? "Đã xác định" : "Không xác định", row.note,
    ]);
    const rowNumber = firstResultRow + i;
    setRow(result.sheet, rowNumber, [
      row.stt, row.invoiceNo, row.invoiceDate, row.taxCode, row.buyer, row.info, row.checkout, row.delay, row.status,
    ]);
    const statusCell = result.sheet.getCell(rowNumber, 9);
    statusCell.font = { ...statusCell.font, color: { argb: row.status === "Cảnh báo" ? RED : BLACK } };
  });

  if (result.isTemplate) {
    result.sheet.getCell("F6").value = counts.total;
    result.sheet.getCell("G6").value = counts.ok;
    result.sheet.getCell("H6").value = counts.warn;
    result.sheet.getCell("I6").value = counts.unknown;
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
