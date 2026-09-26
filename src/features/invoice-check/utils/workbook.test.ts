import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { InputError } from "./inputError";
import { MAX_ROWS, readInput } from "./workbook";

function fixture(name: string): ArrayBuffer {
  const buffer = readFileSync(`fixtures/${name}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function buildWorkbook(rows: ExcelJS.CellValue[][], setup?: (workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("DU_LIEU_GOC");
  sheet.addRow(["Số hóa đơn", "Ngày hóa đơn", "Mã số thuế", "Tên người mua", "Thông tin thời gian lưu trú"]);
  rows.forEach((row) => sheet.addRow(row));
  setup?.(workbook);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

async function expectInputError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(InputError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("readInput", () => {
  it("reads the 9 sample rows and the threshold", async () => {
    const { rows, threshold } = await readInput(fixture("sample.xlsx"));
    expect(threshold).toBe(1);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual({
      invoiceNo: 1,
      invoiceDate: "03/05/2025",
      taxCode: "-",
      buyer: "Nguyễn Văn A",
      info: "Dịch vụ đặt phòng #10258710 - phòng 806 (30/04/2025-02/05/2025)",
    });
    expect(rows.map((row) => row.invoiceNo)).toEqual([1, 2, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("reads the macro-enabled .xlsm exactly like the .xlsx", async () => {
    const xlsm = await readInput(fixture("sample-vba.xlsm"));
    const xlsx = await readInput(fixture("sample.xlsx"));
    expect(xlsm.rows).toEqual(xlsx.rows);
  });

  it("keeps reading past a blank row", async () => {
    const data = await buildWorkbook([
      [1, "03/05/2025", "-", "A", "(30/04/2025-02/05/2025)"],
      [],
      [2, "05/05/2025", "-", "B", "(30/04/2025-01/05/2025)"],
    ]);
    const { rows } = await readInput(data);
    expect(rows.map((row) => row.invoiceNo)).toEqual([1, 2]);
  });

  it("keeps a real Excel date cell as a Date", async () => {
    const data = await buildWorkbook([[1, new Date(Date.UTC(2025, 4, 3)), "-", "A", "(30/04/2025-02/05/2025)"]]);
    const { rows } = await readInput(data);
    expect(rows[0].invoiceDate).toEqual(new Date(Date.UTC(2025, 4, 3)));
  });

  it("defaults the threshold to 1 without CAU_HINH and reads B4 when present", async () => {
    const row = [1, "03/05/2025", "-", "A", "(30/04/2025-02/05/2025)"];
    expect((await readInput(await buildWorkbook([row]))).threshold).toBe(1);
    const withConfig = await buildWorkbook([row], (workbook) => {
      workbook.addWorksheet("CAU_HINH").getCell("B4").value = 3;
    });
    expect((await readInput(withConfig)).threshold).toBe(3);
  });

  it("rejects a file that is not Excel", async () => {
    await expectInputError(readInput(new TextEncoder().encode("hello").buffer as ArrayBuffer), "unreadable");
  });

  it("rejects a workbook without DU_LIEU_GOC", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1").getCell("A1").value = "x";
    await expectInputError(readInput((await workbook.xlsx.writeBuffer()) as ArrayBuffer), "no_sheet");
  });

  it("rejects a sheet with only the header", async () => {
    await expectInputError(readInput(await buildWorkbook([])), "no_rows");
  });

  it("rejects more than MAX_ROWS rows", async () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => [i + 1, "03/05/2025", "-", "A", "x"]);
    await expectInputError(readInput(await buildWorkbook(rows)), "too_many_rows");
  });
});
