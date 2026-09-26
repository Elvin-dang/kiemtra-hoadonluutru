"use client";

import { createContext, useContext } from "react";

import type { AiLimits, AskAi } from "@kiemtra/core";
import type { ReactNode } from "react";

export type SourceFile = { name: string; path: string | null; data: ArrayBuffer };
export type SaveOutcome = { savedTo: string | null };

// Everything the shared screens need from the app they run in (web or desktop).
export type Platform = {
  kind: "web" | "desktop";
  privacyNotice: string;
  askAi: AskAi;
  getAiLimits: () => Promise<AiLimits>;
  saveResult: (data: ArrayBuffer, fileName: string, source: Pick<SourceFile, "name" | "path">) => Promise<SaveOutcome>;
};

const PlatformContext = createContext<Platform | null>(null);

export function PlatformProvider({ platform, children }: { platform: Platform; children: ReactNode }) {
  return <PlatformContext value={platform}>{children}</PlatformContext>;
}

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error("usePlatform must be used inside <PlatformProvider>");
  return platform;
}
