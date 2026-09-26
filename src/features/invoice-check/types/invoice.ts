export type CellValue = string | number | Date | null;

export type InputRow = {
  invoiceNo: CellValue;
  invoiceDate: CellValue;
  taxCode: CellValue;
  buyer: CellValue;
  info: string;
};

export type Status = "Cảnh báo" | "Bình thường" | "Không xác định";

export type Method = "Quy tắc" | "AI";

export type AiOutcome = { date: Date | null; note?: string };

export type AiResponseItem = { date: string } | { date: null; note: string };

export type RowResult = {
  stt: number;
  invoiceNo: CellValue;
  invoiceDate: Date | null;
  taxCode: CellValue;
  buyer: CellValue;
  info: string;
  checkout: Date | null;
  method: Method;
  confidence: 1 | null;
  delay: number | null;
  status: Status;
  note: string;
};

export type Counts = { total: number; ok: number; warn: number; unknown: number };

export type AnalysisResult = { results: RowResult[]; counts: Counts };
