import { useMemo } from "react";

import { summarizeByCustomer } from "@kiemtra/core";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

import type { RowResult } from "@kiemtra/core";

type CustomerSummaryProps = { results: RowResult[] };

// Late invoices per buyer, most first, for follow-up.
export function CustomerSummary({ results }: CustomerSummaryProps) {
  const customers = useMemo(() => summarizeByCustomer(results), [results]);
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên người mua</TableHead>
            <TableHead>Mã số thuế</TableHead>
            <TableHead className="text-right">Số hóa đơn</TableHead>
            <TableHead className="text-right">Cảnh báo</TableHead>
            <TableHead className="text-right">Không xác định</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={`${customer.taxCode}|${customer.buyer}`} className={customer.warn > 0 ? "bg-red-50 dark:bg-red-950/30" : undefined}>
              <TableCell className="min-w-40 whitespace-normal">{customer.buyer || "—"}</TableCell>
              <TableCell>{customer.taxCode}</TableCell>
              <TableCell className="text-right tabular-nums">{customer.total}</TableCell>
              <TableCell className="text-right font-semibold text-red-600 tabular-nums">{customer.warn || ""}</TableCell>
              <TableCell className="text-right text-amber-600 tabular-nums">{customer.unknown || ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
