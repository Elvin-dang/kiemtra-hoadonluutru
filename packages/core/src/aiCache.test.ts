import { describe, expect, it, vi } from "vitest";

import { AI_CACHE_LIMIT, aiCacheSize, clearAiCache, withAiCache } from "./aiCache";

import type { AiAnswer, AskAi } from "./types";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const LIMITS = { maxTexts: 100, maxTextLength: 500, concurrency: 5 };
const dated = (texts: string[]): AiAnswer => ({ status: "ok", results: texts.map(() => ({ date: "2025-05-02" })) });

describe("withAiCache", () => {
  it("asks only for texts it has not seen, once each, and answers the rest from memory", async () => {
    const storage = memoryStorage();
    const askAi = vi.fn<AskAi>(async (texts) => dated(texts));
    const cached = withAiCache(askAi, storage);

    await cached(["a", "b"], LIMITS);
    const second = await cached(["b", "c", "c"], LIMITS);

    expect(askAi.mock.calls.map(([texts]) => texts)).toEqual([["a", "b"], ["c"]]);
    expect(second).toEqual({ status: "ok", results: [{ date: "2025-05-02" }, { date: "2025-05-02" }, { date: "2025-05-02" }] });
    expect(aiCacheSize(storage)).toBe(3);
  });

  it("does not remember failures or 'no date' answers", async () => {
    const storage = memoryStorage();
    const cached = withAiCache(
      async () => ({ status: "ok", results: [{ date: null, note: "AI HTTP 429" }] }),
      storage,
    );
    await cached(["a"], LIMITS);
    expect(aiCacheSize(storage)).toBe(0);
  });

  it("keeps remembered answers when the rest of the batch cannot be sent", async () => {
    const storage = memoryStorage();
    await withAiCache(async (texts) => dated(texts), storage)(["a"], LIMITS);
    const answer = await withAiCache(async () => ({ status: "disabled" }), storage)(["a", "b"], LIMITS);
    expect(answer).toEqual({ status: "ok", results: [{ date: "2025-05-02" }, { date: null, note: "AI chưa được bật" }] });
  });

  it("passes a failure through untouched when nothing was remembered", async () => {
    const answer = await withAiCache(async () => ({ status: "failed" }), memoryStorage())(["a"], LIMITS);
    expect(answer).toEqual({ status: "failed" });
  });

  it("keeps at most the newest AI_CACHE_LIMIT answers, and can be cleared", async () => {
    const storage = memoryStorage();
    const cached = withAiCache(async (texts) => dated(texts), storage);
    await cached(Array.from({ length: AI_CACHE_LIMIT + 3 }, (_, i) => `t${i}`), LIMITS);
    expect(aiCacheSize(storage)).toBe(AI_CACHE_LIMIT);
    clearAiCache(storage);
    expect(aiCacheSize(storage)).toBe(0);
  });

  it("ignores a corrupted stored cache", () => {
    const storage = memoryStorage();
    storage.setItem("kiemtra-hoadon:ai-cache", "{not json");
    expect(aiCacheSize(storage)).toBe(0);
  });
});
