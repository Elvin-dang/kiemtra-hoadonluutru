import { Button } from "./components/ui/button";

import type { AiProgress } from "@kiemtra/core";

type AiProgressBarProps = { progress: AiProgress; onStop: () => void };

export function AiProgressBar({ progress, onStop }: AiProgressBarProps) {
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
      <span className="font-medium">
        Đang hỏi AI: {progress.done.toLocaleString("vi-VN")} / {progress.total.toLocaleString("vi-VN")} dòng
      </span>
      <progress
        className="h-2 min-w-40 flex-1 appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-all"
        max={100}
        value={percent}
        aria-label="Tiến độ AI"
      />
      <span className="tabular-nums text-muted-foreground">{percent}%</span>
      <Button variant="outline" size="sm" onClick={onStop}>
        Dừng
      </Button>
      <span className="basis-full text-muted-foreground">
        Dừng: các dòng chưa gửi được đánh dấu để kiểm tra thủ công; bạn có thể nhập ngày ngay trong bảng.
      </span>
    </div>
  );
}
