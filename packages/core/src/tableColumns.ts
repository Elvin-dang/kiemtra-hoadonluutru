import { formatDate } from "./formatDate";

import type { CellValue, RowResult, Status } from "./types";

export type ColumnId =
  | "stt"
  | "invoiceNo"
  | "status"
  | "delay"
  | "invoiceDate"
  | "checkout"
  | "buyer"
  | "info"
  | "taxCode"
  | "method"
  | "note";

export type SortValue = number | string | null;

export type TableColumn = {
  id: ColumnId;
  label: string;
  isDefaultVisible: boolean;
  isNumeric?: boolean;
  isLongText?: boolean;
  sortValue: (row: RowResult) => SortValue;
};

// Warnings first when sorting by status.
const STATUS_RANK: Record<Status, number> = { "Cảnh báo": 0, "Không xác định": 1, "Bình thường": 2 };

export function cellText(value: CellValue): string {
  if (value instanceof Date) return formatDate(value);
  return value === null ? "" : String(value);
}

const textOrNull = (value: CellValue) => cellText(value) || null;

// Order = display order: the result sits right after the invoice number so it is visible on phones.
export const TABLE_COLUMNS: TableColumn[] = [
  { id: "stt", label: "STT", isDefaultVisible: true, isNumeric: true, sortValue: (r) => r.stt },
  {
    id: "invoiceNo",
    label: "Số HĐ",
    isDefaultVisible: true,
    sortValue: (r) => (typeof r.invoiceNo === "number" ? r.invoiceNo : textOrNull(r.invoiceNo)),
  },
  { id: "status", label: "Trạng thái", isDefaultVisible: true, sortValue: (r) => STATUS_RANK[r.status] },
  { id: "delay", label: "Số ngày chậm", isDefaultVisible: true, isNumeric: true, sortValue: (r) => r.delay },
  { id: "invoiceDate", label: "Ngày HĐ", isDefaultVisible: true, sortValue: (r) => r.invoiceDate?.getTime() ?? null },
  { id: "checkout", label: "Ngày phải lập HĐ", isDefaultVisible: true, sortValue: (r) => r.checkout?.getTime() ?? null },
  { id: "buyer", label: "Tên người mua", isDefaultVisible: true, isLongText: true, sortValue: (r) => textOrNull(r.buyer) },
  { id: "info", label: "Thông tin lưu trú", isDefaultVisible: true, isLongText: true, sortValue: (r) => r.info || null },
  { id: "taxCode", label: "Mã số thuế", isDefaultVisible: false, sortValue: (r) => textOrNull(r.taxCode) },
  { id: "method", label: "Phương pháp", isDefaultVisible: false, sortValue: (r) => r.method },
  // Hidden by default: the table shows the note under "Không xác định" and as the status tooltip.
  { id: "note", label: "Ghi chú", isDefaultVisible: false, isLongText: true, sortValue: (r) => r.note || null },
];

export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = TABLE_COLUMNS.filter((c) => c.isDefaultVisible).map((c) => c.id);
