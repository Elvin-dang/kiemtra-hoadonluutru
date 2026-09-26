import { describe, expect, it } from "vitest";

import { normalizeHeader, suggestMapping, validateMapping } from "./columns";

// Row 1 of the e-invoice "bán ra" export (sheet BR_ChiTiet), in file order.
const BR_HEADERS = [
  "Số hóa đơn", "Ngày hóa đơn", "Tên người bán", "MST người bán", "Địa chỉ người bán", "Tên người mua",
  "Họ tên người mua hàng", "MST người mua", "Địa chỉ người mua", "Hình thức thanh toán", "STT", "Tính chất",
  "Loại hàng hóa đặc trưng", "Tên hàng hóa, dịch vụ", "Đơn vị tính", "Số lượng", "Đơn giá", "Chiết khấu",
  "Thuế suất", "Thành tiền chưa có thuế GTGT", "Giờ xuất hóa đơn", "Trạng thái hóa đơn",
];

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
  it("recognises the BR_ChiTiet export: buyer's tax code and the goods/service text as stay info", () => {
    expect(suggestMapping(BR_HEADERS)).toEqual({
      mapping: { invoiceNo: 1, invoiceDate: 2, taxCode: 8, buyer: 6, info: 14, buyerAlt: 7 },
      isComplete: true,
    });
  });

  it("never takes the seller's tax code or name", () => {
    const { mapping } = suggestMapping(["Số hóa đơn", "Ngày hóa đơn", "MST người bán", "Tên người bán", "Tên hàng hóa, dịch vụ"]);
    expect(mapping.taxCode).toBeNull();
    expect(mapping.buyer).toBeNull();
  });

  it("still accepts the old template names and spellings like 'hoá'", () => {
    const headers = ["Số hoá đơn", "Ngày hoá đơn", "Mã số thuế", "Tên người mua", "Thông tin thời gian lưu trú"];
    expect(suggestMapping(headers)).toEqual({
      mapping: { invoiceNo: 1, invoiceDate: 2, taxCode: 3, buyer: 4, info: 5, buyerAlt: null },
      isComplete: true,
    });
  });

  it("is incomplete when a field is missing, so the user maps it", () => {
    expect(suggestMapping(["Mã HĐ", "Ngày", "Nội dung"])).toEqual({
      mapping: { invoiceNo: null, invoiceDate: null, taxCode: null, buyer: null, info: null, buyerAlt: null },
      isComplete: false,
    });
    expect(suggestMapping(BR_HEADERS.filter((h) => h !== "MST người mua")).isComplete).toBe(false);
  });
});

describe("validateMapping", () => {
  const base = { invoiceNo: 2, invoiceDate: 3, taxCode: null, buyer: null, info: 7, buyerAlt: null };

  it("accepts a mapping with optional fields left empty", () => {
    expect(validateMapping(base)).toBeNull();
  });

  it("names the missing required fields", () => {
    expect(validateMapping({ ...base, invoiceNo: null, info: null })).toBe(
      "Chọn cột cho: Số hóa đơn, Tên hàng hóa, dịch vụ (thông tin lưu trú).",
    );
  });

  it("rejects the same column chosen twice", () => {
    expect(validateMapping({ ...base, invoiceDate: 2 })).toBe("Mỗi cột chỉ được chọn một lần.");
  });

  it("does not count the hidden buyer fallback column as a duplicate", () => {
    expect(validateMapping({ ...base, buyer: 6, buyerAlt: 6 })).toBeNull();
  });
});
