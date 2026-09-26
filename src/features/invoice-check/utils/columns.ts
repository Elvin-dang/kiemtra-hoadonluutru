import type { ColumnMapping, MappingField } from "../types/invoice";

export const MAPPING_FIELDS: { field: MappingField; label: string; isRequired: boolean; aliases: string[] }[] = [
  { field: "invoiceNo", label: "Số hóa đơn", isRequired: true, aliases: ["Số hóa đơn"] },
  { field: "invoiceDate", label: "Ngày hóa đơn", isRequired: true, aliases: ["Ngày hóa đơn"] },
  { field: "taxCode", label: "MST người mua", isRequired: false, aliases: ["MST người mua", "Mã số thuế"] },
  { field: "buyer", label: "Tên người mua", isRequired: false, aliases: ["Tên người mua"] },
  {
    field: "info",
    label: "Tên hàng hóa, dịch vụ (thông tin lưu trú)",
    isRequired: true,
    aliases: ["Tên hàng hóa, dịch vụ", "Thông tin thời gian lưu trú"],
  },
];

const BUYER_ALT_ALIASES = ["Họ tên người mua hàng"];

// Case-, spacing-, punctuation- and diacritic-insensitive, so "Số hoá đơn" matches "Số hóa đơn".
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findColumn(normalized: string[], aliases: string[], used: Set<number>): number | null {
  const wanted = aliases.map(normalizeHeader);
  const index = normalized.findIndex((header, i) => wanted.includes(header) && !used.has(i));
  if (index === -1) return null;
  used.add(index);
  return index + 1;
}

// Matches headers by name (any position). Complete = every field found, so the page can skip the mapping step.
export function suggestMapping(headers: string[]): { mapping: ColumnMapping; isComplete: boolean } {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping = { buyerAlt: null } as ColumnMapping;
  for (const { field, aliases } of MAPPING_FIELDS) mapping[field] = findColumn(normalized, aliases, used);
  mapping.buyerAlt = findColumn(normalized, BUYER_ALT_ALIASES, used);
  const isComplete = MAPPING_FIELDS.every(({ field }) => mapping[field] !== null);
  return { mapping, isComplete };
}

export function validateMapping(mapping: ColumnMapping): string | null {
  const missing = MAPPING_FIELDS.filter(({ field, isRequired }) => isRequired && mapping[field] === null);
  if (missing.length > 0) return `Chọn cột cho: ${missing.map(({ label }) => label).join(", ")}.`;
  const chosen = MAPPING_FIELDS.map(({ field }) => mapping[field]).filter((column) => column !== null);
  if (new Set(chosen).size !== chosen.length) return "Mỗi cột chỉ được chọn một lần.";
  return null;
}
