import { describe, expect, it } from "vitest";

import { normalizeHeader, suggestMapping, validateMapping } from "./columns";

const TEMPLATE_HEADERS = ["Số hóa đơn", "Ngày hóa đơn", "Mã số thuế", "Tên người mua", "Thông tin thời gian lưu trú"];

describe("normalizeHeader", () => {
  it("ignores case, extra spaces and Vietnamese tone-mark placement", () => {
    expect(normalizeHeader("  Số   HOÁ đơn ")).toBe(normalizeHeader("Số hóa đơn"));
    expect(normalizeHeader("Số hoá đơn")).toBe("so hoa don");
  });

  it("treats decomposed (NFD) text and punctuation the same as plain text", () => {
    expect(normalizeHeader("Ngày hóa đơn:".normalize("NFD"))).toBe("ngay hoa don");
  });
});

describe("suggestMapping", () => {
  it("recognises the template layout as exact", () => {
    expect(suggestMapping(TEMPLATE_HEADERS)).toEqual({
      mapping: { invoiceNo: 1, invoiceDate: 2, taxCode: 3, buyer: 4, info: 5 },
      isExactLayout: true,
    });
  });

  it("accepts the user's spelling 'hoá' and extra columns after E", () => {
    const headers = ["Số hoá đơn", "Ngày hoá đơn", "Mã số thuế", "Tên người mua", "Thông tin thời gian lưu trú", "Doanh thu"];
    expect(suggestMapping(headers).isExactLayout).toBe(true);
  });

  it("finds reordered columns but does not treat them as exact", () => {
    const headers = ["STT", "Tên người mua", "Số hoá đơn", "Doanh thu", "Thông tin thời gian lưu trú", "Ngày hoá đơn", "Mã số thuế"];
    expect(suggestMapping(headers)).toEqual({
      mapping: { invoiceNo: 3, invoiceDate: 6, taxCode: 7, buyer: 2, info: 5 },
      isExactLayout: false,
    });
  });

  it("leaves unmatched fields empty", () => {
    expect(suggestMapping(["Mã HĐ", "Ngày", "Nội dung"])).toEqual({
      mapping: { invoiceNo: null, invoiceDate: null, taxCode: null, buyer: null, info: null },
      isExactLayout: false,
    });
  });
});

describe("validateMapping", () => {
  it("accepts a mapping with optional fields left empty", () => {
    expect(validateMapping({ invoiceNo: 2, invoiceDate: 3, taxCode: null, buyer: null, info: 7 })).toBeNull();
  });

  it("names the missing required fields", () => {
    expect(validateMapping({ invoiceNo: null, invoiceDate: 3, taxCode: 1, buyer: null, info: null })).toBe(
      "Chọn cột cho: Số hóa đơn, Thông tin thời gian lưu trú.",
    );
  });

  it("rejects the same column chosen twice", () => {
    expect(validateMapping({ invoiceNo: 2, invoiceDate: 2, taxCode: null, buyer: null, info: 7 })).toBe(
      "Mỗi cột chỉ được chọn một lần.",
    );
  });
});
