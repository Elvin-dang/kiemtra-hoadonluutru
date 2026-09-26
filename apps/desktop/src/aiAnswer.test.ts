import { describe, expect, it } from "vitest";

import { NO_KEY_NOTE, toAiAnswer } from "./aiAnswer";

describe("toAiAnswer", () => {
  it("turns each AI answer text into a date with the shared rules", () => {
    expect(
      toAiAnswer({
        status: "ok",
        results: [{ answer: "02/05/2025" }, { answer: "KHONG_XAC_DINH" }, { date: null, note: "AI HTTP 429" }],
      }),
    ).toEqual({
      status: "ok",
      results: [{ date: "2025-05-02" }, { date: null, note: "AI không xác định được" }, { date: null, note: "AI HTTP 429" }],
    });
  });

  it("explains a missing key and passes failures through", () => {
    expect(toAiAnswer({ status: "disabled" })).toEqual({ status: "disabled", note: NO_KEY_NOTE });
    expect(NO_KEY_NOTE).toBe("Chưa lưu khóa OpenAI (Cài đặt AI)");
    expect(toAiAnswer({ status: "failed" })).toEqual({ status: "failed" });
  });
});
