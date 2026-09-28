import { fromIsoDate } from "./checkout";

import type { AiLimits, AiOutcome, AiResponseItem, AiSettings, AskAi } from "./types";

const DISABLED_NOTE = "AI chưa được bật";
const FAILED: AiOutcome = { date: null, note: "Không gọi được AI" };
const TURNED_OFF: AiOutcome = { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" };
const STOPPED: AiOutcome = { date: null, note: "Cần kiểm tra thủ công (đã dừng AI)" };

export type AiProgress = { done: number; total: number };
export type AiRunOptions = { onProgress?: (progress: AiProgress) => void; signal?: AbortSignal };
// Keeps each request well inside a server function's time limit, whatever the user's total.
const BATCH_SIZE = 50;

function toOutcome(item: AiResponseItem | undefined): AiOutcome {
  if (!item) return FAILED;
  if (item.date === null) return { date: null, note: item.note };
  const date = fromIsoDate(item.date);
  return date ? { date } : FAILED;
}

async function askBatch(texts: string[], limits: AiLimits, askAi: AskAi): Promise<AiOutcome[]> {
  const failAll = () => texts.map(() => FAILED);
  try {
    const answer = await askAi(texts, limits);
    if (answer.status === "disabled") {
      const outcome: AiOutcome = { date: null, note: answer.note ?? DISABLED_NOTE };
      return texts.map(() => outcome);
    }
    if (answer.status === "failed" || answer.results.length !== texts.length) return failAll();
    return answer.results.map(toOutcome);
  } catch {
    return failAll();
  }
}

// Batches go out one after another, so progress moves per batch; a stop ends the run at once
// and every row without an answer yet is marked for a manual check.
export async function fetchAiOutcomes(
  texts: string[],
  settings: AiSettings,
  askAi: AskAi,
  { onProgress, signal }: AiRunOptions = {},
): Promise<AiOutcome[]> {
  if (texts.length === 0) return [];
  if (!settings.isEnabled) return texts.map(() => TURNED_OFF);

  const { maxTexts, maxTextLength, concurrency } = settings;
  const limits: AiLimits = { maxTexts, maxTextLength, concurrency };
  const toSend = texts.slice(0, maxTexts).map((text) => text.slice(0, maxTextLength));
  // A batch never holds fewer texts than may run at once, so "100 song song" really means 100.
  const batchSize = Math.max(BATCH_SIZE, concurrency);
  const answered: AiOutcome[] = [];
  const stopped = new Promise<null>((resolve) => signal?.addEventListener("abort", () => resolve(null), { once: true }));
  onProgress?.({ done: 0, total: toSend.length });
  for (let start = 0; start < toSend.length; start += batchSize) {
    const batch = toSend.slice(start, start + batchSize);
    if (signal?.aborted) {
      answered.push(...batch.map(() => STOPPED));
      continue;
    }
    // Stop at once: a batch already sent may still finish in the background, but its rows are not awaited.
    const outcomes = await Promise.race([askBatch(batch, limits, askAi), stopped]);
    answered.push(...(outcomes ?? batch.map(() => STOPPED)));
    onProgress?.({ done: answered.length, total: toSend.length });
  }
  const overLimit: AiOutcome = { date: null, note: `Vượt giới hạn AI (${maxTexts} dòng)` };
  return [...answered, ...texts.slice(maxTexts).map(() => overLimit)];
}
