import { DEFAULT_AI_SETTINGS } from "./aiSettings";
import { fromIsoDate } from "./checkout";

import type { AiLimits, AiOutcome, AiResponseItem, AiSettings } from "../types/invoice";

const AI_ROUTE = "/api/ai";
const DISABLED: AiOutcome = { date: null, note: "AI chưa được bật" };
const FAILED: AiOutcome = { date: null, note: "Không gọi được AI" };
const TURNED_OFF: AiOutcome = { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" };
// Keeps each request well inside the server function time limit, whatever the user's total.
const BATCH_SIZE = 50;

function toOutcome(item: AiResponseItem | undefined): AiOutcome {
  if (!item) return FAILED;
  if (item.date === null) return { date: null, note: item.note };
  const date = fromIsoDate(item.date);
  return date ? { date } : FAILED;
}

async function askRoute(texts: string[], settings: AiLimits, fetchFn: typeof fetch): Promise<AiOutcome[]> {
  try {
    const response = await fetchFn(AI_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, settings }),
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

export async function fetchAiOutcomes(
  texts: string[],
  settings: AiSettings = DEFAULT_AI_SETTINGS,
  fetchFn: typeof fetch = fetch,
): Promise<AiOutcome[]> {
  if (texts.length === 0) return [];
  if (!settings.isEnabled) return texts.map(() => TURNED_OFF);

  const { maxTexts, maxTextLength, concurrency } = settings;
  const limits: AiLimits = { maxTexts, maxTextLength, concurrency };
  const toSend = texts.slice(0, maxTexts).map((text) => text.slice(0, maxTextLength));
  const answered: AiOutcome[] = [];
  for (let start = 0; start < toSend.length; start += BATCH_SIZE) {
    answered.push(...(await askRoute(toSend.slice(start, start + BATCH_SIZE), limits, fetchFn)));
  }
  const overLimit: AiOutcome = { date: null, note: `Vượt giới hạn AI (${maxTexts} dòng)` };
  return [...answered, ...texts.slice(maxTexts).map(() => overLimit)];
}
