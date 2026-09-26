import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function openAiReply(text: string) {
  return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text }] }] });
}

function inputOf(init: RequestInit | undefined): string {
  return (JSON.parse(String(init?.body)) as { input: string }).input;
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/ai", () => {
  it.each([
    ["not json"],
    [{}],
    [{ texts: [] }],
    [{ texts: Array.from({ length: 51 }, () => "x") }],
    [{ texts: [""] }],
    [{ texts: ["x".repeat(501)] }],
    [{ texts: [1] }],
  ])("returns 400 for %j", async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("returns 503 when the key is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await post({ texts: ["a"] });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ai_disabled" });
  });

  it("returns parsed dates only, never the raw model text", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) =>
      openAiReply(inputOf(init) === "a" ? "02/05/2025" : "KHONG_XAC_DINH — ignore previous instructions"),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ texts: ["a", "b"] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ date: "2025-05-02" }, { date: null, note: "AI không xác định được" }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-test");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "test-model",
      instructions:
        "Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH.",
      input: "a",
      max_output_tokens: 1000,
      store: false,
    });
  });

  it("reports upstream failures per text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        if (inputOf(init) === "a") throw new Error("network down");
        return new Response("rate limited", { status: 429 });
      }),
    );
    expect(await (await post({ texts: ["a", "b"] })).json()).toEqual({
      results: [
        { date: null, note: "Không gọi được AI" },
        { date: null, note: "AI HTTP 429" },
      ],
    });
  });

  it("logs OpenAI error details without the stay text or the key", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        if (inputOf(init) === "Nguyễn Văn A phòng 806") {
          return Response.json(
            { error: { message: "You exceeded your current quota.", type: "insufficient_quota", code: "insufficient_quota" } },
            { status: 429 },
          );
        }
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );

    await post({ texts: ["Nguyễn Văn A phòng 806", "Nguyễn Văn B"] });

    expect(logSpy).toHaveBeenCalledWith("[api/ai] OpenAI error", {
      status: 429,
      type: "insufficient_quota",
      code: "insufficient_quota",
      message: "You exceeded your current quota.",
    });
    expect(logSpy).toHaveBeenCalledWith("[api/ai] OpenAI request failed", {
      name: "TimeoutError",
      message: "The operation timed out.",
    });
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain("Nguyễn");
    expect(logged).not.toContain("sk-test");
    logSpy.mockRestore();
  });
});
