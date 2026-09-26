import { describe, expect, it, vi } from "vitest";

import { fetchAiOutcomes } from "./aiClient";
import { DEFAULT_AI_SETTINGS } from "./aiSettings";

import type { Mock } from "vitest";

function sentTexts(fetchFn: Mock<typeof fetch>): string[] {
  return (JSON.parse(String(fetchFn.mock.calls[0][1]?.body)) as { texts: string[] }).texts;
}

describe("fetchAiOutcomes", () => {
  it("sends at most 50 texts, truncated to 500 chars, and marks the rest", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const { texts } = JSON.parse(String(init?.body)) as { texts: string[] };
      return Response.json({ results: texts.map(() => ({ date: "2025-05-02" })) });
    });
    const texts = Array.from({ length: 52 }, (_, i) => (i === 0 ? "y".repeat(600) : `t${i}`));

    const outcomes = await fetchAiOutcomes(texts, DEFAULT_AI_SETTINGS, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/ai");
    expect(sentTexts(fetchFn)).toHaveLength(50);
    expect(sentTexts(fetchFn)[0]).toHaveLength(500);
    expect(outcomes).toHaveLength(52);
    expect(outcomes[0]).toEqual({ date: new Date(Date.UTC(2025, 4, 2)) });
    expect(outcomes[49]).toEqual({ date: new Date(Date.UTC(2025, 4, 2)) });
    expect(outcomes[50]).toEqual({ date: null, note: "Vượt giới hạn AI (50 dòng)" });
    expect(outcomes[51]).toEqual({ date: null, note: "Vượt giới hạn AI (50 dòng)" });
  });

  it("passes through per-text notes from the route", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      Response.json({ results: [{ date: null, note: "AI không xác định được" }] }),
    );
    expect(await fetchAiOutcomes(["a"], DEFAULT_AI_SETTINGS, fetchFn)).toEqual([{ date: null, note: "AI không xác định được" }]);
  });

  it("marks every sent text when AI is disabled", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ error: "ai_disabled" }, { status: 503 }));
    expect(await fetchAiOutcomes(["a", "b"], DEFAULT_AI_SETTINGS, fetchFn)).toEqual([
      { date: null, note: "AI chưa được bật" },
      { date: null, note: "AI chưa được bật" },
    ]);
  });

  it("marks every sent text on network errors and malformed replies", async () => {
    const failing = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    expect(await fetchAiOutcomes(["a"], DEFAULT_AI_SETTINGS, failing)).toEqual([{ date: null, note: "Không gọi được AI" }]);

    const malformed = vi.fn<typeof fetch>(async () => Response.json({ results: [] }));
    expect(await fetchAiOutcomes(["a"], DEFAULT_AI_SETTINGS, malformed)).toEqual([{ date: null, note: "Không gọi được AI" }]);
  });

  it("applies the browser settings and sends them with the data", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const { texts } = JSON.parse(String(init?.body)) as { texts: string[] };
      return Response.json({ results: texts.map(() => ({ date: "2025-05-02" })) });
    });
    const settings = { isEnabled: true, maxTexts: 2, maxTextLength: 3, concurrency: 1 };

    const outcomes = await fetchAiOutcomes(["abcdef", "b", "c"], settings, fetchFn);

    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({
      texts: ["abc", "b"],
      settings: { maxTexts: 2, maxTextLength: 3, concurrency: 1 },
    });
    expect(outcomes[2]).toEqual({ date: null, note: "Vượt giới hạn AI (2 dòng)" });
  });

  it("never calls the route when AI is turned off", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const outcomes = await fetchAiOutcomes(["a", "b"], { ...DEFAULT_AI_SETTINGS, isEnabled: false }, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" },
      { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" },
    ]);
  });

  it("sends large jobs in batches of 50, in order, and keeps each batch's results", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const { texts } = JSON.parse(String(init?.body)) as { texts: string[] };
      if (texts[0] === "t50") return Response.json({ error: "boom" }, { status: 500 }); // second batch fails
      return Response.json({ results: texts.map(() => ({ date: "2025-05-02" })) });
    });
    const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);

    const outcomes = await fetchAiOutcomes(texts, { ...DEFAULT_AI_SETTINGS, maxTexts: 1000, concurrency: 10 }, fetchFn);

    expect(fetchFn.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { texts: string[] }).texts[0])).toEqual([
      "t0",
      "t50",
      "t100",
    ]);
    expect(fetchFn.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { texts: string[] }).texts.length)).toEqual([
      50, 50, 20,
    ]);
    expect(outcomes).toHaveLength(120);
    expect(outcomes[49]).toEqual({ date: new Date(Date.UTC(2025, 4, 2)) });
    expect(outcomes[50]).toEqual({ date: null, note: "Không gọi được AI" });
    expect(outcomes[119]).toEqual({ date: new Date(Date.UTC(2025, 4, 2)) });
  });

  it("does not call the route when there is nothing to ask", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await fetchAiOutcomes([], DEFAULT_AI_SETTINGS, fetchFn)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
