import type { ColumnMapping, MappingField } from "../types/invoice";

export const MAPPING_FIELDS: { field: MappingField; label: string; isRequired: boolean }[] = [
  { field: "invoiceNo", label: "Số hóa đơn", isRequired: true },
  { field: "invoiceDate", label: "Ngày hóa đơn", isRequired: true },
  { field: "taxCode", label: "Mã số thuế", isRequired: false },
  { field: "buyer", label: "Tên người mua", isRequired: false },
  { field: "info", label: "Thông tin thời gian lưu trú", isRequired: true },
];

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

export function suggestMapping(headers: string[]): { mapping: ColumnMapping; isExactLayout: boolean } {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping = {} as ColumnMapping;
  for (const { field, label } of MAPPING_FIELDS) {
    const index = normalized.findIndex((header, i) => header === normalizeHeader(label) && !used.has(i));
    used.add(index);
    mapping[field] = index === -1 ? null : index + 1;
  }
  const isExactLayout = MAPPING_FIELDS.every(({ field }, i) => mapping[field] === i + 1);
  return { mapping, isExactLayout };
}

export function validateMapping(mapping: ColumnMapping): string | null {
  const missing = MAPPING_FIELDS.filter(({ field, isRequired }) => isRequired && mapping[field] === null);
  if (missing.length > 0) return `Chọn cột cho: ${missing.map(({ label }) => label).join(", ")}.`;
  const chosen = Object.values(mapping).filter((column) => column !== null);
  if (new Set(chosen).size !== chosen.length) return "Mỗi cột chỉ được chọn một lần.";
  return null;
}
