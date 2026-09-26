import ExcelJS from "exceljs";

import { InputError } from "./inputError";

import type { CellValue, InputRow } from "../types/invoice";

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
    rows.push({
      invoiceNo,
      invoiceDate: cell(2),
      taxCode: cell(3),
      buyer: cell(4),
      info: String(cell(5) ?? ""),
    });
    if (rows.length > MAX_ROWS) throw new InputError("too_many_rows");
  }
  if (rows.length === 0) throw new InputError("no_rows");
  return { workbook, rows, threshold: readThreshold(workbook) };
}
