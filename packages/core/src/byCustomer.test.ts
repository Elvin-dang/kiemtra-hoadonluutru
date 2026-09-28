import { describe, expect, it } from "vitest";

import { analyze } from "./analyze";
import { summarizeByCustomer } from "./byCustomer";

import type { InputRow } from "./types";

const row = (buyer: string, taxCode: string, invoiceDate: string, info = "(30/04/2025-02/05/2025)"): InputRow => ({
  invoiceNo: 1,
  invoiceDate,
  taxCode,
  buyer,
  info,
});

describe("summarizeByCustomer", () => {
  it("groups by tax code (name when there is none) and lists the most late first", () => {
    const { results } = analyze(
      [
        row("CÔNG TY A", "0101", "02/05/2025"),
        row("Công ty A (chi nhánh)", "0101", "10/05/2025"),
        row("Khách lẻ", "-", "10/05/2025"),
        row("khách lẻ", "-", "10/05/2025"),
        row("CÔNG TY B", "0202", "02/05/2025", ""),
      ],
      1,
    );
    expect(summarizeByCustomer(results)).toEqual([
      { buyer: "Khách lẻ", taxCode: "-", total: 2, warn: 2, unknown: 0 },
      { buyer: "CÔNG TY A", taxCode: "0101", total: 2, warn: 1, unknown: 0 },
      { buyer: "CÔNG TY B", taxCode: "0202", total: 1, warn: 0, unknown: 1 },
    ]);
  });
});
