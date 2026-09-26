import { extractCheckout, toIsoDate } from "@/features/invoice-check/utils/checkout";

import type { AiResponseItem } from "@/features/invoice-check/types/invoice";

export const runtime = "nodejs";
export const maxDuration = 300;

const OPENAI_URL = "https://api.openai.com/v1/responses";
const PROMPT =
  "Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH.";
const MAX_TEXTS = 50;
const MAX_TEXT_LENGTH = 500;
const CONCURRENCY = 5;
const TIMEOUT_MS = 15_000;
// Caps cost per call on this public route; includes reasoning tokens on reasoning models, so not too small.
const MAX_OUTPUT_TOKENS = 1000;

type ResponsesPayload = { output?: { content?: { type?: string; text?: string }[] }[] };
type OpenAiErrorPayload = { error?: { message?: string; type?: string; code?: string | null } };

function parseTexts(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null || !("texts" in body)) return null;
  const { texts } = body;
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > MAX_TEXTS) return null;
  const isValid = texts.every((t) => typeof t === "string" && t.length >= 1 && t.length <= MAX_TEXT_LENGTH);
  return isValid ? (texts as string[]) : null;
}

function outputText(payload: unknown): string {
  const output = (payload as ResponsesPayload).output ?? [];
  return output
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
}

async function askOne(text: string, apiKey: string, model: string): Promise<AiResponseItem> {
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, instructions: PROMPT, input: text, max_output_tokens: MAX_OUTPUT_TOKENS, store: false }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      await logOpenAiError(response);
      return { date: null, note: `AI HTTP ${response.status}` };
    }
    const date = extractCheckout(outputText(await response.json()));
    return date ? { date: toIsoDate(date) } : { date: null, note: "AI không xác định được" };
  } catch (error) {
    const { name, message } = error instanceof Error ? error : { name: "Unknown", message: String(error) };
    console.error("[api/ai] OpenAI request failed", { name, message });
    return { date: null, note: "Không gọi được AI" };
  }
}

// Logged to the server (Vercel function logs). Never logs the stay text or the key.
async function logOpenAiError(response: Response): Promise<void> {
  const body = await response.text().catch(() => "");
  let details: OpenAiErrorPayload["error"];
  try {
    details = (JSON.parse(body) as OpenAiErrorPayload).error;
  } catch {
    details = { message: body.slice(0, 200) };
  }
  console.error("[api/ai] OpenAI error", {
    status: response.status,
    type: details?.type,
    code: details?.code,
    message: details?.message,
  });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const texts = parseTexts(body);
  if (!texts) return Response.json({ error: "invalid_request" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return Response.json({ error: "ai_disabled" }, { status: 503 });

  const results = await mapWithConcurrency(texts, CONCURRENCY, (text) => askOne(text, apiKey, model));
  return Response.json({ results });
}
