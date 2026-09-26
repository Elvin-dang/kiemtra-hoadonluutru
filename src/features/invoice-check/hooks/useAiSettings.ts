"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_AI_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from "../utils/aiSettings";

import type { AiSettings } from "../types/invoice";

const NO_LIMIT: AiSettings = {
  maxTexts: Number.MAX_SAFE_INTEGER,
  maxTextLength: Number.MAX_SAFE_INTEGER,
  concurrency: Number.MAX_SAFE_INTEGER,
};

async function fetchServerLimits(): Promise<AiSettings> {
  try {
    const response = await fetch("/api/ai");
    if (!response.ok) return DEFAULT_AI_SETTINGS;
    const { limits } = (await response.json()) as { limits?: unknown };
    return sanitizeSettings(limits, NO_LIMIT);
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function useAiSettings() {
  const [limits, setLimits] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  // localStorage is read after mount (not during render) so server and client HTML match.
  useEffect(() => {
    let isActive = true;
    void fetchServerLimits().then((serverLimits) => {
      if (!isActive) return;
      setLimits(serverLimits);
      setSettings(loadSettings(serverLimits));
    });
    return () => {
      isActive = false;
    };
  }, []);

  const updateSettings = useCallback(
    (next: AiSettings) => {
      const clean = sanitizeSettings(next, limits);
      setSettings(clean);
      saveSettings(clean);
    },
    [limits],
  );

  const resetSettings = useCallback(() => updateSettings(sanitizeSettings(null, limits)), [limits, updateSettings]);

  return { settings, limits, updateSettings, resetSettings };
}
