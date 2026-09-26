import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Platform, SourceFile } from "@kiemtra/ui";

const { invoke, onDragDropEvent, openDialog, saveDialog, revealItemInDir } = vi.hoisted(() => ({
  invoke: vi.fn(),
  onDragDropEvent: vi.fn(),
  openDialog: vi.fn(),
  saveDialog: vi.fn(),
  revealItemInDir: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ onDragDropEvent }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openDialog, save: saveDialog }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir }));

type DropHandler = (event: { payload: { type: string; paths: string[] } }) => void;

const unlistenDragDrop = vi.fn();

function mockInvoke(startupAnswer: string | null | Error, readAnswers: Record<string, ArrayBuffer | Error> = {}) {
  let startupCalls = 0;
  invoke.mockImplementation(async (command: string, args?: { path?: string }) => {
    if (command === "startup_file") {
      startupCalls += 1;
      if (startupCalls > 1) return null;
      if (startupAnswer instanceof Error) throw startupAnswer;
      return startupAnswer;
    }
    if (command === "read_file") {
      const path = args?.path ?? "";
      const answer = readAnswers[path];
      if (answer instanceof Error) throw answer;
      if (answer) return answer;
      return new ArrayBuffer(0);
    }
    throw new Error(`unexpected invoke: ${command}`);
  });
}

async function loadDesktopPlatform(): Promise<Platform> {
  vi.resetModules();
  const module = await import("./desktopPlatform");
  return module.desktopPlatform;
}

beforeEach(() => {
  invoke.mockReset();
  onDragDropEvent.mockReset();
  unlistenDragDrop.mockReset();
  onDragDropEvent.mockImplementation(async (_handler: DropHandler) => unlistenDragDrop);
});

describe("desktopPlatform.onExternalFile", () => {
  it("delivers the startup file only to a subscriber that is still active (StrictMode remount)", async () => {
    mockInvoke("C:\\Hóa đơn\\XUAT HDDT BAN RA.xlsx");
    const platform = await loadDesktopPlatform();

    const firstHandler = vi.fn();
    const unsubscribeFirst = platform.onExternalFile?.(firstHandler);
    unsubscribeFirst?.();

    const secondHandler = vi.fn();
    platform.onExternalFile?.(secondHandler);

    await vi.waitFor(() => expect(secondHandler).toHaveBeenCalledTimes(1));
    await expect(secondHandler.mock.calls[0][0]).resolves.toEqual({
      name: "XUAT HDDT BAN RA.xlsx",
      path: "C:\\Hóa đơn\\XUAT HDDT BAN RA.xlsx",
      data: expect.any(ArrayBuffer),
    });
    expect(firstHandler).not.toHaveBeenCalled();
  });

  it("gets the startup file exactly once for a single subscription", async () => {
    mockInvoke("/tmp/hoadon.xlsx");
    const platform = await loadDesktopPlatform();

    const handler = vi.fn();
    platform.onExternalFile?.(handler);

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await expect(handler.mock.calls[0][0]).resolves.toEqual({
      name: "hoadon.xlsx",
      path: "/tmp/hoadon.xlsx",
      data: expect.any(ArrayBuffer),
    });

    const invokeCallsForStartup = invoke.mock.calls.filter(([command]) => command === "startup_file");
    expect(invokeCallsForStartup).toHaveLength(1);
  });

  it("delivers a rejecting promise when read_file fails for the startup file, and still registers drag-drop", async () => {
    const path = "/tmp/broken.xlsx";
    mockInvoke(path, { [path]: new Error("Không đọc được file: broken.xlsx") });
    const platform = await loadDesktopPlatform();

    // Attach a catch synchronously, in the same call, so Node never sees an unhandled
    // rejection while `vi.waitFor` polls across microtask turns.
    const handler = vi.fn((file: Promise<SourceFile>) => void file.catch(() => {}));
    platform.onExternalFile?.(handler);

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await expect(handler.mock.calls[0][0]).rejects.toThrow("Không đọc được file: broken.xlsx");
    await vi.waitFor(() => expect(onDragDropEvent).toHaveBeenCalledTimes(1));
  });

  it("delivers a dropped .xlsx file with its base name, from a Windows path", async () => {
    mockInvoke(null);
    const platform = await loadDesktopPlatform();

    const handler = vi.fn();
    platform.onExternalFile?.(handler);
    await vi.waitFor(() => expect(onDragDropEvent).toHaveBeenCalledTimes(1));

    const dropHandler = onDragDropEvent.mock.calls[0][0] as DropHandler;
    const windowsPath = "C:\\Hóa đơn\\XUAT HDDT BAN RA.xlsx";
    dropHandler({ payload: { type: "drop", paths: [windowsPath] } });

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await expect(handler.mock.calls[0][0]).resolves.toEqual({
      name: "XUAT HDDT BAN RA.xlsx",
      path: windowsPath,
      data: expect.any(ArrayBuffer),
    });
  });
});
