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

describe("extractCheckout — day/month without a year (year taken from the invoice date)", () => {
  it.each([
    ["Thuê phòng nghỉ (từ ngày 10/09 đến ngày 12/9)", d(2025, 9, 13), d(2025, 9, 12)],
    ["Thuê phòng nghỉ (9/9)", d(2025, 9, 10), d(2025, 9, 9)],
    ["Thuê phòng nghỉ (từ ngày 16/10 đến 17/10)", d(2025, 10, 17), d(2025, 10, 17)],
    // a full date and a partial one: the latest still wins
    ["Thuê phòng nghỉ (từ ngày 16/10 đến ngày 20/10/2025)", d(2025, 10, 20), d(2025, 10, 20)],
    // 5-digit year typo: the day/month is rescued with the invoice's year
    ["Thuê phòng nghỉ (từ ngày 18/09/2025 đến ngày 23/09/22025", d(2025, 9, 23), d(2025, 9, 23)],
    // over New Year: 30/12 is closest to a 02/01/2026 invoice in 2025, 01/01 in 2026
    ["Thuê phòng nghỉ (từ 30/12 đến 01/01)", d(2026, 1, 2), d(2026, 1, 1)],
    // invoice issued the day before check-out: 13/09 stays in the invoice's year (real row from the export)
    ["Thuê phòng nghỉ (từ ngày 12/09 đến ngày 13/09)", d(2025, 9, 12), d(2025, 9, 13)],
    // invoice early January for a stay in late December
    ["Thuê phòng nghỉ (28/12)", d(2026, 1, 3), d(2025, 12, 28)],
  ])("%s (invoice %s)", (text, invoiceDate, want) => {
    expect(extractCheckout(text, invoiceDate)).toEqual(want);
  });

  it("ignores day/month text without an invoice date to anchor it", () => {
    expect(extractCheckout("Thuê phòng nghỉ (9/9)")).toBeNull();
    expect(extractCheckout("Thuê phòng nghỉ (9/9)", null)).toBeNull();
  });

  it("only treats '/' as a day/month separator and never reads room numbers or times", () => {
    const invoice = d(2025, 7, 14);
    expect(extractCheckout("Phòng 2-3", invoice)).toBeNull();
    expect(extractCheckout("Thuê phòng nghỉ (102)", invoice)).toBeNull();
    expect(extractCheckout("14:00 - 12:00", invoice)).toBeNull();
    expect(extractCheckout("Phòng 1604,1605", invoice)).toBeNull();
  });

  it("does not split a valid full date into a day/month", () => {
    expect(extractCheckout("30/04/2025-02/05/2025", d(2025, 12, 31))).toEqual(d(2025, 5, 2));
    expect(extractCheckout("01/07/26 – 03/07/26.", d(2026, 12, 31))).toEqual(d(2026, 7, 3));
  });

  it("rejects impossible day/month values", () => {
    expect(extractCheckout("(31/02)", d(2025, 3, 1))).toBeNull();
    expect(extractCheckout("(12/13)", d(2025, 3, 1))).toBeNull();
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
