import { describe, expect, it, vi } from "vitest";

import { fetchAiOutcomes } from "./aiClient";
import { DEFAULT_AI_SETTINGS } from "./aiSettings";

import type { AiAnswer, AskAi } from "./types";

const MAY_2 = new Date(Date.UTC(2025, 4, 2));
const ok = (texts: string[]): AiAnswer => ({ status: "ok", results: texts.map(() => ({ date: "2025-05-02" })) });
const WIDE = { ...DEFAULT_AI_SETTINGS, maxTexts: 1000, concurrency: 10 };

describe("fetchAiOutcomes", () => {
  it("sends texts in batches of 50, in order, truncated, with the numeric limits", async () => {
    const askAi = vi.fn<AskAi>(async (texts) => ok(texts));
    const texts = Array.from({ length: 120 }, (_, i) => (i === 0 ? "y".repeat(600) : `t${i}`));

    const outcomes = await fetchAiOutcomes(texts, WIDE, askAi);

    expect(askAi.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
    expect(askAi.mock.calls[0][0][0]).toHaveLength(500);
    expect(askAi.mock.calls[1][0][0]).toBe("t50");
    expect(askAi.mock.calls[0][1]).toEqual({ maxTexts: 1000, maxTextLength: 500, concurrency: 10 });
    expect(outcomes).toHaveLength(120);
    expect(outcomes[119]).toEqual({ date: MAY_2 });
  });

  it("makes batches as large as the parallel limit when that is above 50", async () => {
    const askAi = vi.fn<AskAi>(async (texts) => ok(texts));
    await fetchAiOutcomes(Array.from({ length: 250 }, (_, i) => `t${i}`), { ...WIDE, concurrency: 100 }, askAi);
    expect(askAi.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 50]);
  });

  it("reports progress after each batch", async () => {
    const onProgress = vi.fn();
    await fetchAiOutcomes(Array.from({ length: 120 }, (_, i) => `t${i}`), WIDE, async (texts) => ok(texts), { onProgress });
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
      { done: 0, total: 120 },
      { done: 50, total: 120 },
      { done: 100, total: 120 },
      { done: 120, total: 120 },
    ]);
  });

  it("stops at once when aborted mid-batch and marks every unanswered row", async () => {
    const controller = new AbortController();
    const askAi = vi.fn<AskAi>(() => {
      controller.abort();
      return new Promise<AiAnswer>(() => {}); // never answers
    });
    const outcomes = await fetchAiOutcomes(Array.from({ length: 120 }, (_, i) => `t${i}`), WIDE, askAi, {
      signal: controller.signal,
    });
    expect(askAi).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(120);
    expect(new Set(outcomes.map((o) => o.note))).toEqual(new Set(["Cần kiểm tra thủ công (đã dừng AI)"]));
  });

  it("keeps the answers already received and sends nothing more after a stop", async () => {
    const controller = new AbortController();
    const askAi = vi.fn<AskAi>(async (texts) => ok(texts));
    const outcomes = await fetchAiOutcomes(Array.from({ length: 120 }, (_, i) => `t${i}`), WIDE, askAi, {
      signal: controller.signal,
      onProgress: ({ done }) => done === 50 && controller.abort(),
    });
    expect(askAi).toHaveBeenCalledTimes(1);
    expect(outcomes[49]).toEqual({ date: MAY_2 });
    expect(outcomes[50]).toEqual({ date: null, note: "Cần kiểm tra thủ công (đã dừng AI)" });
  });

  it("marks rows beyond maxTexts without sending them", async () => {
    const askAi = vi.fn<AskAi>(async (texts) => ok(texts));
    const outcomes = await fetchAiOutcomes(["a", "b", "c"], { ...DEFAULT_AI_SETTINGS, maxTexts: 2 }, askAi);
    expect(askAi.mock.calls[0][0]).toEqual(["a", "b"]);
    expect(outcomes[2]).toEqual({ date: null, note: "Vượt giới hạn AI (2 dòng)" });
  });

  it("passes per-text notes through", async () => {
    const askAi = vi.fn<AskAi>(async () => ({ status: "ok", results: [{ date: null, note: "AI không xác định được" }] }));
    expect(await fetchAiOutcomes(["a"], WIDE, askAi)).toEqual([{ date: null, note: "AI không xác định được" }]);
  });

  it("keeps the other batches when one batch fails", async () => {
    const askAi = vi.fn<AskAi>(async (texts) => (texts[0] === "t50" ? { status: "failed" } : ok(texts)));
    const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const outcomes = await fetchAiOutcomes(texts, WIDE, askAi);
    expect(outcomes[49]).toEqual({ date: MAY_2 });
    expect(outcomes[50]).toEqual({ date: null, note: "Không gọi được AI" });
    expect(outcomes[99]).toEqual({ date: null, note: "Không gọi được AI" });
    expect(outcomes[100]).toEqual({ date: MAY_2 });
  });

  it("uses the platform's reason when AI is disabled, or a default", async () => {
    const withNote = vi.fn<AskAi>(async () => ({ status: "disabled", note: "Chưa lưu khóa OpenAI (Cài đặt AI)" }));
    expect(await fetchAiOutcomes(["a"], WIDE, withNote)).toEqual([{ date: null, note: "Chưa lưu khóa OpenAI (Cài đặt AI)" }]);
    const plain = vi.fn<AskAi>(async () => ({ status: "disabled" }));
    expect(await fetchAiOutcomes(["a"], WIDE, plain)).toEqual([{ date: null, note: "AI chưa được bật" }]);
  });

  it("treats a thrown error or a wrong-length answer as a failure", async () => {
    const throwing = vi.fn<AskAi>(async () => {
      throw new Error("offline");
    });
    expect(await fetchAiOutcomes(["a"], WIDE, throwing)).toEqual([{ date: null, note: "Không gọi được AI" }]);
    const short = vi.fn<AskAi>(async () => ({ status: "ok", results: [] }));
    expect(await fetchAiOutcomes(["a"], WIDE, short)).toEqual([{ date: null, note: "Không gọi được AI" }]);
  });

  it("never calls the platform when AI is turned off or there is nothing to ask", async () => {
    const askAi = vi.fn<AskAi>();
    expect(await fetchAiOutcomes(["a"], { ...WIDE, isEnabled: false }, askAi)).toEqual([
      { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" },
    ]);
    expect(await fetchAiOutcomes([], WIDE, askAi)).toEqual([]);
    expect(askAi).not.toHaveBeenCalled();
  });
});
