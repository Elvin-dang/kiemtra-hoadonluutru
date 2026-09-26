import { describe, expect, it } from "vitest";

import { DEFAULT_AI_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from "./aiSettings";

const LIMITS = { maxTexts: 1000, maxTextLength: 500, concurrency: 10 };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("sanitizeSettings", () => {
  it("keeps whole numbers within 1..limit", () => {
    expect(sanitizeSettings({ isEnabled: false, maxTexts: 20, maxTextLength: 300, concurrency: 1 }, LIMITS)).toEqual({
      isEnabled: false,
      maxTexts: 20,
      maxTextLength: 300,
      concurrency: 1,
    });
  });

  it("clamps values above the server limit", () => {
    expect(sanitizeSettings({ maxTexts: 9999, maxTextLength: 9999, concurrency: 50 }, LIMITS)).toEqual({
      isEnabled: true,
      ...LIMITS,
    });
  });

  it("falls back to the default for missing, fractional, zero or non-numeric values", () => {
    expect(sanitizeSettings({ isEnabled: "no", maxTexts: 0, maxTextLength: 2.5, concurrency: "x" }, LIMITS)).toEqual(
      DEFAULT_AI_SETTINGS,
    );
    expect(sanitizeSettings(null, LIMITS)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("never returns a default above a lowered server limit", () => {
    expect(sanitizeSettings(null, { maxTexts: 10, maxTextLength: 200, concurrency: 2 })).toEqual({
      isEnabled: true,
      maxTexts: 10,
      maxTextLength: 200,
      concurrency: 2,
    });
  });
});

describe("defaults", () => {
  it("turns AI on and keeps the conservative 50 rows / 5 parallel", () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({ isEnabled: true, maxTexts: 50, maxTextLength: 500, concurrency: 5 });
  });

  it("allows up to 1000 rows and 10 parallel requests when the server permits it", () => {
    expect(sanitizeSettings({ isEnabled: true, maxTexts: 1000, maxTextLength: 500, concurrency: 10 }, LIMITS)).toEqual({
      isEnabled: true,
      maxTexts: 1000,
      maxTextLength: 500,
      concurrency: 10,
    });
  });
});

describe("loadSettings / saveSettings", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    saveSettings({ isEnabled: false, maxTexts: 10, maxTextLength: 200, concurrency: 2 }, storage);
    expect(loadSettings(LIMITS, storage)).toEqual({ isEnabled: false, maxTexts: 10, maxTextLength: 200, concurrency: 2 });
  });

  it("uses defaults when storage is missing, empty or holds invalid JSON", () => {
    expect(loadSettings(LIMITS, undefined)).toEqual(DEFAULT_AI_SETTINGS);
    expect(loadSettings(LIMITS, memoryStorage())).toEqual(DEFAULT_AI_SETTINGS);
    expect(loadSettings(LIMITS, memoryStorage({ "kiemtra-hoadon:ai-settings": "{not json" }))).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("does not throw when storage throws (private mode, blocked site data)", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadSettings(LIMITS, broken)).toEqual(DEFAULT_AI_SETTINGS);
    expect(() => saveSettings(DEFAULT_AI_SETTINGS, broken)).not.toThrow();
  });
});
