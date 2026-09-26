"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_AI_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from "../utils/aiSettings";

import type { AiLimits, AiSettings } from "../types/invoice";

const NO_LIMIT: AiLimits = {
  maxTexts: Number.MAX_SAFE_INTEGER,
  maxTextLength: Number.MAX_SAFE_INTEGER,
  concurrency: Number.MAX_SAFE_INTEGER,
};

function numericLimits({ maxTexts, maxTextLength, concurrency }: AiLimits): AiLimits {
  return { maxTexts, maxTextLength, concurrency };
}

async function fetchServerLimits(): Promise<AiLimits> {
  try {
    const response = await fetch("/api/ai");
    if (!response.ok) return numericLimits(DEFAULT_AI_SETTINGS);
    const { limits } = (await response.json()) as { limits?: unknown };
    return numericLimits(sanitizeSettings(limits, NO_LIMIT));
  } catch {
    return numericLimits(DEFAULT_AI_SETTINGS);
  }
}

export function useAiSettings() {
  const [limits, setLimits] = useState<AiLimits>(() => numericLimits(DEFAULT_AI_SETTINGS));
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

  // Reset restores the numbers but keeps the on/off choice.
  const resetSettings = useCallback(
    () => updateSettings({ ...sanitizeSettings(null, limits), isEnabled: settings.isEnabled }),
    [limits, settings.isEnabled, updateSettings],
  );

  return { settings, limits, updateSettings, resetSettings };
}
