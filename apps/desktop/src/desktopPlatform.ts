import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { toAiAnswer } from "./aiAnswer";

import type { AiLimits } from "@kiemtra/core";
import type { Platform, SaveOutcome, SourceFile } from "@kiemtra/ui";
import type { RustAnswer } from "./aiAnswer";

// Same ceilings as the website's server defaults; the user's own settings apply within them.
const LOCAL_LIMITS: AiLimits = { maxTexts: 100000, maxTextLength: 1000, concurrency: 100 };
const EXCEL_FILTER = [{ name: "Excel", extensions: ["xlsx", "xlsm"] }];
const EXCEL_PATH = /\.xls[xm]$/i;

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

async function readSource(path: string): Promise<SourceFile> {
  const data = await invoke<ArrayBuffer>("read_file", { path });
  return { name: baseName(path), path, data };
}

// Rust hands the launch file out once only; cache the request so every subscriber
// (StrictMode's double-mount included) awaits the same answer instead of asking again.
let startupFile: Promise<string | null> | null = null;
function getStartupFile(): Promise<string | null> {
  startupFile ??= invoke<string | null>("startup_file").catch(() => null);
  return startupFile;
}

// The launch file itself must reach exactly one subscriber for the whole session, even
// though later mounts (an AI-settings change re-subscribing, StrictMode, ...) call
// onExternalFile again with the same still-resolved startup promise.
let startupTaken = false;

function toBytes(data: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(data));
}

async function saveAs(data: ArrayBuffer, fileName: string): Promise<SaveOutcome> {
  const path = await save({ defaultPath: fileName, filters: EXCEL_FILTER });
  if (!path) return { savedTo: null };
  await invoke("save_as", { path, bytes: toBytes(data) });
  return { savedTo: path };
}

export const desktopPlatform: Platform = {
  kind: "desktop",
  privacyNotice:
    "Dữ liệu được xử lý ngay trên máy của bạn. Chỉ nội dung lưu trú không đọc được mới được gửi tới OpenAI bằng khóa của bạn.",
  askAi: async (texts, limits) => toAiAnswer(await invoke<RustAnswer>("ask_ai", { texts, limits })),
  getAiLimits: async () => LOCAL_LIMITS,
  saveResult: async (data, fileName, source) => {
    if (!source.path) return saveAs(data, fileName);
    const savedTo = await invoke<string>("save_next_to", { sourcePath: source.path, fileName, bytes: toBytes(data) });
    return { savedTo };
  },
  saveResultAs: saveAs,
  revealFile: (path) => revealItemInDir(path),
  pickFile: async () => {
    const path = await open({ multiple: false, directory: false, filters: EXCEL_FILTER });
    return typeof path === "string" ? readSource(path) : null;
  },
  onExternalFile: (handler) => {
    let isActive = true;
    let unlisten: () => void = () => {};
    // Register the drop listener first, so a startup-file failure can never block it.
    void (async () => {
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const path = event.payload.paths.find((candidate) => EXCEL_PATH.test(candidate));
        if (path) handler(readSource(path));
      });
      if (isActive) unlisten = stop;
      else stop();
    })();
    void getStartupFile().then((path) => {
      if (path && isActive && !startupTaken) {
        startupTaken = true;
        handler(readSource(path));
      }
    });
    return () => {
      isActive = false;
      unlisten();
    };
  },
  aiKey: {
    status: () => invoke<string | null>("ai_key_status"),
    save: async (key) => {
      await invoke("set_ai_key", { key });
      return invoke<string | null>("ai_key_status");
    },
    remove: () => invoke("delete_ai_key"),
  },
  aiModel: {
    get: () => invoke<string>("get_model"),
    set: (model) => invoke("set_model", { model }),
  },
};
