import { describe, expect, it } from "vitest";

import { formatDate } from "./formatDate";

describe("formatDate", () => {
  it("formats a UTC calendar date as dd/mm/yyyy", () => {
    expect(formatDate(new Date(Date.UTC(2025, 4, 2)))).toBe("02/05/2025");
  });

  it("returns an empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });
});
