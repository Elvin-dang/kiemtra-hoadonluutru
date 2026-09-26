# Kiểm tra hóa đơn lưu trú

Upload the e-invoice sales export ("XUAT HDDT BAN RA", sheet `BR_ChiTiet`) and see which hotel invoices were issued late relative to the guest's check-out date. The download is a single `KET_QUA_AI` sheet built from `public/templates/ket-qua-ai.xlsx`.

Columns are found by header name (accent-insensitive): Số hóa đơn, Ngày hóa đơn, Tên người mua (falls back to Họ tên người mua hàng), MST người mua, and Tên hàng hóa, dịch vụ as the stay description. If any is missing, the page asks the user to map columns. One output row per invoice line; warning threshold ≥ 1 day.

- Parsing and the date rules run **in the browser**; the workbook never reaches the server.
- Only stay descriptions the rules cannot read are sent to `POST /api/ai`, which asks OpenAI and returns parsed dates only.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: fill in to enable the AI fallback
npm run dev                  # http://localhost:3000
npm test
```

## Deploy (Vercel)

1. Import the Git repository into Vercel. Company use requires the **Pro** plan (Hobby is non-commercial only).
2. Set the environment variables `OPENAI_API_KEY` and `OPENAI_MODEL`. Confirm the model name exists on your OpenAI account first.
3. Functions run in `sin1` (Singapore), set in `vercel.json`.

## Cost and abuse controls (dashboard settings — do these before sharing the URL)

The site is public with no login, so cap what `/api/ai` can spend:

- **OpenAI:** use a dedicated project for this key and set a monthly budget (e.g. $10) under Project → Limits.
- **Vercel Firewall:** add a rate-limit rule for path `/api/ai`: 20 requests per minute per IP.

The route uses a fixed prompt and never returns raw model text. Its limits are ceilings set by env vars (defaults in brackets):

- `AI_MAX_TEXTS` (1000): texts per request
- `AI_MAX_TEXT_LENGTH` (500): characters per text
- `AI_MAX_CONCURRENCY` (10): parallel OpenAI calls

Each user can lower these for their own browser under **Cài đặt AI** on the page (saved in localStorage and sent with every request); the server applies `min(user setting, ceiling)`. Lowering "Số yêu cầu song song" to 1–2 is the quick fix for `AI HTTP 429` rate-limit errors. `GET /api/ai` returns the current ceilings. Users can also turn the AI fallback off entirely; the page then never calls `/api/ai`. The browser sends texts in batches of 50 so each request stays well inside the function time limit.

## Test data

`fixtures/br-chitiet.xlsx` is an anonymised copy of a real export (dates and descriptions kept exactly; names, tax codes and addresses replaced). It is the golden test input. Never commit a real export — the site is public and exports contain customer data.
