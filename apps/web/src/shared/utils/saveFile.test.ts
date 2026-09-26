import { afterEach, describe, expect, it, vi } from "vitest";

import { saveFile } from "./saveFile";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saveFile", () => {
  it("revokes the object URL only after the browser has started the download", () => {
    vi.useFakeTimers();
    const link = { href: "", download: "", click: vi.fn() };
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => link) });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:result"), revokeObjectURL });

    saveFile(new ArrayBuffer(4), "sample_ket_qua.xlsx", "application/octet-stream");

    expect(link).toMatchObject({ href: "blob:result", download: "sample_ket_qua.xlsx" });
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:result");
  });
});
