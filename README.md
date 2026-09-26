# Kiểm tra hóa đơn lưu trú

Upload the e-invoice sales export ("XUAT HDDT BAN RA", sheet `BR_ChiTiet`) and see which hotel invoices were issued late relative to the guest's check-out date. Available as a website and as a portable Windows app built from the same code.

## Layout

| Path | What |
|---|---|
| `packages/core` | Date rules, Excel read/write, analysis, table logic — all tests live here |
| `packages/ui` | The React screens, shared by both apps through a `Platform` interface |
| `apps/web` | Next.js website + `/api/ai` (deployed on Vercel) |
| `apps/desktop` | Tauri 2 Windows app (Vite + React + Rust) |

## Develop

```bash
npm install
npm test               # all workspaces
npm run dev:web        # http://localhost:3000
npm run dev:desktop    # needs Rust (https://rustup.rs)
```

Editing `packages/core/templates/ket-qua-ai.xlsx`? Run `npm run embed-template -w @kiemtra/core`; a test fails if you forget.
Adding a shadcn component: run `npx shadcn add <name>` in `packages/ui`, then change any `@/components/ui/...` imports in the new file to relative `./...` imports.

## Deploy the website (Vercel)

Set the Vercel project's **Root Directory to `apps/web`** (Settings → General). Environment variables as before: `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `AI_MAX_*`.

## Desktop app (Windows)

- **Release:** push a tag, e.g. `git tag v1.0.0 && git push origin v1.0.0`. The "Desktop (Windows)" workflow builds `kiemtra-hoadon.exe` (portable, ~10 MB) and attaches it to the GitHub Release. It can also be run by hand from the Actions tab (artifact only).
- **First run:** the app is not code-signed, so Windows SmartScreen shows "Windows protected your PC" → click **More info → Run anyway**.
- **Requirements:** Windows 10/11 with Microsoft Edge WebView2 (built into Windows 11 and up-to-date Windows 10).
- **OpenAI:** each user saves their own key in **Cài đặt AI → Khóa OpenAI API**; it is stored in Windows Credential Manager (entry `kiemtra-hoadon`). The model (default `gpt-6-luna`) is kept in `%APPDATA%\vn.kiemtra.hoadon\config.json`.
- **Opening files:** Chọn file Excel, drag a file onto the window, or drop it onto the `.exe` / a shortcut. **Lưu kết quả** saves `<name>_ket_qua.xlsx` next to the source (never overwrites — adds "(1)", "(2)", …).

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

`packages/core/fixtures/br-chitiet.xlsx` is an anonymised copy of a real export (dates and descriptions kept exactly; names, tax codes and addresses replaced). It is the golden test input. Never commit a real export — the site is public and exports contain customer data.
