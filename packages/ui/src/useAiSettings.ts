"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_AI_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from "@kiemtra/core";

import { usePlatform } from "./platform";

import type { AiLimits, AiSettings } from "@kiemtra/core";

const NO_LIMIT: AiLimits = {
  maxTexts: Number.MAX_SAFE_INTEGER,
  maxTextLength: Number.MAX_SAFE_INTEGER,
  concurrency: Number.MAX_SAFE_INTEGER,
};

function numericLimits({ maxTexts, maxTextLength, concurrency }: AiLimits): AiLimits {
  return { maxTexts, maxTextLength, concurrency };
}

export function useAiSettings() {
  const platform = usePlatform();
  const [limits, setLimits] = useState<AiLimits>(() => numericLimits(DEFAULT_AI_SETTINGS));
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  // localStorage is read after mount (not during render) so server and client HTML match.
  useEffect(() => {
    let isActive = true;
    void platform
      .getAiLimits()
      .then((raw) => numericLimits(sanitizeSettings(raw, NO_LIMIT)))
      .catch(() => numericLimits(DEFAULT_AI_SETTINGS))
      .then((platformLimits) => {
        if (!isActive) return;
        setLimits(platformLimits);
        setSettings(loadSettings(platformLimits));
      });
    return () => {
      isActive = false;
    };
  }, [platform]);

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
