import { extractCheckout, toIsoDate } from "@kiemtra/core";

import type { AiResponseItem, AiLimits } from "@kiemtra/core";

export const runtime = "nodejs";
export const maxDuration = 300;

const OPENAI_URL = "https://api.openai.com/v1/responses";
const PROMPT =
  "Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH.";
// Server ceilings (override with AI_MAX_TEXTS / AI_MAX_TEXT_LENGTH / AI_MAX_CONCURRENCY).
// Clients may ask for less, never more: this route is public.
const DEFAULT_LIMITS: AiLimits = { maxTexts: 1000, maxTextLength: 500, concurrency: 10 };
const TIMEOUT_MS = 15_000;
// Caps cost per call on this public route; includes reasoning tokens on reasoning models, so not too small.
const MAX_OUTPUT_TOKENS = 1000;

type ResponsesPayload = { output?: { content?: { type?: string; text?: string }[] }[] };
type OpenAiErrorPayload = { error?: { message?: string; type?: string; code?: string | null } };

function positiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1 ? value : fallback;
}

function readLimits(): AiLimits {
  return {
    maxTexts: positiveIntEnv("AI_MAX_TEXTS", DEFAULT_LIMITS.maxTexts),
    maxTextLength: positiveIntEnv("AI_MAX_TEXT_LENGTH", DEFAULT_LIMITS.maxTextLength),
    concurrency: positiveIntEnv("AI_MAX_CONCURRENCY", DEFAULT_LIMITS.concurrency),
  };
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

// Effective limits = min(client setting, server ceiling). No settings → the ceilings.
function effectiveLimits(settings: unknown, limits: AiLimits): AiLimits | null {
  if (settings === undefined) return limits;
  if (typeof settings !== "object" || settings === null) return null;
  const requested = settings as Record<string, unknown>;
  const result = { ...limits };
  for (const field of ["maxTexts", "maxTextLength", "concurrency"] as const) {
    const value = requested[field];
    if (!isPositiveInt(value)) return null;
    result[field] = Math.min(value, limits[field]);
  }
  return result;
}

function parseRequest(body: unknown, limits: AiLimits): { texts: string[]; concurrency: number } | null {
  if (typeof body !== "object" || body === null || !("texts" in body)) return null;
  const { texts } = body;
  const effective = effectiveLimits("settings" in body ? body.settings : undefined, limits);
  if (!effective || !Array.isArray(texts) || texts.length < 1 || texts.length > effective.maxTexts) return null;
  const isValid = texts.every((t) => typeof t === "string" && t.length >= 1 && t.length <= effective.maxTextLength);
  return isValid ? { texts: texts as string[], concurrency: effective.concurrency } : null;
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
  const parsed = parseRequest(body, readLimits());
  if (!parsed) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { texts, concurrency } = parsed;

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return Response.json({ error: "ai_disabled" }, { status: 503 });

  const results = await mapWithConcurrency(texts, concurrency, (text) => askOne(text, apiKey, model));
  return Response.json({ results });
}

export async function GET(): Promise<Response> {
  return Response.json({ limits: readLimits() });
}
