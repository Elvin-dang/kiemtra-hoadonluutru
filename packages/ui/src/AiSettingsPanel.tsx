"use client";

import { useState } from "react";

import { aiCacheSize, clearAiCache } from "@kiemtra/core";

import { AiKeyFields } from "./AiKeyFields";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { usePlatform } from "./platform";

import type { AiLimits, AiSettings } from "@kiemtra/core";

type AiSettingsPanelProps = {
  settings: AiSettings;
  limits: AiLimits;
  onChange: (settings: AiSettings) => void;
  onReset: () => void;
};

type Field = keyof AiLimits;
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
  const { kind } = usePlatform();
  // Drafts let a field be empty while typing; only whole numbers ≥ 1 are committed.
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(settings));
  const [syncedSettings, setSyncedSettings] = useState(settings);
  const [cacheSize, setCacheSize] = useState(0);
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
    <details className="rounded-lg border p-4" onToggle={() => setCacheSize(aiCacheSize())}>
      <summary className="cursor-pointer font-medium">
        Cài đặt AI{" "}
        <span className={settings.isEnabled ? "text-green-700" : "text-muted-foreground"}>
          — {settings.isEnabled ? "Đang bật" : "Đang tắt"}
        </span>
      </summary>

      <label className="mt-4 flex items-center gap-3 text-sm">
        <Switch checked={settings.isEnabled} onCheckedChange={(isEnabled) => onChange({ ...settings, isEnabled })} />
        <span>
          <span className="font-medium">Dùng AI cho dòng không đọc được</span>
          <span className="block text-muted-foreground">
            Khi tắt, các dòng này được đánh dấu để kiểm tra thủ công và không có dữ liệu nào được gửi tới AI.
          </span>
        </span>
      </label>

      <AiKeyFields />

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
              disabled={!settings.isEnabled}
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
        <Button variant="outline" disabled={!settings.isEnabled} onClick={onReset}>
          Khôi phục mặc định
        </Button>
        <Button
          variant="outline"
          disabled={cacheSize === 0}
          onClick={() => {
            clearAiCache();
            setCacheSize(0);
          }}
        >
          Xóa bộ nhớ AI ({cacheSize.toLocaleString("vi-VN")})
        </Button>
        <p className="text-sm text-muted-foreground">
          {kind === "desktop"
            ? "Lưu trên máy này. Ngày AI đã tìm được được nhớ lại, nên nội dung đã gặp không phải hỏi AI lần nữa."
            : "Lưu trên trình duyệt này và gửi kèm dữ liệu tới máy chủ. Máy chủ không cho vượt giới hạn trên."}
        </p>
      </div>
    </details>
  );
}
