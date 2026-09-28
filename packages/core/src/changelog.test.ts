import { describe, expect, it } from "vitest";

import { noteItems, parseChangelog } from "./changelog";

const CHANGELOG = `# Nhật ký thay đổi

## 1.1.0 — 2026-09-28
- Tự cập nhật
* Phím tắt Ctrl+O

Ghi chú không phải mục.

## v1.0.0
- Phiên bản đầu tiên
`;

describe("parseChangelog", () => {
  it("reads each version heading with its bullet items and skips other text", () => {
    expect(parseChangelog(CHANGELOG)).toEqual([
      { version: "1.1.0", date: "2026-09-28", items: ["Tự cập nhật", "Phím tắt Ctrl+O"] },
      { version: "1.0.0", date: "", items: ["Phiên bản đầu tiên"] },
    ]);
  });

  it("ignores bullets that come before any version heading", () => {
    expect(parseChangelog("- orphan\n## 2.0.0\n- a")).toEqual([{ version: "2.0.0", date: "", items: ["a"] }]);
  });
});

describe("noteItems", () => {
  it("takes the bullet lines of a GitHub release body (CRLF included)", () => {
    expect(noteItems("## 1.2.0\r\n- Sửa lỗi A\r\n- Thêm B\r\n")).toEqual(["Sửa lỗi A", "Thêm B"]);
  });
});
