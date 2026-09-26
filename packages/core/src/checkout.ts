import type { CellValue } from "./types";

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

// Day/month with no year ("12/9", "(9/9)") takes the year that puts it closest to the invoice date:
// 13/09 on a 12/09/2025 invoice → 2025; 30/12 on a 02/01/2026 invoice → 2025.
// Only "/" counts, so "Phòng 2-3" is ignored.
function partialDate(dayText: string, monthText: string, reference: Date): Date | null {
  const year = reference.getUTCFullYear();
  let closest: Date | null = null;
  for (const candidate of [year - 1, year, year + 1]) {
    const date = makeDate(dayText, monthText, String(candidate));
    const distance = (value: Date) => Math.abs(value.getTime() - reference.getTime());
    if (date && (!closest || distance(date) < distance(closest))) closest = date;
  }
  return closest;
}

// Latest valid date in the text: d/m/y, d-m-y, d.m.y (2- or 4-digit year), "d tháng m y",
// and — when an invoice date is given — d/m without a year.
export function extractCheckout(text: string | null | undefined, reference: Date | null = null): Date | null {
  const tokens = (text ?? "").normalize("NFC").match(TOKEN) ?? [];
  let best: Date | null = null;
  const consider = (date: Date | null) => {
    if (date && (!best || date > best)) best = date;
  };
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (!DIGITS.test(tokens[i]) || !DIGITS.test(tokens[i + 2])) continue;
    const separator = tokens[i + 1];
    const secondSeparator = tokens[i + 3];
    const year = tokens[i + 4];
    const hasYearToken = year !== undefined && DIGITS.test(year);
    const isNumericDate = hasYearToken && SEPARATORS.has(separator) && secondSeparator === separator;
    const isWordDate =
      hasYearToken &&
      MONTH_WORD.test(separator.trim().toLowerCase()) &&
      (secondSeparator ?? "").replace(/,/g, "").trim() === "";
    const fullDate = isNumericDate || isWordDate ? makeDate(tokens[i], tokens[i + 2], year) : null;
    if (fullDate) {
      consider(fullDate);
      continue;
    }
    // A d/m that starts a valid full date was handled above; a d/m inside one ("07/2025") fails makeDate.
    const precededBySlash = i > 0 && tokens[i - 1] === "/" && DIGITS.test(tokens[i - 2] ?? "");
    if (reference && separator === "/" && !precededBySlash) consider(partialDate(tokens[i], tokens[i + 2], reference));
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
