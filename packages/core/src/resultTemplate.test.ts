import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resultTemplate } from "./resultTemplate";

describe("resultTemplate", () => {
  it("embeds templates/ket-qua-ai.xlsx byte for byte (run `npm run embed-template -w @kiemtra/core` after editing it)", () => {
    expect(new Uint8Array(resultTemplate())).toEqual(new Uint8Array(readFileSync("templates/ket-qua-ai.xlsx")));
  });
});
