"use client";

import { useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

import type { AiSettings } from "../types/invoice";

type AiSettingsPanelProps = {
  settings: AiSettings;
  limits: AiSettings;
  onChange: (settings: AiSettings) => void;
  onReset: () => void;
};

type Field = keyof AiSettings;
type Drafts = Record<Field, string>;

const FIELDS: { field: Field; label: string; hint: string }[] = [
  { field: "maxTexts", label: "Số dòng tối đa gửi AI", hint: "Các dòng vượt quá cần kiểm tra thủ công." },
  { field: "maxTextLength", label: "Độ dài tối đa mỗi dòng (ký tự)", hint: "Phần dài hơn bị cắt trước khi gửi." },
  { field: "concurrency", label: "Số yêu cầu song song", hint: "Giảm xuống 1–2 nếu gặp lỗi AI HTTP 429." },
];

function toDrafts(settings: AiSettings): Drafts {
  return {
    maxTexts: String(settings.maxTexts),
    maxTextLength: String(settings.maxTextLength),
    concurrency: String(settings.concurrency),
  };
}

export function AiSettingsPanel({ settings, limits, onChange, onReset }: AiSettingsPanelProps) {
  // Drafts let a field be empty while typing; only whole numbers ≥ 1 are committed.
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(settings));
  const [syncedSettings, setSyncedSettings] = useState(settings);
  if (syncedSettings !== settings) {
    setSyncedSettings(settings);
    setDrafts(toDrafts(settings));
  }

  const handleChange = (field: Field, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    const number = Number(value);
    if (value.trim() !== "" && Number.isInteger(number) && number >= 1) onChange({ ...settings, [field]: number });
  };

  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">Cài đặt AI</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {FIELDS.map(({ field, label, hint }) => (
          <label key={field} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{label}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={limits[field]}
              step={1}
              value={drafts[field]}
              onChange={(event) => handleChange(field, event.target.value)}
              onBlur={() => setDrafts(toDrafts(settings))}
            />
            <span className="text-muted-foreground">
              Từ 1 đến {limits[field]}. {hint}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={onReset}>
          Khôi phục mặc định
        </Button>
        <p className="text-sm text-muted-foreground">
          Lưu trên trình duyệt này và gửi kèm dữ liệu tới máy chủ. Máy chủ không cho vượt giới hạn trên.
        </p>
      </div>
    </details>
  );
}
