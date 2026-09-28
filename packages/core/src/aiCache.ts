import { browserStorage } from "./aiSettings";

import type { AiResponseItem, AskAi } from "./types";

const CACHE_KEY = "kiemtra-hoadon:ai-cache";
// ponytail: whole cache in one localStorage entry (~1 MB at the cap); move to a file if it grows.
export const AI_CACHE_LIMIT = 5000;

type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Oldest first, so trimming drops the least recent answers.
function load(storage: CacheStorage | undefined): Map<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(CACHE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return new Map();
  }
}

function save(cache: Map<string, string>, storage: CacheStorage | undefined) {
  const entries = [...cache].slice(-AI_CACHE_LIMIT);
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or off: answers just are not remembered.
  }
}

export function aiCacheSize(storage: CacheStorage | undefined = browserStorage()): number {
  return load(storage).size;
}

export function clearAiCache(storage: CacheStorage | undefined = browserStorage()): void {
  try {
    storage?.removeItem(CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}

// Remembers every date AI found, per exact text: a description seen before is answered on
// this PC without a new request. Failures and "no date" answers are not remembered.
export function withAiCache(askAi: AskAi, storage: CacheStorage | undefined = browserStorage()): AskAi {
  return async (texts, limits) => {
    const cache = load(storage);
    const missing = [...new Set(texts.filter((text) => !cache.has(text)))];
    const fresh = new Map<string, AiResponseItem>();
    if (missing.length > 0) {
      const answer = await askAi(missing, limits);
      if (missing.length === texts.length && answer.status !== "ok") return answer;
      if (answer.status === "ok" && answer.results.length === missing.length) {
        missing.forEach((text, i) => fresh.set(text, answer.results[i]));
      } else {
        const note = answer.status === "disabled" ? (answer.note ?? "AI chưa được bật") : "Không gọi được AI";
        missing.forEach((text) => fresh.set(text, { date: null, note }));
      }
      for (const [text, item] of fresh) {
        if (item.date === null) continue;
        cache.delete(text);
        cache.set(text, item.date);
      }
      save(cache, storage);
    }
    const results = texts.map((text): AiResponseItem => {
      const date = cache.get(text);
      return fresh.get(text) ?? (date ? { date } : { date: null, note: "Không gọi được AI" });
    });
    return { status: "ok", results };
  };
}
