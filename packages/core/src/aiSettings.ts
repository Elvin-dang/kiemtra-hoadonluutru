import type { AiLimits, AiSettings } from "./types";

export const DEFAULT_AI_SETTINGS: AiSettings = { isEnabled: true, maxTexts: 50, maxTextLength: 500, concurrency: 5 };

const STORAGE_KEY = "kiemtra-hoadon:ai-settings";
const FIELDS = ["maxTexts", "maxTextLength", "concurrency"] as const;

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

function pick(value: unknown, field: string): unknown {
  return typeof value === "object" && value !== null && field in value
    ? (value as Record<string, unknown>)[field]
    : undefined;
}

// Whole numbers from 1 up to the server limit; anything else falls back to the (clamped) default.
export function sanitizeSettings(value: unknown, limits: AiLimits): AiSettings {
  const isEnabled = pick(value, "isEnabled");
  const result = { ...DEFAULT_AI_SETTINGS, isEnabled: typeof isEnabled === "boolean" ? isEnabled : true };
  for (const field of FIELDS) {
    const candidate = pick(value, field);
    const isValid = typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 1;
    result[field] = Math.min(isValid ? candidate : DEFAULT_AI_SETTINGS[field], limits[field]);
  }
  return result;
}

export function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSettings(limits: AiLimits, storage: KeyValueStorage | undefined = browserStorage()): AiSettings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null, limits);
  } catch {
    return sanitizeSettings(null, limits);
  }
}

export function saveSettings(settings: AiSettings, storage: KeyValueStorage | undefined = browserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the settings still apply for this visit.
  }
}
