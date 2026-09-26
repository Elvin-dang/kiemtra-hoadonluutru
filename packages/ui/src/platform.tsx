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

  // Desktop-only capabilities; the web leaves them undefined.
  pickFile?: () => Promise<SourceFile | null>;
  onExternalFile?: (handler: (file: Promise<SourceFile>) => void) => () => void;
  saveResultAs?: (data: ArrayBuffer, fileName: string) => Promise<SaveOutcome>;
  revealFile?: (path: string) => Promise<void>;
  aiKey?: {
    status: () => Promise<string | null>;
    save: (key: string) => Promise<string | null>;
    remove: () => Promise<void>;
  };
  aiModel?: { get: () => Promise<string>; set: (model: string) => Promise<void> };
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
