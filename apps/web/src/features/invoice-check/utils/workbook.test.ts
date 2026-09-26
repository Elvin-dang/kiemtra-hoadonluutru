import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { analyze } from "./analyze";
import { InputError } from "./inputError";
import { MAX_ROWS, inspectInput, readRows, writeResult } from "./workbook";

import type { ColumnMapping } from "../types/invoice";

function bytes(path: string): ArrayBuffer {
  const buffer = readFileSync(path);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

const fixture = () => bytes("fixtures/br-chitiet.xlsx"); // anonymised copy of a real "XUAT HDDT BAN RA" export
const template = () => bytes("public/templates/ket-qua-ai.xlsx");

const BR_HEADERS = ["Số hóa đơn", "Ngày hóa đơn", "Tên người mua", "Họ tên người mua hàng", "MST người mua", "Tên hàng hóa, dịch vụ"];

async function buildWorkbook(rows: ExcelJS.CellValue[][], { sheetName = "BR_ChiTiet", headers = BR_HEADERS } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

async function readAll(data: ArrayBuffer) {
  const inspected = await inspectInput(data);
  return { ...inspected, ...readRows(inspected.workbook, inspected.mapping) };
}

async function expectInputError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(InputError);
  await expect(promise).rejects.toMatchObject({ code });
}

async function reload(data: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

describe("inspectInput + readRows", () => {
  it("reads the BR_ChiTiet export directly: all 76 lines, buyer's tax code, goods/service text", async () => {
    const { rows, threshold, isComplete } = await readAll(fixture());
    expect(isComplete).toBe(true);
    expect(threshold).toBe(1);
    expect(rows).toHaveLength(76);
    expect(rows[0]).toEqual({
      invoiceNo: 1,
      invoiceDate: "04/02/2025",
      taxCode: "0300000001",
      buyer: "CÔNG TY KHÁCH HÀNG 01",
      info: "Thuê phòng  nghỉ ngày 01/02/2025;02/02/2025;03/02/2025",
    });
  });

  it("uses the first sheet when it is not named BR_ChiTiet", async () => {
    const { rows } = await readAll(await buildWorkbook([[1, "03/05/2025", "A", null, "0101", "x"]], { sheetName: "Sheet1" }));
    expect(rows.map((row) => row.invoiceNo)).toEqual([1]);
  });

  it("falls back to 'Họ tên người mua hàng' when Tên người mua is empty", async () => {
    const { rows } = await readAll(
      await buildWorkbook([
        [1, "03/05/2025", "CÔNG TY A", "Nguyễn Văn B", "0101", "x"],
        [2, "03/05/2025", null, "Nguyễn Văn C", null, "x"],
      ]),
    );
    expect(rows.map((row) => row.buyer)).toEqual(["CÔNG TY A", "Nguyễn Văn C"]);
  });

  it("keeps reading past a blank row", async () => {
    const { rows } = await readAll(await buildWorkbook([[1, "03/05/2025", "A", null, "", "x"], [], [2, "05/05/2025", "B", null, "", "y"]]));
    expect(rows.map((row) => row.invoiceNo)).toEqual([1, 2]);
  });

  it("keeps a real Excel date cell as a Date", async () => {
    const { rows } = await readAll(await buildWorkbook([[1, new Date(Date.UTC(2025, 4, 3)), "A", null, "", "x"]]));
    expect(rows[0].invoiceDate).toEqual(new Date(Date.UTC(2025, 4, 3)));
  });

  it("reads a real date cell in the stay column as dd/mm/yyyy, independent of time zone", async () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const { rows } = await readAll(await buildWorkbook([[1, "04/07/2026", "A", null, "", new Date(Date.UTC(2026, 6, 3))]]));
      expect(rows[0].info).toBe("03/07/2026");
    } finally {
      process.env.TZ = previous;
    }
  });

  it("lists the columns and asks for a mapping when a header is missing", async () => {
    const headers = ["STT", "Tên người mua", "Số hoá đơn", "Nội dung", "Ngày hoá đơn"];
    const inspected = await inspectInput(await buildWorkbook([[1, "Công ty A", 7, "(30/04/2025-02/05/2025)", "03/05/2025"]], { headers }));
    expect(inspected.isComplete).toBe(false);
    expect(inspected.columns.map((column) => `${column.letter}:${column.header}`)).toEqual([
      "A:STT", "B:Tên người mua", "C:Số hoá đơn", "D:Nội dung", "E:Ngày hoá đơn",
    ]);
    const mapping: ColumnMapping = { ...inspected.mapping, info: 4 };
    expect(readRows(inspected.workbook, mapping).rows).toEqual([
      { invoiceNo: 7, invoiceDate: "03/05/2025", taxCode: null, buyer: "Công ty A", info: "(30/04/2025-02/05/2025)" },
    ]);
  });

  it("rejects a file that is not Excel", async () => {
    await expectInputError(inspectInput(new TextEncoder().encode("hello").buffer as ArrayBuffer), "unreadable");
  });

  it("rejects a sheet with only the header", async () => {
    await expectInputError(readAll(await buildWorkbook([])), "no_rows");
  });

  it("rejects more than MAX_ROWS rows", async () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => [i + 1, "03/05/2025", "A", null, "", "x"]);
    await expectInputError(readAll(await buildWorkbook(rows)), "too_many_rows");
  });
});

