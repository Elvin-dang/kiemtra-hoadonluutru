# Kiểm tra hóa đơn lưu trú — Windows desktop app design

Date: 2026-09-26 · Status: approved design, pending spec review

## Goal

A portable Windows program that does exactly what the website does: open a "XUAT HDDT BAN RA" export, show the results table, and produce the `KET_QUA_AI` workbook. It should feel like a real program (goal C), and each user keeps their own OpenAI key on their own PC (goal D). The website and the desktop app share one codebase, so a rule fix ships to both.

**Users:** colleagues on Windows 10/11 PCs. **Distribution:** one portable, unsigned `.exe` downloaded from GitHub Releases.

**Success criteria**
1. On Windows, double-clicking `kiemtra-hoadon.exe` opens the app, with no install step. On first run SmartScreen may warn, and "More info → Run anyway" works.
2. Opening `XUAT HDDT BAN RA.xlsx` gives the same results as the website: 76 rows, 40 / 8 / 28.
3. "Lưu kết quả" writes `XUAT HDDT BAN RA_ket_qua.xlsx` next to the source file, with the same `KET_QUA_AI` layout the website produces.
4. With the user's own key saved, unreadable rows go to OpenAI. The key is stored in Windows Credential Manager and never in the web view, localStorage or any file.
5. After the monorepo move, the website's behaviour and its 132 tests are unchanged.

## Repository layout (npm workspaces, one repo)

```
package.json              workspaces: ["packages/*", "apps/*"]; root scripts test / lint / build
packages/core             @kiemtra/core — pure TypeScript, no React, no DOM
  src/types.ts            (was features/invoice-check/types/invoice.ts)
  src/checkout.ts analyze.ts columns.ts workbook.ts inputError.ts aiClient.ts
  src/aiSettings.ts tableColumns.ts tableView.ts tablePrefs.ts formatDate.ts
  src/*.test.ts           all existing unit/golden tests
  fixtures/br-chitiet.xlsx
  templates/ket-qua-ai.xlsx   the output template (bundled by each app)
packages/ui               @kiemtra/ui — React components, hooks, shadcn primitives
  src/InvoiceCheck.tsx ResultsView.tsx ResultTable.tsx SummaryTiles.tsx ColumnMenu.tsx
  src/ColumnMapping.tsx AiSettingsPanel.tsx useInvoiceCheck.ts useAiSettings.ts
  src/platform.tsx        Platform type + PlatformProvider/usePlatform
  src/components/ui/*     shadcn button, card, table, alert, input, native-select, switch, popover
  src/styles.css          Tailwind v4 theme (moved from apps/web globals.css)
apps/web                  Next.js site (moved from repo root) — webPlatform, /api/ai route
apps/desktop              Tauri 2 + Vite + React — desktopPlatform, Rust in src-tauri/
```

- Existing file contents move without logic changes. Imports change to `@kiemtra/core` / `@kiemtra/ui`.
- `apps/web` keeps its route (`/api/ai`), its public assets and the icon. Next.js is given `transpilePackages: ["@kiemtra/core", "@kiemtra/ui"]`.
- **Vercel:** the project's **Root Directory must be set to `apps/web`** after this change. This is a one-time dashboard setting, and it is documented in the README.
- The `fullstack-style` conventions still apply inside each package: named exports only, no `any`.

## Platform interface (the only thing that differs per app)

```ts
export type AiAnswer =
  | { status: "ok"; results: AiResponseItem[] } // same shape /api/ai returns today
  | { status: "disabled" }                      // no key / no model configured
  | { status: "failed" };

export type Platform = {
  kind: "web" | "desktop";
  loadResultTemplate(): Promise<ArrayBuffer>;
  getAiLimits(): Promise<AiLimits>;
  askAi(texts: string[], limits: AiLimits): Promise<AiAnswer>;
  saveResult(data: ArrayBuffer, fileName: string, source: SourceFile): Promise<SaveOutcome>;
};
export type SourceFile = { name: string; path: string | null }; // path is known on desktop only
export type SaveOutcome = { savedTo: string | null };           // web: null (browser download)
```

- **`aiClient.fetchAiOutcomes`** keeps its batching (50 per call), limits and notes. Its transport changes from a `fetch` function to `platform.askAi`, which keeps the tested behaviour and swaps only how a batch is sent.
- **Web:**
  - `askAi` → `POST /api/ai`, as today: 503 → disabled, errors → failed.
  - `getAiLimits` → `GET /api/ai`.
  - `loadResultTemplate` → fetches `/templates/ket-qua-ai.xlsx`.
  - `saveResult` → the current Blob download (`saveFile`).
- **Desktop:** Tauri commands, described below.

## Desktop app (apps/desktop)

**Window:** title "Kiểm tra hóa đơn lưu trú", the same icon as the website, 1280×860 default and resizable, minimum 900×600. It is the same screen as the website, with these desktop-only differences:

