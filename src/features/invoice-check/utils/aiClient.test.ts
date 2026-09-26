import { describe, expect, it, vi } from "vitest";

import { fetchAiOutcomes } from "./aiClient";

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

    const outcomes = await fetchAiOutcomes(texts, fetchFn);

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
    expect(await fetchAiOutcomes(["a"], fetchFn)).toEqual([{ date: null, note: "AI không xác định được" }]);
  });

  it("marks every sent text when AI is disabled", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ error: "ai_disabled" }, { status: 503 }));
    expect(await fetchAiOutcomes(["a", "b"], fetchFn)).toEqual([
      { date: null, note: "AI chưa được bật" },
      { date: null, note: "AI chưa được bật" },
    ]);
  });

  it("marks every sent text on network errors and malformed replies", async () => {
    const failing = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    expect(await fetchAiOutcomes(["a"], failing)).toEqual([{ date: null, note: "Không gọi được AI" }]);

    const malformed = vi.fn<typeof fetch>(async () => Response.json({ results: [] }));
    expect(await fetchAiOutcomes(["a"], malformed)).toEqual([{ date: null, note: "Không gọi được AI" }]);
  });

  it("does not call the route when there is nothing to ask", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await fetchAiOutcomes([], fetchFn)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
