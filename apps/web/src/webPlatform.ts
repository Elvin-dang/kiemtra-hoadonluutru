import { saveFile } from "@/shared/utils/saveFile";

import type { AiAnswer, AiLimits, AiResponseItem } from "@kiemtra/core";
import type { Platform } from "@kiemtra/ui";

const AI_ROUTE = "/api/ai";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function askAiRoute(texts: string[], limits: AiLimits, fetchFn: typeof fetch = fetch): Promise<AiAnswer> {
  const response = await fetchFn(AI_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, settings: limits }),
  });
  if (response.status === 503) return { status: "disabled" };
  if (!response.ok) return { status: "failed" };
  const { results } = (await response.json()) as { results?: AiResponseItem[] };
  return Array.isArray(results) ? { status: "ok", results } : { status: "failed" };
}

export async function fetchAiLimits(fetchFn: typeof fetch = fetch): Promise<AiLimits> {
  const response = await fetchFn(AI_ROUTE);
  if (!response.ok) throw new Error(`GET ${AI_ROUTE}: HTTP ${response.status}`);
  const { limits } = (await response.json()) as { limits: AiLimits };
  return limits;
}

export const webPlatform: Platform = {
  kind: "web",
  privacyNotice: "Dữ liệu được xử lý ngay trên máy của bạn. Chỉ nội dung lưu trú không đọc được mới được gửi tới AI.",
  askAi: (texts, limits) => askAiRoute(texts, limits),
  getAiLimits: () => fetchAiLimits(),
  saveResult: async (data, fileName) => {
    saveFile(data, fileName, XLSX_MIME);
    return { savedTo: null };
  },
};
