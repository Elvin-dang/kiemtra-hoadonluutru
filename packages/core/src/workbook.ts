import ExcelJS from "exceljs";

import { formatDate } from "./formatDate";

import { suggestMapping } from "./columns";
import { InputError } from "./inputError";

import type { AnalysisResult, CellValue, ColumnMapping, InputRow, SheetColumn, Status } from "./types";

export const MAX_ROWS = 5000;
// The e-invoice "bán ra" export; any first sheet with the same headers also works.
const SOURCE_SHEET = "BR_ChiTiet";
// The KET_QUA_AI template states "Ngưỡng cảnh báo mặc định: ≥ 1 ngày".
const THRESHOLD_DAYS = 1;

export type InspectedInput = {
  workbook: ExcelJS.Workbook;
  columns: SheetColumn[];
  mapping: ColumnMapping;
  isComplete: boolean;
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

function sourceSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(SOURCE_SHEET) ?? workbook.worksheets[0];
  if (!sheet) throw new InputError("no_sheet");
  return sheet;
}

function isEmpty(value: CellValue): boolean {
  return value === null || (typeof value === "string" && value.trim() === "");
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
  const { mapping, isComplete } = suggestMapping(columns.map((column) => column.header));
  return { workbook, columns, mapping, isComplete };
}

export function readRows(workbook: ExcelJS.Workbook, mapping: ColumnMapping): ParsedRows {
  const sheet = sourceSheet(workbook);
  const rows: InputRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = (column: number | null) => (column === null ? null : normalizeCell(sheet.getCell(r, column).value));
    const invoiceNo = cell(mapping.invoiceNo);
    if (isEmpty(invoiceNo)) continue;
    const info = cell(mapping.info);
    const buyer = cell(mapping.buyer);
    rows.push({
      invoiceNo,
      invoiceDate: cell(mapping.invoiceDate),
      taxCode: cell(mapping.taxCode),
      buyer: isEmpty(buyer) ? cell(mapping.buyerAlt) : buyer,
      info: info instanceof Date ? formatDate(info) : String(info ?? ""),
    });
    if (rows.length > MAX_ROWS) throw new InputError("too_many_rows");
  }
  if (rows.length === 0) throw new InputError("no_rows");
  return { rows, threshold: THRESHOLD_DAYS };
}

const RESULT_SHEET = "KET_QUA_AI";
const HEADER_ROW = 10;
const FIRST_DATA_ROW = 11;
const COLUMN_COUNT = 9;
const DATE_FORMAT = "dd/mm/yyyy";
const STATUS_COLUMNS = [8, 9]; // Số ngày chậm, Trạng thái
// The template's own palette (pink/red for warnings, green for normal).
const STATUS_STYLE: Record<Status, { fill: string | null; font: string }> = {
  "Cảnh báo": { fill: "FFFEF2F2", font: "FFDC2626" },
  "Bình thường": { fill: "FFF0FDF4", font: "FF0B7A5E" },
  "Không xác định": { fill: null, font: "FF000000" },
};

type RowStyle = { height: number | undefined; cells: Partial<ExcelJS.Style>[] };

// The template styles only its sample rows (with per-row status colours), so snapshot the first one.
function captureRowStyle(sheet: ExcelJS.Worksheet, rowNumber: number): RowStyle {
  const row = sheet.getRow(rowNumber);
  return {
    height: row.height,
    cells: Array.from({ length: COLUMN_COUNT }, (_, i) => structuredClone(row.getCell(i + 1).style)),
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

function setRow(sheet: ExcelJS.Worksheet, rowNumber: number, values: CellValue[]) {
  values.forEach((value, i) => {
    const cell = sheet.getCell(rowNumber, i + 1);
    cell.value = value;
    if (value instanceof Date) cell.numFmt = DATE_FORMAT;
  });
}

// Fills the one-sheet KET_QUA_AI template (public/templates/ket-qua-ai.xlsx) and returns the new file.
export async function writeResult(
  template: ArrayBuffer,
  { results, counts }: AnalysisResult,
  sourceName: string,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.getWorksheet(RESULT_SHEET);
  if (!sheet) throw new Error(`Template has no ${RESULT_SHEET} sheet`);

  const rowStyle = captureRowStyle(sheet, FIRST_DATA_ROW);
  const templateLastRow = sheet.rowCount;

  results.forEach((row, i) => {
    const rowNumber = FIRST_DATA_ROW + i;
    applyRowStyle(sheet, rowNumber, rowStyle);
    setRow(sheet, rowNumber, [
      row.stt, row.invoiceNo, row.invoiceDate, row.taxCode, row.buyer, row.info, row.checkout, row.delay, row.status,
    ]);
    applyStatusStyle(sheet, rowNumber, row.status);
  });

  // Template sample rows past the last result: clear value and style (ExcelJS spliceRows keeps styles).
  for (let r = FIRST_DATA_ROW + results.length; r <= templateLastRow; r++) {
    const row = sheet.getRow(r);
    row.height = sheet.properties.defaultRowHeight;
    for (let c = 1; c <= COLUMN_COUNT; c++) {
      row.getCell(c).value = null;
      row.getCell(c).style = {};
    }
  }

  sheet.getCell("A5").value = `📂 NẠP DỮ LIỆU\n\nNguồn: ${sourceName}\n${results.length} dòng dữ liệu`;
  sheet.getCell("F6").value = counts.total;
  sheet.getCell("G6").value = counts.ok;
  sheet.getCell("H6").value = counts.warn;
  sheet.getCell("I6").value = counts.unknown;
  sheet.autoFilter = `A${HEADER_ROW}:I${Math.max(HEADER_ROW, FIRST_DATA_ROW + results.length - 1)}`;

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
