import { describe, expect, it } from "vitest";

import { extractCheckout, fromIsoDate, toDate, toIsoDate } from "./checkout";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

describe("extractCheckout", () => {
  it.each([
    ["Dịch vụ đặt phòng #10258710 - phòng 806 (30/04/2025-02/05/2025)", d(2025, 5, 2)],
    ["Phòng 601 (30/04/2025-01/05/2025)", d(2025, 5, 1)],
    ["Phòng khách sạn từ ngày 13 Tháng 5 2025 đến ngày 15 Tháng 5 2025 VNTRIP2025D7UKI (Phòng 2001)", d(2025, 5, 15)],
    ["9 phòng 2 khách x 2 đêm (27/10/2025-29/10/2025) Phòng 1604,1605,1704", d(2025, 10, 29)],
    ["02/07/2026 14:00 - 03/07/2026 12:00.", d(2026, 7, 3)],
    ["01/07/26 – 03/07/26.", d(2026, 7, 3)],
    ["Check in: 01/07/2026; Check out: 03/07/2026.", d(2026, 7, 3)],
    ["Check out: 03/07/2026; Check in: 01/07/2026.", d(2026, 7, 3)],
    ["01-07-2026 đến 03-07-2026", d(2026, 7, 3)],
    ["01.07.2026 - 03.07.2026", d(2026, 7, 3)],
    ["từ ngày 13 tháng 5, 2025", d(2025, 5, 13)],
  ])("%s", (text, want) => {
    expect(extractCheckout(text)).toEqual(want);
  });

  it.each([
    "Phòng 1604,1605 không có ngày",
    "31/02/2025",
    "KHONG_XAC_DINH",
    "01/07-2026",
    "01/07/1999",
    "01/13/2026",
    "",
  ])("returns null for %j", (text) => {
    expect(extractCheckout(text)).toBeNull();
  });

  it("returns null for null and undefined", () => {
    expect(extractCheckout(null)).toBeNull();
    expect(extractCheckout(undefined)).toBeNull();
  });

  it("matches the month word in decomposed (NFD) Vietnamese", () => {
    const text = "Phòng khách sạn từ ngày 13 Tháng 5 2025 đến ngày 15 Tháng 5 2025".normalize("NFD");
    expect(extractCheckout(text)).toEqual(d(2025, 5, 15));
  });
});

describe("toDate", () => {
  it("keeps the UTC calendar day of a Date and drops the time", () => {
    expect(toDate(new Date(Date.UTC(2025, 4, 3, 17, 30)))).toEqual(d(2025, 5, 3));
  });

  it("parses day-first text", () => {
    expect(toDate("03/05/2025")).toEqual(d(2025, 5, 3));
  });

  it("returns null for numbers and null", () => {
    expect(toDate(45780)).toBeNull();
    expect(toDate(null)).toBeNull();
  });
});

describe("ISO helpers", () => {
  it("round-trips YYYY-MM-DD", () => {
    expect(toIsoDate(d(2026, 7, 3))).toBe("2026-07-03");
    expect(fromIsoDate("2026-07-03")).toEqual(d(2026, 7, 3));
  });

  it("rejects malformed ISO strings", () => {
    expect(fromIsoDate("03/07/2026")).toBeNull();
    expect(fromIsoDate("2026-02-31")).toBeNull();
  });
});
