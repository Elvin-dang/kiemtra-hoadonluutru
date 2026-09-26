import { fromIsoDate } from "./checkout";

import type { AiLimits, AiOutcome, AiResponseItem, AiSettings, AskAi } from "./types";

const DISABLED_NOTE = "AI chưa được bật";
const FAILED: AiOutcome = { date: null, note: "Không gọi được AI" };
const TURNED_OFF: AiOutcome = { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" };
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

export async function fetchAiOutcomes(texts: string[], settings: AiSettings, askAi: AskAi): Promise<AiOutcome[]> {
  if (texts.length === 0) return [];
  if (!settings.isEnabled) return texts.map(() => TURNED_OFF);

  const { maxTexts, maxTextLength, concurrency } = settings;
  const limits: AiLimits = { maxTexts, maxTextLength, concurrency };
  const toSend = texts.slice(0, maxTexts).map((text) => text.slice(0, maxTextLength));
  const answered: AiOutcome[] = [];
  for (let start = 0; start < toSend.length; start += BATCH_SIZE) {
    answered.push(...(await askBatch(toSend.slice(start, start + BATCH_SIZE), limits, askAi)));
  }
  const overLimit: AiOutcome = { date: null, note: `Vượt giới hạn AI (${maxTexts} dòng)` };
  return [...answered, ...texts.slice(maxTexts).map(() => overLimit)];
}
