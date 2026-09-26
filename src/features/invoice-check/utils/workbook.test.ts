import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { analyze } from "./analyze";
import { InputError } from "./inputError";
import { MAX_ROWS, inspectInput, readRows, writeResult } from "./workbook";

import type { ColumnMapping } from "../types/invoice";

function fixture(name: string): ArrayBuffer {
  const buffer = readFileSync(`fixtures/${name}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

const TEMPLATE_HEADERS = ["Số hóa đơn", "Ngày hóa đơn", "Mã số thuế", "Tên người mua", "Thông tin thời gian lưu trú"];

async function buildWorkbook(
  rows: ExcelJS.CellValue[][],
  setup?: (workbook: ExcelJS.Workbook) => void,
  headers: string[] = TEMPLATE_HEADERS,
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("DU_LIEU_GOC");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  setup?.(workbook);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

// Inspect, then read with the suggested mapping — what the page does for an exact layout.
async function readAll(data: ArrayBuffer) {
  const inspected = await inspectInput(data);
  return { workbook: inspected.workbook, ...readRows(inspected.workbook, inspected.mapping) };
}

async function expectInputError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(InputError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("inspectInput + readRows", () => {
  it("reads the 9 sample rows and the threshold", async () => {
    const { rows, threshold } = await readAll(fixture("sample.xlsx"));
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
    const xlsm = await readAll(fixture("sample-vba.xlsm"));
    const xlsx = await readAll(fixture("sample.xlsx"));
    expect(xlsm.rows).toEqual(xlsx.rows);
  });

  it("keeps reading past a blank row", async () => {
    const data = await buildWorkbook([
      [1, "03/05/2025", "-", "A", "(30/04/2025-02/05/2025)"],
      [],
      [2, "05/05/2025", "-", "B", "(30/04/2025-01/05/2025)"],
    ]);
    const { rows } = await readAll(data);
    expect(rows.map((row) => row.invoiceNo)).toEqual([1, 2]);
  });

  it("keeps a real Excel date cell as a Date", async () => {
    const data = await buildWorkbook([[1, new Date(Date.UTC(2025, 4, 3)), "-", "A", "(30/04/2025-02/05/2025)"]]);
    const { rows } = await readAll(data);
    expect(rows[0].invoiceDate).toEqual(new Date(Date.UTC(2025, 4, 3)));
  });

  it("reads a real date cell in the stay column as dd/mm/yyyy, independent of time zone", async () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const data = await buildWorkbook([[1, "04/07/2026", "-", "A", new Date(Date.UTC(2026, 6, 3))]]);
      const { rows } = await readAll(data);
      expect(rows[0].info).toBe("03/07/2026");
    } finally {
      process.env.TZ = previous;
    }
  });

  it("defaults the threshold to 1 without CAU_HINH and reads B4 when present", async () => {
    const row = [1, "03/05/2025", "-", "A", "(30/04/2025-02/05/2025)"];
    expect((await readAll(await buildWorkbook([row]))).threshold).toBe(1);
    const withConfig = await buildWorkbook([row], (workbook) => {
      workbook.addWorksheet("CAU_HINH").getCell("B4").value = 3;
    });
    expect((await readAll(withConfig)).threshold).toBe(3);
  });

  it("rejects a file that is not Excel", async () => {
    await expectInputError(readAll(new TextEncoder().encode("hello").buffer as ArrayBuffer), "unreadable");
  });

  it("rejects a workbook without DU_LIEU_GOC", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1").getCell("A1").value = "x";
    await expectInputError(readAll((await workbook.xlsx.writeBuffer()) as ArrayBuffer), "no_sheet");
  });

  it("rejects a sheet with only the header", async () => {
    await expectInputError(readAll(await buildWorkbook([])), "no_rows");
  });

  it("rejects more than MAX_ROWS rows", async () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => [i + 1, "03/05/2025", "-", "A", "x"]);
    await expectInputError(readAll(await buildWorkbook(rows)), "too_many_rows");
  });
});

async function reload(data: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

describe("column mapping", () => {
  const reorderedHeaders = ["STT", "Tên người mua", "Số hoá đơn", "Thông tin thời gian lưu trú", "Ngày hoá đơn"];
  const reorderedRow = [1, "Nguyễn Văn A", 7, "(30/04/2025-02/05/2025)", "03/05/2025"];

  it("lists the sheet columns and marks the template as an exact layout", async () => {
    const { columns, isExactLayout } = await inspectInput(fixture("sample.xlsx"));
    expect(isExactLayout).toBe(true);
    expect(columns[4]).toEqual({ index: 5, letter: "E", header: "Thông tin thời gian lưu trú" });
  });

  it("suggests a mapping for reordered columns without treating them as exact", async () => {
    const inspected = await inspectInput(await buildWorkbook([reorderedRow], undefined, reorderedHeaders));
    expect(inspected.isExactLayout).toBe(false);
    expect(inspected.mapping).toEqual({ invoiceNo: 3, invoiceDate: 5, taxCode: null, buyer: 2, info: 4 });
    expect(inspected.columns.map((column) => column.letter)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("reads rows through a chosen mapping, leaving unmapped optional fields empty", async () => {
    const { workbook } = await inspectInput(await buildWorkbook([reorderedRow], undefined, reorderedHeaders));
    const mapping: ColumnMapping = { invoiceNo: 3, invoiceDate: 5, taxCode: null, buyer: 2, info: 4 };
    expect(readRows(workbook, mapping).rows).toEqual([
      { invoiceNo: 7, invoiceDate: "03/05/2025", taxCode: null, buyer: "Nguyễn Văn A", info: "(30/04/2025-02/05/2025)" },
    ]);
  });
});

describe("writeResult", () => {
  it("fills the template sheets of the sample", async () => {
    const input = await readAll(fixture("sample.xlsx"));
    const output = await reload(await writeResult(input.workbook, analyze(input.rows, input.threshold)));
    const result = output.getWorksheet("KET_QUA_AI")!;
    const detail = output.getWorksheet("PHAN_TICH_AI")!;

    expect(result.getCell("G11").value).toEqual(new Date(Date.UTC(2025, 4, 2)));
    expect(result.getCell("G11").numFmt).toBe("dd/mm/yyyy");
    expect(result.getCell("C11").value).toEqual(new Date(Date.UTC(2025, 4, 3)));
    expect(result.getCell("H11").value).toBe(1);
    expect(result.getCell("I11").value).toBe("Cảnh báo");
    expect(result.getCell("I11").font.color?.argb).toBe("FFFF0000");
    expect(result.getCell("I16").value).toBe("Bình thường");
    expect(result.getCell("I16").font.color?.argb).toBe("FF000000");
    expect(["F6", "G6", "H6", "I6"].map((a) => result.getCell(a).value)).toEqual([9, 1, 8, 0]);

    expect(detail.getCell("C2").value).toEqual(new Date(Date.UTC(2025, 4, 2)));
    expect(["D2", "E2", "F2"].map((a) => detail.getCell(a).value)).toEqual(["Quy tắc", 1, "Đã xác định"]);
  });

  it("clears stale rows from the template", async () => {
    const input = await readAll(fixture("sample.xlsx"));
    const output = await reload(await writeResult(input.workbook, analyze(input.rows.slice(0, 3), input.threshold)));
    expect(output.getWorksheet("KET_QUA_AI")!.getCell("A14").value).toBeNull();
    expect(output.getWorksheet("PHAN_TICH_AI")!.getCell("A5").value).toBeNull();
    expect(output.getWorksheet("KET_QUA_AI")!.getCell("F6").value).toBe(3);
  });

  it("creates both sheets when the upload has only DU_LIEU_GOC", async () => {
    const input = await readAll(await buildWorkbook([[1, "03/05/2025", "-", "A", "(30/04/2025-02/05/2025)"]]));
    const output = await reload(await writeResult(input.workbook, analyze(input.rows, input.threshold)));
    const result = output.getWorksheet("KET_QUA_AI")!;
    const detail = output.getWorksheet("PHAN_TICH_AI")!;
    expect(result.getCell("A1").value).toBe("STT");
    expect(result.getCell("I2").value).toBe("Cảnh báo");
    expect(detail.getCell("A1").value).toBe("STT");
    expect(detail.getCell("D2").value).toBe("Quy tắc");
  });
});