describe("writeResult", () => {
  it("returns a workbook with only KET_QUA_AI, laid out like the template", async () => {
    const input = await readAll(fixture());
    const output = await reload(await writeResult(template(), analyze(input.rows, input.threshold), "XUAT HDDT BAN RA.xlsx"));
    expect(output.worksheets.map((sheet) => sheet.name)).toEqual(["KET_QUA_AI"]);
    const sheet = output.getWorksheet("KET_QUA_AI")!;

    expect(sheet.getCell("A1").value).toBe("CÔNG CỤ PHÂN TÍCH DỮ LIỆU LƯU TRÚ – KIỂM TRA THỜI ĐIỂM LẬP HÓA ĐƠN");
    expect(sheet.getCell("B10").value).toBe("Số hóa đơn");
    expect(sheet.getCell("A5").value).toBe("📂 NẠP DỮ LIỆU\n\nNguồn: XUAT HDDT BAN RA.xlsx\n76 dòng dữ liệu");
    expect(sheet.getCell("F6").value).toBe(76);
    expect(sheet.autoFilter).toBe("A10:I86");

    expect(sheet.getCell("A11").value).toBe(1);
    expect(sheet.getCell("C11").value).toEqual(new Date(Date.UTC(2025, 1, 4)));
    expect(sheet.getCell("C11").numFmt).toBe("dd/mm/yyyy");
    expect(sheet.getCell("D11").value).toBe("0300000001");
    expect(sheet.getCell("E11").value).toBe("CÔNG TY KHÁCH HÀNG 01");
    expect(sheet.getCell("F11").value).toBe("Thuê phòng  nghỉ ngày 01/02/2025;02/02/2025;03/02/2025");
    expect(sheet.getCell("G11").value).toEqual(new Date(Date.UTC(2025, 1, 3)));
    expect([sheet.getCell("H11").value, sheet.getCell("I11").value]).toEqual([1, "Cảnh báo"]);
    expect(sheet.getCell("A86").value).toBe(76);
  });

  it("styles every row like the template's first data row and nothing after the last one", async () => {
    const input = await readAll(fixture());
    const sheet = (await reload(await writeResult(template(), analyze(input.rows, input.threshold), "f.xlsx"))).getWorksheet("KET_QUA_AI")!;
    for (let c = 1; c <= 9; c++) expect(sheet.getCell(86, c).border).toEqual(sheet.getCell(11, c).border);
    expect(sheet.getRow(86).height).toBe(sheet.getRow(11).height);
    expect(sheet.getCell("A87").value).toBeNull();
    expect(sheet.getCell("A87").border?.top).toBeUndefined();
  });

  it("removes the template's unused styled rows when there are fewer results", async () => {
    const input = await readAll(fixture());
    const sheet = (await reload(await writeResult(template(), analyze(input.rows.slice(0, 3), 1), "f.xlsx"))).getWorksheet("KET_QUA_AI")!;
    expect(sheet.getCell("A13").value).toBe(3);
    expect(sheet.getCell("A14").border?.top).toBeUndefined();
    expect(sheet.getCell("A19").border?.top).toBeUndefined();
    expect(sheet.autoFilter).toBe("A10:I13");
  });

  it("colours the status cells by each row's own status", async () => {
    const input = await readAll(fixture());
    const sheet = (await reload(await writeResult(template(), analyze(input.rows, input.threshold), "f.xlsx"))).getWorksheet("KET_QUA_AI")!;
    const style = (row: number) => {
      const fill = sheet.getCell(row, 9).fill;
      return [sheet.getCell(row, 9).value, fill?.type === "pattern" ? (fill.fgColor?.argb ?? fill.pattern) : null, sheet.getCell(row, 9).font.color?.argb];
    };
    const statuses = Array.from({ length: 76 }, (_, i) => sheet.getCell(11 + i, 9).value);
    const rowOf = (status: string) => 11 + statuses.indexOf(status);
    expect(style(rowOf("Cảnh báo"))).toEqual(["Cảnh báo", "FFFEF2F2", "FFDC2626"]);
    expect(style(rowOf("Bình thường"))).toEqual(["Bình thường", "FFF0FDF4", "FF0B7A5E"]);
    expect(style(rowOf("Không xác định"))).toEqual(["Không xác định", "none", "FF000000"]);
  });
});
