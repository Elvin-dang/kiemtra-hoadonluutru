import ExcelJS from "exceljs";

import { formatDate } from "@/shared/utils/formatDate";

import { suggestMapping } from "./columns";
import { InputError } from "./inputError";

import type { AnalysisResult, CellValue, ColumnMapping, InputRow, SheetColumn, Status } from "../types/invoice";

export const MAX_ROWS = 5000;
const SOURCE_SHEET = "DU_LIEU_GOC";
const CONFIG_SHEET = "CAU_HINH";
const DEFAULT_THRESHOLD = 1;

export type InspectedInput = {
  workbook: ExcelJS.Workbook;
  columns: SheetColumn[];
  mapping: ColumnMapping;
  isExactLayout: boolean;
};

export type ParsedRows = { rows: InputRow[]; threshold: number };

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

function sourceSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(SOURCE_SHEET);
  if (!sheet) throw new InputError("no_sheet");
  return sheet;
}

export async function inspectInput(data: ArrayBuffer): Promise<InspectedInput> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new InputError("unreadable");
  }
  const sheet = sourceSheet(workbook);
  if (sheet.rowCount < 2) throw new InputError("no_rows");

  const columns: SheetColumn[] = [];
  for (let c = 1; c <= sheet.columnCount; c++) {
    const header = normalizeCell(sheet.getCell(1, c).value);
    columns.push({
      index: c,
      letter: sheet.getColumn(c).letter,
      header: header instanceof Date ? formatDate(header) : String(header ?? "").trim(),
    });
  }
  const { mapping, isExactLayout } = suggestMapping(columns.map((column) => column.header));
  return { workbook, columns, mapping, isExactLayout };
}

export function readRows(workbook: ExcelJS.Workbook, mapping: ColumnMapping): ParsedRows {
  const sheet = sourceSheet(workbook);
  const rows: InputRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = (column: number | null) => (column === null ? null : normalizeCell(sheet.getCell(r, column).value));
    const invoiceNo = cell(mapping.invoiceNo);
    if (invoiceNo === null || invoiceNo === "") continue;
    const info = cell(mapping.info);
    rows.push({
      invoiceNo,
      invoiceDate: cell(mapping.invoiceDate),
      taxCode: cell(mapping.taxCode),
      buyer: cell(mapping.buyer),
      info: info instanceof Date ? formatDate(info) : String(info ?? ""),
    });
    if (rows.length > MAX_ROWS) throw new InputError("too_many_rows");
  }
  if (rows.length === 0) throw new InputError("no_rows");
  return { rows, threshold: readThreshold(workbook) };
}

const RESULT_SHEET = "KET_QUA_AI";
const DETAIL_SHEET = "PHAN_TICH_AI";
const RESULT_TEMPLATE_FIRST_ROW = 11;
const DATE_FORMAT = "dd/mm/yyyy";
const DETAIL_TEMPLATE_FIRST_ROW = 2;
const STATUS_COLUMNS = [8, 9]; // Số ngày chậm, Trạng thái
// The template's own palette (pink/red for warnings, green for normal).
const STATUS_STYLE: Record<Status, { fill: string | null; font: string }> = {
  "Cảnh báo": { fill: "FFFEF2F2", font: "FFDC2626" },
  "Bình thường": { fill: "FFF0FDF4", font: "FF0B7A5E" },
  "Không xác định": { fill: null, font: "FF000000" },
};
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

type RowStyle = { height: number | undefined; cells: Partial<ExcelJS.Style>[] };

// Snapshot before writing: the template styles only its sample rows, and those carry per-row status colours.
function captureRowStyle(sheet: ExcelJS.Worksheet, rowNumber: number, columns: number): RowStyle {
  const row = sheet.getRow(rowNumber);
  return {
    height: row.height,
    cells: Array.from({ length: columns }, (_, i) => structuredClone(row.getCell(i + 1).style)),
  };
}

function applyRowStyle(sheet: ExcelJS.Worksheet, rowNumber: number, style: RowStyle) {
  const row = sheet.getRow(rowNumber);
  if (style.height) row.height = style.height;
  style.cells.forEach((cellStyle, i) => {
    row.getCell(i + 1).style = structuredClone(cellStyle);
  });
}

function applyStatusStyle(sheet: ExcelJS.Worksheet, rowNumber: number, status: Status) {
  const { fill, font } = STATUS_STYLE[status];
  for (const column of STATUS_COLUMNS) {
    const cell = sheet.getCell(rowNumber, column);
    cell.fill = fill
      ? { type: "pattern", pattern: "solid", fgColor: { argb: fill } }
      : { type: "pattern", pattern: "none" };
    cell.font = { ...cell.font, color: { argb: font } };
  }
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

  const resultStyle = result.isTemplate
    ? captureRowStyle(result.sheet, RESULT_TEMPLATE_FIRST_ROW, RESULT_HEADERS.length)
    : null;
  const detailStyle = detail.isTemplate
    ? captureRowStyle(detail.sheet, DETAIL_TEMPLATE_FIRST_ROW, DETAIL_HEADERS.length)
    : null;

  clearRows(result.sheet, firstResultRow, RESULT_HEADERS.length);
  clearRows(detail.sheet, DETAIL_TEMPLATE_FIRST_ROW, DETAIL_HEADERS.length);

  results.forEach((row, i) => {
    const detailRow = DETAIL_TEMPLATE_FIRST_ROW + i;
    if (detailStyle) applyRowStyle(detail.sheet, detailRow, detailStyle);
    setRow(detail.sheet, detailRow, [
      row.stt, row.info, row.checkout, row.method, row.confidence,
      row.checkout ? "Đã xác định" : "Không xác định", row.note,
    ]);
    const rowNumber = firstResultRow + i;
    if (resultStyle) applyRowStyle(result.sheet, rowNumber, resultStyle);
    setRow(result.sheet, rowNumber, [
      row.stt, row.invoiceNo, row.invoiceDate, row.taxCode, row.buyer, row.info, row.checkout, row.delay, row.status,
    ]);
    applyStatusStyle(result.sheet, rowNumber, row.status);
  });

  if (result.isTemplate) {
    result.sheet.getCell("F6").value = counts.total;
    result.sheet.getCell("G6").value = counts.ok;
    result.sheet.getCell("H6").value = counts.warn;
    result.sheet.getCell("I6").value = counts.unknown;
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
