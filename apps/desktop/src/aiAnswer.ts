import { extractCheckout, toIsoDate } from "@kiemtra/core";

import type { AiAnswer, AiResponseItem } from "@kiemtra/core";

// What the Rust `ask_ai` command returns: raw answer text per input, or a failure note.
export type RustItem = { answer: string } | { date: null; note: string };
export type RustAnswer = { status: "ok"; results: RustItem[] } | { status: "disabled" } | { status: "failed" };

export const NO_KEY_NOTE = "Chưa lưu khóa OpenAI (Cài đặt AI)";

// The shared rules read the date, so date logic lives only in @kiemtra/core.
export function toResponseItem(item: RustItem): AiResponseItem {
  if (!("answer" in item)) return item;
  const date = extractCheckout(item.answer);
  return date ? { date: toIsoDate(date) } : { date: null, note: "AI không xác định được" };
}

export function toAiAnswer(answer: RustAnswer): AiAnswer {
  if (answer.status === "ok") return { status: "ok", results: answer.results.map(toResponseItem) };
  if (answer.status === "disabled") return { status: "disabled", note: NO_KEY_NOTE };
  return answer;
}
