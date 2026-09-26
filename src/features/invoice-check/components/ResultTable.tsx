import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { formatDate } from "@/shared/utils/formatDate";

import type { CellValue, RowResult, Status } from "../types/invoice";

type ResultTableProps = { results: RowResult[] };

const STATUS_TONE: Record<Status, string> = {
  "Cảnh báo": "text-red-600 font-semibold",
  "Bình thường": "text-green-700",
  "Không xác định": "text-amber-600",
};

function formatCell(value: CellValue): string {
  if (value instanceof Date) return formatDate(value);
  return value === null ? "" : String(value);
}

export function ResultTable({ results }: ResultTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>STT</TableHead>
            <TableHead>Số HĐ</TableHead>
            <TableHead>Ngày HĐ</TableHead>
            <TableHead>Ngày phải lập HĐ</TableHead>
            <TableHead className="text-right">Số ngày chậm</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ghi chú</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((row) => (
            <TableRow key={row.stt}>
              <TableCell>{row.stt}</TableCell>
              <TableCell>{formatCell(row.invoiceNo)}</TableCell>
              <TableCell>{formatDate(row.invoiceDate)}</TableCell>
              <TableCell>{formatDate(row.checkout)}</TableCell>
              <TableCell className="text-right">{row.delay ?? ""}</TableCell>
              <TableCell className={STATUS_TONE[row.status]}>{row.status}</TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{row.note}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
