import { describe, expect, it, vi } from "vitest";

import { askAiRoute, fetchAiLimits } from "./webPlatform";

const LIMITS = { maxTexts: 50, maxTextLength: 500, concurrency: 5 };

describe("askAiRoute", () => {
  it("posts the texts and the user's limits to /api/ai and returns its results", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ results: [{ date: "2025-05-02" }] }));
    expect(await askAiRoute(["a"], LIMITS, fetchFn)).toEqual({ status: "ok", results: [{ date: "2025-05-02" }] });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ texts: ["a"], settings: LIMITS });
  });

  it("maps 503 to disabled and other errors or malformed replies to failed", async () => {
    expect(await askAiRoute(["a"], LIMITS, vi.fn<typeof fetch>(async () => new Response("", { status: 503 })))).toEqual({
      status: "disabled",
    });
    expect(await askAiRoute(["a"], LIMITS, vi.fn<typeof fetch>(async () => new Response("", { status: 500 })))).toEqual({
      status: "failed",
    });
    expect(await askAiRoute(["a"], LIMITS, vi.fn<typeof fetch>(async () => Response.json({ nope: 1 })))).toEqual({
      status: "failed",
    });
  });
});

describe("fetchAiLimits", () => {
  it("reads the server ceilings", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ limits: LIMITS }));
    expect(await fetchAiLimits(fetchFn)).toEqual(LIMITS);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/ai");
  });

  it("throws when the server does not answer, so the page keeps its defaults", async () => {
    await expect(fetchAiLimits(vi.fn<typeof fetch>(async () => new Response("", { status: 500 })))).rejects.toThrow();
  });
});
