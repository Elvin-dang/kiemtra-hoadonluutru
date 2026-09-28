import { Button } from "./components/ui/button";
import { usePlatform } from "./platform";

import type { BatchItem } from "./useInvoiceCheck";

type BatchResultsProps = { items: BatchItem[]; isRunning: boolean };

const STATUS_TEXT: Record<BatchItem["status"], string> = {
  waiting: "Đang chờ",
  working: "Đang xử lý…",
  done: "Đã lưu",
  error: "Lỗi",
};

export function BatchResults({ items, isRunning }: BatchResultsProps) {
  const platform = usePlatform();
  const doneCount = items.filter((item) => item.status === "done" || item.status === "error").length;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {isRunning ? `Đang xử lý ${doneCount + 1}/${items.length} file…` : `Đã xử lý ${items.length} file.`}
      </p>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {items.map((item, index) => (
          <li key={`${index}-${item.name}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <span className="min-w-0 flex-1 font-medium break-all">{item.name}</span>
            {item.counts && (
              <span className="text-sm text-muted-foreground">
                {item.counts.total} hóa đơn · <span className="text-green-700">{item.counts.ok} bình thường</span> ·{" "}
                <span className="text-red-600">{item.counts.warn} cảnh báo</span> ·{" "}
                <span className="text-amber-600">{item.counts.unknown} không xác định</span>
              </span>
            )}
            {item.status === "error" ? (
              <span className="text-sm text-destructive">{item.message}</span>
            ) : (
              <span className="text-sm text-muted-foreground">{STATUS_TEXT[item.status]}</span>
            )}
            {item.savedTo && (
              <span className="flex gap-2">
                {platform.openResult && (
                  <Button variant="outline" size="sm" onClick={() => void platform.openResult?.(item.savedTo ?? "")}>
                    Mở file
                  </Button>
                )}
                {platform.revealFile && (
                  <Button variant="outline" size="sm" onClick={() => void platform.revealFile?.(item.savedTo ?? "")}>
                    Mở thư mục
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
