"use client";

import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button, buttonVariants } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

import { useInvoiceCheck } from "../hooks/useInvoiceCheck";
import { ResultTable } from "./ResultTable";
import { SummaryTiles } from "./SummaryTiles";

import type { ChangeEvent } from "react";

export function InvoiceCheck() {
  const { state, handleFile, handleDownload } = useInvoiceCheck();
  const isProcessing = state.phase === "processing";

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = "";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Kiểm tra thời điểm lập hóa đơn lưu trú</h1>
        <p className="text-muted-foreground">
          Tải lên file Excel có sheet DU_LIEU_GOC. Hệ thống tìm ngày check-out và cảnh báo hóa đơn lập trễ.
        </p>
        <p className="text-sm text-muted-foreground">
          Dữ liệu được xử lý ngay trên máy của bạn. Chỉ nội dung lưu trú không đọc được mới được gửi tới AI.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="file"
          accept=".xlsx,.xlsm"
          aria-label="Chọn file Excel"
          className="max-w-sm"
          disabled={isProcessing}
          onChange={handleChange}
        />
        <a href="/mau_du_lieu.xlsx" download className={buttonVariants({ variant: "outline" })}>
          Tải file mẫu
        </a>
        {state.phase === "done" && <Button onClick={handleDownload}>Tải kết quả</Button>}
      </div>

      {isProcessing && <p className="text-muted-foreground">Đang xử lý…</p>}

      {state.phase === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.phase === "done" && (
        <>
          <SummaryTiles counts={state.analysis.counts} />
          <ResultTable results={state.analysis.results} />
        </>
      )}
    </main>
  );
}
