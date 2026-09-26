import { fromIsoDate } from "./checkout";

import type { AiOutcome, AiResponseItem } from "../types/invoice";

const AI_ROUTE = "/api/ai";
const AI_BATCH_LIMIT = 50;
const AI_TEXT_LIMIT = 500;
const OVER_LIMIT: AiOutcome = { date: null, note: "Vượt giới hạn AI (50 dòng)" };
const DISABLED: AiOutcome = { date: null, note: "AI chưa được bật" };
const FAILED: AiOutcome = { date: null, note: "Không gọi được AI" };

function toOutcome(item: AiResponseItem | undefined): AiOutcome {
  if (!item) return FAILED;
  if (item.date === null) return { date: null, note: item.note };
  const date = fromIsoDate(item.date);
  return date ? { date } : FAILED;
}

async function askRoute(texts: string[], fetchFn: typeof fetch): Promise<AiOutcome[]> {
  try {
    const response = await fetchFn(AI_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    if (response.status === 503) return texts.map(() => DISABLED);
    if (!response.ok) return texts.map(() => FAILED);
    const { results } = (await response.json()) as { results?: AiResponseItem[] };
    if (!Array.isArray(results) || results.length !== texts.length) return texts.map(() => FAILED);
    return results.map(toOutcome);
  } catch {
    return texts.map(() => FAILED);
  }
}

export async function fetchAiOutcomes(texts: string[], fetchFn: typeof fetch = fetch): Promise<AiOutcome[]> {
  if (texts.length === 0) return [];
  const batch = texts.slice(0, AI_BATCH_LIMIT).map((text) => text.slice(0, AI_TEXT_LIMIT));
  const answered = await askRoute(batch, fetchFn);
  return [...answered, ...texts.slice(AI_BATCH_LIMIT).map(() => OVER_LIMIT)];
}
