import type { CellValue } from "../types/invoice";

const TOKEN = /\d+|\D+/g;
const DIGITS = /^\d+$/;
const MONTH_WORD = /^th.ng$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEPARATORS = new Set(["/", "-", "."]);

function makeDate(dayText: string, monthText: string, yearText: string): Date | null {
  if (dayText.length > 2 || monthText.length > 2) return null;
  if (yearText.length !== 2 && yearText.length !== 4) return null;
  const year = Number(yearText) + (yearText.length === 2 ? 2000 : 0);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

// Latest valid date in the text: d/m/y, d-m-y, d.m.y (2- or 4-digit year) or "d tháng m y".
export function extractCheckout(text: string | null | undefined): Date | null {
  const tokens = (text ?? "").normalize("NFC").match(TOKEN) ?? [];
  let best: Date | null = null;
  for (let i = 0; i + 4 < tokens.length; i++) {
    if (!DIGITS.test(tokens[i]) || !DIGITS.test(tokens[i + 2]) || !DIGITS.test(tokens[i + 4])) continue;
    const separator = tokens[i + 1];
    const secondSeparator = tokens[i + 3];
    const isNumericDate = SEPARATORS.has(separator) && secondSeparator === separator;
    const isWordDate =
      MONTH_WORD.test(separator.trim().toLowerCase()) && secondSeparator.replace(/,/g, "").trim() === "";
    if (!isNumericDate && !isWordDate) continue;
    const date = makeDate(tokens[i], tokens[i + 2], tokens[i + 4]);
    if (date && (!best || date > best)) best = date;
  }
  return best;
}

export function toDate(value: CellValue): Date | null {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "string") return extractCheckout(value);
  return null;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromIsoDate(iso: string): Date | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  return makeDate(match[3], match[2], match[1]);
}
