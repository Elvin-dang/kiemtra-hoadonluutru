import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import changelog from "../CHANGELOG.md?raw";
import { toAiAnswer } from "./aiAnswer";

import type { AiLimits } from "@kiemtra/core";
import type { Platform, RecentFile, SaveOutcome, SourceFile, UpdateInfo } from "@kiemtra/ui";
import type { RustAnswer } from "./aiAnswer";

// Same ceilings as the website's server defaults; the user's own settings apply within them.
const LOCAL_LIMITS: AiLimits = { maxTexts: 100000, maxTextLength: 1000, concurrency: 100 };
const EXCEL_FILTER = [{ name: "Excel", extensions: ["xlsx", "xlsm"] }];
const EXCEL_PATH = /\.xls[xm]$/i;
const LAST_DIR_KEY = "kiemtra-hoadon:last-dir";
const RECENT_KEY = "kiemtra-hoadon:recent-files";
const RECENT_LIMIT = 5;

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// The folder the user last opened a file from; the Open and Save dialogs start there.
function lastDir(): string | undefined {
  try {
    return window.localStorage.getItem(LAST_DIR_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberDir(filePath: string) {
  const dir = filePath.slice(0, Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")));
  try {
    if (dir) window.localStorage.setItem(LAST_DIR_KEY, dir);
  } catch {
    // Storage unavailable: dialogs just open in the default folder.
  }
}

function inLastDir(fileName: string): string {
  const dir = lastDir();
  return dir ? `${dir}${dir.includes("\\") ? "\\" : "/"}${fileName}` : fileName;
}

function recentFiles(): RecentFile[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((path): path is string => typeof path === "string")
      .map((path) => ({ name: baseName(path), path }));
  } catch {
    return [];
  }
}

function saveRecent(paths: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(paths.slice(0, RECENT_LIMIT)));
  } catch {
    // Storage off: no recent list.
  }
}

function rememberRecent(paths: string[]) {
  const others = recentFiles().map((file) => file.path).filter((path) => !paths.includes(path));
  saveRecent([...paths, ...others]);
}

async function readSources(paths: string[]): Promise<SourceFile[]> {
  if (paths[0]) rememberDir(paths[0]);
  const files = await Promise.all(paths.map(readSource));
  rememberRecent(paths);
  return files;
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
  const path = await save({ defaultPath: inLastDir(fileName), filters: EXCEL_FILTER });
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
  openResult: (path) => invoke("open_result", { path }),
  recentFiles,
  openRecent: async (path) => {
    try {
      return await readSources([path]);
    } catch (error) {
      saveRecent(recentFiles().map((file) => file.path).filter((candidate) => candidate !== path));
      throw error;
    }
  },
  pickFiles: async () => {
    const paths = await open({ multiple: true, directory: false, filters: EXCEL_FILTER, defaultPath: lastDir() });
    return paths ? readSources(paths) : [];
  },
  onExternalFiles: (handler) => {
    let isActive = true;
    let unlisten: () => void = () => {};
    // Register the drop listener first, so a startup-file failure can never block it.
    void (async () => {
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const paths = event.payload.paths.filter((candidate) => EXCEL_PATH.test(candidate));
        if (paths.length > 0) handler(readSources(paths));
      });
      if (isActive) unlisten = stop;
      else stop();
    })();
    void getStartupFile().then((path) => {
      if (path && isActive && !startupTaken) {
        startupTaken = true;
        handler(readSources([path]));
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
  app: {
    version: getVersion,
    changelog,
    checkUpdate: () => invoke<UpdateInfo | null>("check_update"),
    installUpdate: () => invoke("install_update"),
  },
};
