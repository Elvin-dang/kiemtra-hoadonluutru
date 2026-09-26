# Kiểm tra hóa đơn lưu trú — web app design

Date: 2026-09-26 · Status: approved design, pending spec review

## Goal

Accounting colleagues upload an invoice workbook and see, within a minute and with nothing installed, which hotel invoices were issued late relative to the guest's check-out date. Results must match the existing Python reference (`fixtures/reference_kiemtra_hoadon.py`) exactly.

**Users:** internal team / accounting colleagues. **Access:** public URL, no login (owner's decision).

**Success criteria**
1. Uploading `fixtures/sample.xlsx` shows 9 invoices: 8 Cảnh báo, 1 Bình thường, 0 Không xác định, with per-row dates and delays identical to the reference.
2. The downloaded `.xlsx` contains the filled `KET_QUA_AI` and `PHAN_TICH_AI` sheets.
3. Tax codes, buyer names and amounts never leave the browser.

## Architecture

- Next.js (App Router, TypeScript), deployed on Vercel, function region `sin1`.
- One page `/` (client component) and one route `POST /api/ai`.
- No database, no auth, no server-side file handling. The server never receives the workbook.

```
browser: pick file → parse (ExcelJS) → rules → [unreadable texts] ──POST /api/ai──► OpenAI
                                                        ◄── dates ──┘
         → table + summary → build result .xlsx → download
```

## Units

| File | Responsibility | Depends on |
|---|---|---|
| `lib/checkout.ts` | `extractCheckout(text): Date \| null`, `toDate(cell): Date \| null` | nothing |
| `lib/analyze.ts` | `analyze(rows, threshold, aiDates?) → { results, counts }` | `checkout.ts` |
| `lib/workbook.ts` | `readInput(buffer) → { rows, threshold, workbook }`, `writeResult(workbook, results) → Blob` | ExcelJS |
| `app/page.tsx` | UI: file picker, summary tiles, table, download, template link | the three libs |
| `app/api/ai/route.ts` | `{texts}` → `{results}` via OpenAI Responses API | `checkout.ts`, OpenAI |
| `public/mau_du_lieu.xlsx` | Blank template (sample workbook, VBA-free) | — |

## Input

- `.xlsx` or `.xlsm`, ≤ 10 MB, ≤ 5,000 data rows (checked in the browser).
- Sheet `DU_LIEU_GOC`, header in row 1, data from row 2 until column A is empty.
- Columns: A số hóa đơn, B ngày hóa đơn (Excel date or `dd/mm/yyyy` text), C mã số thuế, D tên người mua, E thông tin lưu trú. Other columns ignored.
- Threshold: `CAU_HINH!B4` if it is a number, else 1.

## Date rules (`lib/checkout.ts`)

A straight port of `extract_checkout` / `to_date` from the reference:
- Tokenize the text into alternating digit / non-digit runs.
- A date is `d SEP m SEP y` with SEP one of `/ - .` (both separators identical), or `d "tháng" m y` (the word matched case-insensitively as `th?ng`; the gap between m and y is whitespace or a comma).
- Day and month have 1–2 digits; year has 2 digits (→ 20yy) or 4; year is 2000–2100; the calendar date must exist (31/02 rejected).
- The result is the **latest** valid date in the text, or null.
- `toDate`: an Excel date cell → that date; text → `extractCheckout(text)` (always day-first, never locale).
- All dates are calendar dates (UTC midnight) so the delay is never off by one because of timezones.

## Analysis (`lib/analyze.ts`)

For each row: checkout = rules → else AI date → else null. Invoice date = `toDate(B)`.

| Condition | Status | Delay | Note |
|---|---|---|---|
| checkout null | Không xác định | — | "Cần kiểm tra thủ công" (or the AI note) |
| invoice date null | Không xác định | — | "Ngày hóa đơn không hợp lệ" |
| invoice − checkout ≥ threshold | Cảnh báo | days | — |
| otherwise | Bình thường | days (may be ≤ 0) | — |

Method is "Quy tắc" or "AI"; confidence is 1 for rules and empty for AI.

## AI route (`app/api/ai/route.ts`)

- Request: `{ texts: string[] }`, 1–50 items, each 1–500 characters. Anything else → 400.
- `OPENAI_API_KEY` unset → 503 `{ error: "ai_disabled" }`; the client then keeps those rows as Không xác định with the note "AI chưa được bật".
- For each text, call the Responses API (`OPENAI_MODEL` env var, required when the key is set) with a **fixed server-side prompt**: "Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH." Up to 5 calls in parallel, 15 s timeout each.
- The server runs `extractCheckout` on each answer and returns only `{ results: [{ date: "YYYY-MM-DD" } | { date: null, note: string }] }`, in input order. Raw model text is never returned, so the route is useless as a general LLM proxy.
- The client sends at most one batch per upload: the first 50 unreadable rows. Rows beyond 50 get the note "Vượt giới hạn AI (50 dòng)".

**Abuse and cost controls (dashboard settings, documented in README, not code):**
- OpenAI project monthly budget (e.g. $10).
- Vercel Firewall rate-limit rule on `/api/ai`: 20 requests/minute/IP.

## Output

- **On screen:**
  - Summary tiles: Tổng hóa đơn / Bình thường / Cảnh báo / Không xác định.
  - Table with: STT, số HĐ, ngày HĐ, ngày phải lập HĐ, số ngày chậm, trạng thái (Cảnh báo in red), ghi chú.
- **Download:** `<original name>_ket_qua.xlsx`.
  - If the upload has `KET_QUA_AI` and `PHAN_TICH_AI`, they are filled in the same layout as the reference: `KET_QUA_AI` data from row 11 (A–I), summary in F6:I6, `PHAN_TICH_AI` data from row 2 (A–G). Old data rows are cleared first. Dates use the `dd/mm/yyyy` format.
  - Otherwise both sheets are created with a single header row and data below it.
  - Any VBA in an uploaded `.xlsm` is not carried over.
- **Privacy notice on the page:** "Dữ liệu được xử lý ngay trên máy của bạn. Chỉ nội dung lưu trú không đọc được mới được gửi tới AI."

## Errors

| Case | Behaviour |
|---|---|
| Not an Excel file / unreadable | "Không đọc được file Excel." |
| No `DU_LIEU_GOC` sheet | "Không tìm thấy sheet DU_LIEU_GOC. Tải file mẫu để xem định dạng." |
| No data rows | "DU_LIEU_GOC chưa có dữ liệu." |
| Over the size or row limit | Message stating the limit |
| AI route error or timeout | Affected rows stay Không xác định with a note; the rest still show |

## Testing (Vitest)

- `checkout.test.ts`: the same cases as the reference `selftest()`, plus 2-digit years, `-` and `.` separators, mixed separators rejected, and year out of range.
- `analyze.test.ts` (golden): read `fixtures/sample.xlsx` through `readInput`, run `analyze`, and expect the 9 known rows (dates, delays, statuses) and counts 9/1/8/0.
- `workbook.test.ts`: `writeResult` then re-read gives the expected cell values at `KET_QUA_AI!G11`, `H11`, `I11` and `F6:I6`.
- `route.test.ts`: validation (400 cases) and 503 without a key; OpenAI mocked, answer → date parsing.

## Deployment

- Vercel project from the Git repo; `vercel.json` sets `regions: ["sin1"]`.
- Company use requires the Vercel **Pro** plan (Hobby is non-commercial only).
- Env vars: `OPENAI_API_KEY`, `OPENAI_MODEL`. Before launch, confirm the model name exists on the account (the old template's `gpt-5.6` has not been verified).
- Local run: `npm run dev`.

## Out of scope (v1)

Login, history or storage, e-invoice XML or other export layouts, VBA in the download, end-to-end browser tests, English UI.