| Area | Desktop behaviour |
|---|---|
| Open | **Chọn file Excel** opens the native Open dialog (filter `.xlsx`). **Drag a file onto the window** (Tauri drag-drop event). **Launch with a file**: dropping a file on the `.exe` or a shortcut passes its path as argv[1], and it opens on start. The file is read in Rust and passed as bytes. |
| Save | **Lưu kết quả** writes `<name>_ket_qua.xlsx` in the source file's folder. If that exists, it writes `<name>_ket_qua (1).xlsx`, `(2)`, …, and never overwrites. **Lưu thành…** opens the native Save dialog. After saving, the page shows "Đã lưu: <path>" with a **Mở thư mục** button that reveals the file in Explorer. |
| AI key | In Cài đặt AI: a **Khóa OpenAI API** password field with **Lưu khóa** / **Xóa khóa**. When saved, it shows "Đã lưu (••••last4)". The key is stored in Windows Credential Manager (`keyring`, service `kiemtra-hoadon`, user `openai`). Rust reads it for each call. It is never returned to the web view except as the last 4 characters. |
| AI model | A **Model** text field, default `gpt-6-luna`, saved in the app config file `%APPDATA%\\vn.kiemtra.hoadon\\config.json` (Tauri app config dir). |
| AI limits | `getAiLimits` returns local ceilings 1000 / 500 / 10, the same as the web server defaults. The user's own settings still apply within them (existing panel). |
| Privacy notice | "Dữ liệu được xử lý ngay trên máy của bạn. Chỉ nội dung lưu trú không đọc được mới được gửi tới OpenAI bằng khóa của bạn." |

**Rust commands (`src-tauri/src`)**

| Command | Contract |
|---|---|
| `read_file(path) -> bytes` | Reads `.xlsx` bytes, returned as a raw binary IPC response (`tauri::ipc::Response`) rather than a JSON number array. Errors return a Vietnamese message. |
| `startup_file() -> Option<String>` | The argv path given at launch, if it is an existing `.xlsx`. |
| `save_next_to(source_path, file_name, bytes) -> String` | Writes into the source folder using the "(n)" rule. Returns the full path written. |
| `save_as(path, bytes)` | Writes to a path chosen in the Save dialog. |
| `ai_key_status() -> Option<String>` / `set_ai_key(key)` / `delete_ai_key()` | Credential Manager access. Status returns only the last 4 characters. |
| `get_model() / set_model(model)` | Reads and writes config.json. |
| `ask_ai(texts, limits) -> AiAnswer` | No key or no model → `disabled`. Otherwise it sends one Responses API request per text: fixed prompt, `max_output_tokens: 1000`, `store: false`, 15 s timeout, at most `limits.concurrency` requests at a time. Each result is `{ date: null, note }` on error, or `{ answer: <output_text> }`. |

- `desktopPlatform.askAi` (TypeScript) converts each `{ answer }` into the web contract (`AiResponseItem`) with the shared `extractCheckout`: `{ date: "YYYY-MM-DD" }`, or `{ date: null, note: "AI không xác định được" }` when there is no date. Date logic therefore lives only in `packages/core`, and `aiClient` sees the same shape on both platforms.
- Tauri **capabilities** are minimal: the dialog (open and save), opener (reveal in folder) and the app's own commands. There is no general file-system or shell access from the web view, and no remote URLs are loaded.

## Build and release

- **Local development (macOS):** `npm run dev -w apps/desktop` (Tauri dev). This needs Rust installed via rustup, which is done once. Credential storage uses the macOS Keychain there.
- **Release:** `.github/workflows/desktop.yml` runs on `windows-latest` when a tag `v*` is pushed (or on manual dispatch):
  1. `npm ci`, then run the root tests.
  2. `cargo test` in `src-tauri`.
  3. `tauri build --no-bundle` builds the portable `kiemtra-hoadon.exe`.
  4. The `.exe` is uploaded as a workflow artifact and attached to the GitHub Release for the tag.
- **CI on every push:** web lint, tests and build. The desktop workflow runs only on tags or when dispatched manually, to save Windows runner minutes.
- **Unsigned:** the README documents the SmartScreen "More info → Run anyway" step and the WebView2 requirement (built into Windows 11 and up-to-date Windows 10).

## Testing

- **`packages/core`:** the existing 132 tests move unchanged, plus tests for `fetchAiOutcomes` against a fake `askAi` (batching, disabled, failed, notes).
- **Rust:** unit tests for the request body builder (fixed prompt, token cap, `store: false`), `output_text` extraction from a Responses payload, the "(n)" file naming, and the argv `.xlsx` check.
- **Web:** after the move, all existing tests pass, `next build` succeeds, and a manual upload of the real export still gives 76 / 40 / 8 / 28.
- **Desktop manual (macOS, `tauri dev`):**
  - Open by dialog and by drag-drop.
  - Save next to the original, including the "(1)" case, and use Mở thư mục.
  - Save a key, confirm the masked display, then remove it.
  - AI off and on.
- **Windows:** the user runs the released `.exe`. This spec cannot be verified on Windows from the development machine.

## Out of scope (v1)

Installer, auto-update, code signing, Start-menu entries, "Open with" in Explorer, a bundled WebView2 runtime, macOS/Linux releases (it runs there in dev only), and syncing settings between the website and the desktop app.
