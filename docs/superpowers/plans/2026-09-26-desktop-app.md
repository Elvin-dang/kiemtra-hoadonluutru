# Kiểm tra hóa đơn lưu trú — Windows Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the website into a monorepo (shared `@kiemtra/core` logic + `@kiemtra/ui` screens) and add a portable Tauri 2 Windows app that uses the same code, stores each user's OpenAI key in Windows Credential Manager, and saves results next to the source file.

**Architecture:** npm workspaces. `packages/core` holds all pure logic and tests. `packages/ui` holds the React screens and a `Platform` context. `apps/web` (Next.js, moved) provides a web platform (fetch `/api/ai`, browser download). `apps/desktop` (Vite + React + Tauri 2) provides a desktop platform backed by Rust commands for files, the credential store and OpenAI calls.

**Tech Stack:** Node 22, npm workspaces, TypeScript 5, React 19.2.8, Next.js 16.3.6, Vite 8.3 + @vitejs/plugin-react 6.1 + @tailwindcss/vite 4.3, Tailwind v4, shadcn base-nova, ExcelJS 4.4, Vitest 5, Tauri 2.11 (`@tauri-apps/cli` 2.11.5, `@tauri-apps/api` 2.11.1, `plugin-dialog` 2.7.3, `plugin-opener` 2.5.5), Rust stable with `tauri` 2, `keyring` 3.6.3 (`windows-native`, `apple-native`), `reqwest` 0.13 (`json`), `futures` 0.3, `@fontsource/be-vietnam-pro` 5.3, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-26-desktop-app-design.md`

**Branch:** all work on `feat/desktop` (it already holds the spec commit). Never push. The user pushes.

## Global Constraints

- The `fullstack-style` conventions apply in every package: named exports only (framework-required defaults excepted: Next `page.tsx` / `layout.tsx`, config files), no `any`, no inline `style`, only real Tailwind classes, `type` over `interface`, and `import type` for type-only imports.
- Dates are UTC midnight everywhere. Vietnamese UI copy must be verbatim as written in this plan.
- The fixed AI prompt (identical in the web route and Rust): `Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH.`, with `max_output_tokens: 1000`, `store: false` and a 15 s timeout per call.
- AI ceilings are 1000 texts / 500 characters / 10 parallel, both on web (env defaults) and on desktop (local constants). Batches of 50 are sent from `aiClient`.
- The desktop OpenAI key never reaches the web view, localStorage or any file. Only its last 4 characters are exposed.
- The desktop web view gets only the `core:default`, `dialog:allow-open`, `dialog:allow-save` and `opener:allow-reveal-item-in-dir` permissions, plus the app's own commands. No fs or shell plugin.
- Commits end with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

**Deliberate deviations from the spec (decided while planning):**
1. **Embedded template instead of `Platform.loadResultTemplate`.** The output template is embedded in `@kiemtra/core` as a generated base64 module (`resultTemplate()`), with a test that fails if it drifts from `templates/ket-qua-ai.xlsx`. Neither app has to serve or bundle an asset.
2. **Optional desktop members on `Platform`.** `Platform` gains `privacyNotice`, `pickFile`, `onExternalFile`, `saveResultAs`, `revealFile`, `aiKey` and `aiModel`. The spec's behaviour table needs these; the web omits them.
3. **`saveFile` stays in `apps/web`.** The browser Blob download is web-only.
4. **A reason on `disabled`.** `AiAnswer` `disabled` may carry a `note`, so desktop shows "Chưa lưu khóa OpenAI (Cài đặt AI)" instead of "AI chưa được bật".
5. **A note for a rejected key.** A desktop HTTP 401 gets the note "Khóa OpenAI không hợp lệ".

## Review Focus

1. **Tailwind classes in `packages/ui` not generated after the move.** The UI looks unstyled because Tailwind's auto-detection skips workspace packages. This is pinned in Task 3 by a computed-style check on the running site.
2. **Paths with spaces, Vietnamese characters or `.XLSX` upper-case**, from drag-drop or launch arguments (`C:\Hóa đơn\XUAT HDDT BAN RA.xlsx`). They must open, and saving next to them must work. Pinned in Task 6 (Rust tests).
3. **The result file already exists** (and `(1)` too). It must never be overwritten. Pinned in Task 6.
4. **A wrong or expired key (401), or a rate limit (429).** Each row gets a clear note, and the rest of the run finishes. Pinned in Task 6 (`note_for_status`) and Task 3 (`aiClient` batches).
5. **React StrictMode double-mounting in dev** opens the launch file twice. Pinned in Task 6 (take-once test).

---

## File Structure (end state)

```
package.json                     root: workspaces + scripts
.gitignore                       un-anchored patterns + Rust/Tauri ignores
.github/workflows/ci.yml         web: typecheck, test, lint, build (every push)
.github/workflows/desktop.yml    Windows portable exe (tags v*, manual)
packages/core/
  package.json tsconfig.json vitest.config.mts
  scripts/embed-template.mjs     writes src/resultTemplate.ts
  templates/ket-qua-ai.xlsx      (moved from apps/web/public/templates)
  fixtures/br-chitiet.xlsx       (moved)
  src/index.ts                   barrel (excludes workbook — separate "./workbook" entry)
  src/types.ts                   (was features/invoice-check/types/invoice.ts) + AiAnswer, AskAi
  src/{aiClient,aiSettings,analyze,checkout,columns,formatDate,inputError,
       resultTemplate,tableColumns,tablePrefs,tableView,workbook}.ts + *.test.ts
packages/ui/
  package.json tsconfig.json components.json
  src/index.ts platform.tsx styles.css
  src/{InvoiceCheck,ResultsView,ResultTable,SummaryTiles,ColumnMenu,ColumnMapping,
       AiSettingsPanel,AiKeyFields}.tsx
  src/{useInvoiceCheck,useAiSettings}.ts
  src/components/ui/*.tsx        shadcn primitives (moved)
apps/web/                        (moved Next.js app)
  package.json next.config.ts tsconfig.json vitest.config.mts vercel.json .env.example …
  src/app/{layout,page}.tsx globals.css icon.svg favicon.ico apple-icon.png
  src/app/api/ai/route.ts route.test.ts
  src/WebApp.tsx webPlatform.ts webPlatform.test.ts
  src/shared/utils/saveFile.ts saveFile.test.ts
apps/desktop/
  package.json index.html vite.config.ts tsconfig.json vitest.config.mts
  src/main.tsx main.css desktopPlatform.ts aiAnswer.ts aiAnswer.test.ts
  src-tauri/Cargo.toml build.rs tauri.conf.json capabilities/default.json icons/*
  src-tauri/src/main.rs lib.rs
```

---

### Task 1: Monorepo skeleton — move the Next.js app to `apps/web`

**Files:**
- Move: the whole current app → `apps/web/`
- Create: `package.json` (root)
- Modify: `.gitignore`, `apps/web/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: workspace `@kiemtra/web` with unchanged behaviour. Root scripts: `test`, `typecheck`, `lint`, `dev:web`, `build:web`, `dev:desktop`, `build:desktop`.

The user may have `next dev` running from the repo root (port 3003). It stops working after this move. Tell the user to restart it with `npm run dev:web`. Use port 3100 for your own checks.

- [ ] **Step 1: Move files** (on branch `feat/desktop`)

```bash
cd ~/Projects/kiemtra-hoadon-web
git checkout feat/desktop
mkdir -p apps/web
git mv src public fixtures next.config.ts eslint.config.mjs postcss.config.mjs tsconfig.json \
  components.json vitest.config.mts vercel.json .env.example AGENTS.md CLAUDE.md package.json apps/web/
git rm -q --cached package-lock.json
rm -rf node_modules package-lock.json .next next-env.d.ts
```

- [ ] **Step 2: Name the web workspace**

```bash
node -e 'const f="apps/web/package.json",p=require("./"+f);p.name="@kiemtra/web";p.version="1.0.0";require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")'
```

- [ ] **Step 3: Create the root `package.json`**

```json
{
  "name": "kiemtra-hoadonluutru",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev:web": "npm run dev -w @kiemtra/web",
    "build:web": "npm run build -w @kiemtra/web",
    "dev:desktop": "npm run dev -w @kiemtra/desktop",
    "build:desktop": "npm run build -w @kiemtra/desktop",
    "lint": "npm run lint -w @kiemtra/web",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm test --workspaces --if-present"
  }
}
```

- [ ] **Step 4: Un-anchor `.gitignore` patterns and add Rust/Tauri ignores.** create-next-app anchored them to the repo root.

```bash
sed -i '' -E 's#^/(node_modules|\.pnp|coverage|\.next/|out/|build)#\1#' .gitignore
printf '\n# Rust / Tauri\ntarget/\napps/desktop/src-tauri/gen/\napps/desktop/dist/\n' >> .gitignore
grep -nE '^(node_modules|\.next/|out/|build|coverage|target/)' .gitignore
```

Expected: the grep prints `node_modules`, `.next/`, `out/`, `build`, `coverage` and `target/` without a leading `/`.

- [ ] **Step 5: Install and verify.** Nothing inside `apps/web` changed yet.

```bash
npm install
npm test && npm run lint && npm run build:web
```

Expected: `Tests  132 passed (132)`, eslint exits 0, and `✓ Compiled successfully`. `git status --short` shows only renames, the root `package.json`, the new `package-lock.json` and `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: move the Next.js app into apps/web as an npm workspace

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `packages/core` — shared logic, tests and the embedded template

**Files:**
- Move: `apps/web/src/features/invoice-check/utils/*` and `types/invoice.ts`, `apps/web/src/shared/utils/formatDate*`, `apps/web/fixtures`, `apps/web/public/templates/ket-qua-ai.xlsx` → `packages/core/…`
- Create: `packages/core/{package.json,tsconfig.json,vitest.config.mts,scripts/embed-template.mjs,src/index.ts,src/resultTemplate.ts,src/resultTemplate.test.ts}`
- Modify: imports in `apps/web/src/**`, `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/src/features/invoice-check/hooks/useInvoiceCheck.ts`

**Interfaces:**
- Consumes: Task 1 layout
- Produces:
  - `@kiemtra/core`, which exports every module except `workbook`, plus `resultTemplate(): ArrayBuffer`
  - `@kiemtra/core/workbook` (`inspectInput`, `readRows`, `writeResult`, `normalizeCell`, `MAX_ROWS`, types `InspectedInput`, `ParsedRows`)

- [ ] **Step 1: Move the files**

```bash
cd ~/Projects/kiemtra-hoadon-web
W=apps/web/src
mkdir -p packages/core/src packages/core/templates packages/core/scripts
git mv $W/features/invoice-check/types/invoice.ts packages/core/src/types.ts
for f in aiClient aiClient.test aiSettings aiSettings.test analyze analyze.test checkout checkout.test \
  columns columns.test inputError tableColumns tablePrefs tablePrefs.test tableView tableView.test workbook workbook.test; do
  git mv $W/features/invoice-check/utils/$f.ts packages/core/src/$f.ts
done
git mv $W/shared/utils/formatDate.ts $W/shared/utils/formatDate.test.ts packages/core/src/
git mv apps/web/fixtures packages/core/fixtures
git mv apps/web/public/templates/ket-qua-ai.xlsx packages/core/templates/ket-qua-ai.xlsx
```

- [ ] **Step 2: Fix imports inside core**

```bash
cd packages/core/src
sed -i '' -e 's#"\.\./types/invoice"#"./types"#' -e 's#"@/shared/utils/formatDate"#"./formatDate"#' *.ts
sed -i '' 's#"public/templates/ket-qua-ai.xlsx"#"templates/ket-qua-ai.xlsx"#' workbook.test.ts
grep -n '"@/\|\.\./' *.ts; cd ../../..
```

Expected: the grep prints nothing.

- [ ] **Step 3: Package files**

`packages/core/package.json`:

```json
{
  "name": "@kiemtra/core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./workbook": "./src/workbook.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "embed-template": "node scripts/embed-template.mjs"
  },
  "dependencies": {
    "exceljs": "^4.4.0"
  },
  "devDependencies": {
    "@types/node": "^22.20.4",
    "typescript": "^5",
    "vitest": "^5.0.2"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`packages/core/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

- [ ] **Step 4: Write the failing template test.** Create `packages/core/src/resultTemplate.test.ts`:

```ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resultTemplate } from "./resultTemplate";

describe("resultTemplate", () => {
  it("embeds templates/ket-qua-ai.xlsx byte for byte (run `npm run embed-template -w @kiemtra/core` after editing it)", () => {
    expect(new Uint8Array(resultTemplate())).toEqual(new Uint8Array(readFileSync("templates/ket-qua-ai.xlsx")));
  });
});
```

Run: `npm install && npm test -w @kiemtra/core -- resultTemplate`
Expected: FAIL with `Cannot find module './resultTemplate'`.

- [ ] **Step 5: Generator script and generated module.** Create `packages/core/scripts/embed-template.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";

const base64 = readFileSync(new URL("../templates/ket-qua-ai.xlsx", import.meta.url)).toString("base64");

const source = `// Generated by scripts/embed-template.mjs from templates/ket-qua-ai.xlsx — do not edit by hand.
const RESULT_TEMPLATE_BASE64 =
  "${base64}";

// The one-sheet KET_QUA_AI template, embedded so both apps work without serving or bundling a file.
export function resultTemplate(): ArrayBuffer {
  const binary = atob(RESULT_TEMPLATE_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
`;

writeFileSync(new URL("../src/resultTemplate.ts", import.meta.url), source);
```

Run: `npm run embed-template -w @kiemtra/core && npm test -w @kiemtra/core -- resultTemplate`
Expected: PASS (1 test).

- [ ] **Step 6: Barrel.** Create `packages/core/src/index.ts`:

```ts
// Public API of @kiemtra/core. The ExcelJS-based workbook module is a separate entry
// ("@kiemtra/core/workbook") so importing the core never pulls ExcelJS into a main bundle.
export * from "./types";
export * from "./aiClient";
export * from "./aiSettings";
export * from "./analyze";
export * from "./checkout";
export * from "./columns";
export * from "./formatDate";
export * from "./inputError";
export * from "./resultTemplate";
export * from "./tableColumns";
export * from "./tablePrefs";
export * from "./tableView";
```

- [ ] **Step 7: Point the web app at core**

```bash
cd apps/web/src
grep -rlE '\.\./utils/|\.\./types/invoice|@/shared/utils/formatDate|@/features/invoice-check/(utils|types)' . \
 | xargs sed -i '' -E \
  -e 's#"\.\./utils/(aiClient|aiSettings|analyze|checkout|columns|inputError|tableColumns|tablePrefs|tableView)"#"@kiemtra/core"#' \
  -e 's#"\.\./types/invoice"#"@kiemtra/core"#' \
  -e 's#"@/shared/utils/formatDate"#"@kiemtra/core"#' \
  -e 's#"@/features/invoice-check/(utils/checkout|types/invoice)"#"@kiemtra/core"#' \
  -e 's#import\("\.\./utils/workbook"\)#import("@kiemtra/core/workbook")#'
cd ../../..
grep -rnE '\.\./utils/|\.\./types/|@/features/invoice-check/(utils|types)|formatDate"' apps/web/src
```

Expected: the grep prints nothing. Several files now have more than one `import … from "@kiemtra/core"` line. That is valid, and Task 3 rewrites those files anyway.

In `apps/web/src/features/invoice-check/hooks/useInvoiceCheck.ts`, replace the fetched template with the embedded one:
- delete the `RESULT_TEMPLATE_URL` constant and the `loadResultTemplate` function;
- add `resultTemplate` to an `import { … } from "@kiemtra/core";` line;
- change `writeResult(await loadResultTemplate(), analysis, fileName)` to `writeResult(resultTemplate(), analysis, fileName)`.

`apps/web/package.json`: add `"@kiemtra/core": "*"` to `dependencies` (keep `exceljs` for now).

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ["@kiemtra/core"],
};

export default nextConfig;
```

- [ ] **Step 8: Verify**

```bash
npm install
npm run typecheck && npm test && npm run lint && npm run build:web
```

Expected: typecheck for core exits 0; tests total **133** — core **114** (113 moved + 1 template test), web **19** (`route.test.ts` 18, `saveFile.test.ts` 1); lint and build succeed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract shared logic into @kiemtra/core and embed the result template

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `packages/ui` + `Platform` + AI transport — the website on the shared UI

**Files:**
- Move: `apps/web/src/features/invoice-check/components/*.tsx`, `hooks/*.ts`, `apps/web/src/shared/components/ui/`, `apps/web/src/app/globals.css`, `apps/web/components.json` → `packages/ui/…`
- Create: `packages/ui/{package.json,tsconfig.json,src/index.ts,src/platform.tsx}`, `apps/web/src/{WebApp.tsx,webPlatform.ts,webPlatform.test.ts}`, `apps/web/src/app/globals.css` (new, one import)
- Modify: `packages/core/src/{types.ts,aiClient.ts,aiClient.test.ts}`, `packages/ui/src/{useInvoiceCheck.ts,useAiSettings.ts,InvoiceCheck.tsx,styles.css,components.json}`, `apps/web/src/app/page.tsx`, `apps/web/package.json`, `apps/web/next.config.ts`

**Interfaces:**
- Consumes: `@kiemtra/core`, `@kiemtra/core/workbook` (Task 2)
- Produces:
  - core: `type AiAnswer = { status: "ok"; results: AiResponseItem[] } | { status: "disabled"; note?: string } | { status: "failed" }`, `type AskAi = (texts: string[], limits: AiLimits) => Promise<AiAnswer>`, `fetchAiOutcomes(texts: string[], settings: AiSettings, askAi: AskAi): Promise<AiOutcome[]>`
  - ui: `type SourceFile = { name: string; path: string | null; data: ArrayBuffer }`, `type SaveOutcome = { savedTo: string | null }`, `type Platform = { kind: "web" | "desktop"; privacyNotice: string; askAi: AskAi; getAiLimits(): Promise<AiLimits>; saveResult(data: ArrayBuffer, fileName: string, source: Pick<SourceFile, "name" | "path">): Promise<SaveOutcome> }`, `PlatformProvider`, `usePlatform()`, `InvoiceCheck`
  - web: `askAiRoute(texts, limits, fetchFn?)`, `fetchAiLimits(fetchFn?)`, `webPlatform`

- [ ] **Step 1: Write the failing `aiClient` tests.** Replace `packages/core/src/aiClient.test.ts` entirely:

```ts
import { describe, expect, it, vi } from "vitest";

import { fetchAiOutcomes } from "./aiClient";
import { DEFAULT_AI_SETTINGS } from "./aiSettings";

import type { AiAnswer, AskAi } from "./types";

const MAY_2 = new Date(Date.UTC(2025, 4, 2));
const ok = (texts: string[]): AiAnswer => ({ status: "ok", results: texts.map(() => ({ date: "2025-05-02" })) });
const WIDE = { ...DEFAULT_AI_SETTINGS, maxTexts: 1000, concurrency: 10 };

describe("fetchAiOutcomes", () => {
  it("sends texts in batches of 50, in order, truncated, with the numeric limits", async () => {
    const askAi = vi.fn<AskAi>(async (texts) => ok(texts));
    const texts = Array.from({ length: 120 }, (_, i) => (i === 0 ? "y".repeat(600) : `t${i}`));

    const outcomes = await fetchAiOutcomes(texts, WIDE, askAi);

    expect(askAi.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
    expect(askAi.mock.calls[0][0][0]).toHaveLength(500);
    expect(askAi.mock.calls[1][0][0]).toBe("t50");
    expect(askAi.mock.calls[0][1]).toEqual({ maxTexts: 1000, maxTextLength: 500, concurrency: 10 });
    expect(outcomes).toHaveLength(120);
    expect(outcomes[119]).toEqual({ date: MAY_2 });
  });

  it("marks rows beyond maxTexts without sending them", async () => {
    const askAi = vi.fn<AskAi>(async (texts) => ok(texts));
    const outcomes = await fetchAiOutcomes(["a", "b", "c"], { ...DEFAULT_AI_SETTINGS, maxTexts: 2 }, askAi);
    expect(askAi.mock.calls[0][0]).toEqual(["a", "b"]);
    expect(outcomes[2]).toEqual({ date: null, note: "Vượt giới hạn AI (2 dòng)" });
  });

  it("passes per-text notes through", async () => {
    const askAi = vi.fn<AskAi>(async () => ({ status: "ok", results: [{ date: null, note: "AI không xác định được" }] }));
    expect(await fetchAiOutcomes(["a"], WIDE, askAi)).toEqual([{ date: null, note: "AI không xác định được" }]);
  });

  it("keeps the other batches when one batch fails", async () => {
    const askAi = vi.fn<AskAi>(async (texts) => (texts[0] === "t50" ? { status: "failed" } : ok(texts)));
    const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const outcomes = await fetchAiOutcomes(texts, WIDE, askAi);
    expect(outcomes[49]).toEqual({ date: MAY_2 });
    expect(outcomes[50]).toEqual({ date: null, note: "Không gọi được AI" });
    expect(outcomes[99]).toEqual({ date: null, note: "Không gọi được AI" });
    expect(outcomes[100]).toEqual({ date: MAY_2 });
  });

  it("uses the platform's reason when AI is disabled, or a default", async () => {
    const withNote = vi.fn<AskAi>(async () => ({ status: "disabled", note: "Chưa lưu khóa OpenAI (Cài đặt AI)" }));
    expect(await fetchAiOutcomes(["a"], WIDE, withNote)).toEqual([{ date: null, note: "Chưa lưu khóa OpenAI (Cài đặt AI)" }]);
    const plain = vi.fn<AskAi>(async () => ({ status: "disabled" }));
    expect(await fetchAiOutcomes(["a"], WIDE, plain)).toEqual([{ date: null, note: "AI chưa được bật" }]);
  });

  it("treats a thrown error or a wrong-length answer as a failure", async () => {
    const throwing = vi.fn<AskAi>(async () => {
      throw new Error("offline");
    });
    expect(await fetchAiOutcomes(["a"], WIDE, throwing)).toEqual([{ date: null, note: "Không gọi được AI" }]);
    const short = vi.fn<AskAi>(async () => ({ status: "ok", results: [] }));
    expect(await fetchAiOutcomes(["a"], WIDE, short)).toEqual([{ date: null, note: "Không gọi được AI" }]);
  });

  it("never calls the platform when AI is turned off or there is nothing to ask", async () => {
    const askAi = vi.fn<AskAi>();
    expect(await fetchAiOutcomes(["a"], { ...WIDE, isEnabled: false }, askAi)).toEqual([
      { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" },
    ]);
    expect(await fetchAiOutcomes([], WIDE, askAi)).toEqual([]);
    expect(askAi).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -w @kiemtra/core -- aiClient`
Expected: FAIL (`AskAi` / `AiAnswer` not exported, and `fetchAiOutcomes` still calls `fetch`).

- [ ] **Step 2: Implement the transport in core.** Append to `packages/core/src/types.ts`:

```ts

// What a platform answers for one batch of texts sent to AI.
export type AiAnswer =
  | { status: "ok"; results: AiResponseItem[] }
  | { status: "disabled"; note?: string }
  | { status: "failed" };

// Sends one batch (≤ 50 texts) to AI: the web posts to /api/ai, the desktop calls Rust.
export type AskAi = (texts: string[], limits: AiLimits) => Promise<AiAnswer>;
```

Replace `packages/core/src/aiClient.ts` entirely:

```ts
import { fromIsoDate } from "./checkout";

import type { AiLimits, AiOutcome, AiResponseItem, AiSettings, AskAi } from "./types";

const DISABLED_NOTE = "AI chưa được bật";
const FAILED: AiOutcome = { date: null, note: "Không gọi được AI" };
const TURNED_OFF: AiOutcome = { date: null, note: "Cần kiểm tra thủ công (AI đang tắt)" };
// Keeps each request well inside a server function's time limit, whatever the user's total.
const BATCH_SIZE = 50;

function toOutcome(item: AiResponseItem | undefined): AiOutcome {
  if (!item) return FAILED;
  if (item.date === null) return { date: null, note: item.note };
  const date = fromIsoDate(item.date);
  return date ? { date } : FAILED;
}

async function askBatch(texts: string[], limits: AiLimits, askAi: AskAi): Promise<AiOutcome[]> {
  const failAll = () => texts.map(() => FAILED);
  try {
    const answer = await askAi(texts, limits);
    if (answer.status === "disabled") {
      const outcome: AiOutcome = { date: null, note: answer.note ?? DISABLED_NOTE };
      return texts.map(() => outcome);
    }
    if (answer.status === "failed" || answer.results.length !== texts.length) return failAll();
    return answer.results.map(toOutcome);
  } catch {
    return failAll();
  }
}

export async function fetchAiOutcomes(texts: string[], settings: AiSettings, askAi: AskAi): Promise<AiOutcome[]> {
  if (texts.length === 0) return [];
  if (!settings.isEnabled) return texts.map(() => TURNED_OFF);

  const { maxTexts, maxTextLength, concurrency } = settings;
  const limits: AiLimits = { maxTexts, maxTextLength, concurrency };
  const toSend = texts.slice(0, maxTexts).map((text) => text.slice(0, maxTextLength));
  const answered: AiOutcome[] = [];
  for (let start = 0; start < toSend.length; start += BATCH_SIZE) {
    answered.push(...(await askBatch(toSend.slice(start, start + BATCH_SIZE), limits, askAi)));
  }
  const overLimit: AiOutcome = { date: null, note: `Vượt giới hạn AI (${maxTexts} dòng)` };
  return [...answered, ...texts.slice(maxTexts).map(() => overLimit)];
}
```

Run: `npm test -w @kiemtra/core -- aiClient`
Expected: PASS (7 tests).

- [ ] **Step 3: Write the failing `webPlatform` tests.** Create `apps/web/src/webPlatform.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { askAiRoute, fetchAiLimits } from "./webPlatform";

const LIMITS = { maxTexts: 50, maxTextLength: 500, concurrency: 5 };

describe("askAiRoute", () => {
  it("posts the texts and the user's limits to /api/ai and returns its results", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ results: [{ date: "2025-05-02" }] }));
    expect(await askAiRoute(["a"], LIMITS, fetchFn)).toEqual({ status: "ok", results: [{ date: "2025-05-02" }] });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ texts: ["a"], settings: LIMITS });
  });

  it("maps 503 to disabled and other errors or malformed replies to failed", async () => {
    expect(await askAiRoute(["a"], LIMITS, vi.fn<typeof fetch>(async () => new Response("", { status: 503 })))).toEqual({
      status: "disabled",
    });
    expect(await askAiRoute(["a"], LIMITS, vi.fn<typeof fetch>(async () => new Response("", { status: 500 })))).toEqual({
      status: "failed",
    });
    expect(await askAiRoute(["a"], LIMITS, vi.fn<typeof fetch>(async () => Response.json({ nope: 1 })))).toEqual({
      status: "failed",
    });
  });
});

describe("fetchAiLimits", () => {
  it("reads the server ceilings", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ limits: LIMITS }));
    expect(await fetchAiLimits(fetchFn)).toEqual(LIMITS);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/ai");
  });

  it("throws when the server does not answer, so the page keeps its defaults", async () => {
    await expect(fetchAiLimits(vi.fn<typeof fetch>(async () => new Response("", { status: 500 })))).rejects.toThrow();
  });
});
```

Run: `npm test -w @kiemtra/web -- webPlatform`
Expected: FAIL with `Cannot find module './webPlatform'`.

- [ ] **Step 4: Move the UI files into `packages/ui`**

```bash
cd ~/Projects/kiemtra-hoadon-web
F=apps/web/src/features/invoice-check
mkdir -p packages/ui/src/components
git mv apps/web/src/shared/components/ui packages/ui/src/components/ui
for f in AiSettingsPanel ColumnMapping ColumnMenu InvoiceCheck ResultsView ResultTable SummaryTiles; do git mv $F/components/$f.tsx packages/ui/src/$f.tsx; done
git mv $F/hooks/useAiSettings.ts $F/hooks/useInvoiceCheck.ts packages/ui/src/
git mv apps/web/src/app/globals.css packages/ui/src/styles.css
git mv apps/web/components.json packages/ui/components.json
git rm -q $F/index.ts
cd packages/ui/src
sed -i '' -E -e 's#"@/shared/components/ui/#"./components/ui/#' -e 's#"\.\./hooks/#"./#' *.ts *.tsx
grep -n '"@/\|\.\./' *.ts *.tsx; cd ../../..
```

Expected: the grep prints nothing. `apps/web/src/features` no longer exists.

- [ ] **Step 5: `packages/ui` package files**

`packages/ui/package.json`:

```json
{
  "name": "@kiemtra/ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles.css": "./src/styles.css"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@base-ui/react": "^1.8.0",
    "@kiemtra/core": "*",
    "class-variance-authority": "^0.7.1",
    "cn": "^0.4.0",
    "exceljs": "^4.4.0",
    "lucide-react": "^1.48.0",
    "shadcn": "^4.21.0",
    "tw-animate-css": "^1.4.0"
  },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5"
  }
}
```

`packages/ui/tsconfig.json` (the `@/*` path exists only so the shadcn CLI can add components):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

In `packages/ui/components.json`, set `"tailwind": { …, "css": "src/styles.css" }` and replace `"aliases"` with:

```json
"aliases": {
  "components": "@/components",
  "ui": "@/components/ui",
  "utils": "@/lib/utils",
  "lib": "@/lib",
  "hooks": "@/hooks"
}
```

In `packages/ui/src/styles.css`, add this line directly after the three `@import` lines. Tailwind's automatic source detection skips workspace packages under `node_modules`, so the UI's classes would otherwise never be generated:

```css
@source "./";
```

- [ ] **Step 6: The Platform context.** Create `packages/ui/src/platform.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";

import type { AiLimits, AskAi } from "@kiemtra/core";
import type { ReactNode } from "react";

export type SourceFile = { name: string; path: string | null; data: ArrayBuffer };
export type SaveOutcome = { savedTo: string | null };

// Everything the shared screens need from the app they run in (web or desktop).
export type Platform = {
  kind: "web" | "desktop";
  privacyNotice: string;
  askAi: AskAi;
  getAiLimits: () => Promise<AiLimits>;
  saveResult: (data: ArrayBuffer, fileName: string, source: Pick<SourceFile, "name" | "path">) => Promise<SaveOutcome>;
};

const PlatformContext = createContext<Platform | null>(null);

export function PlatformProvider({ platform, children }: { platform: Platform; children: ReactNode }) {
  return <PlatformContext value={platform}>{children}</PlatformContext>;
}

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error("usePlatform must be used inside <PlatformProvider>");
  return platform;
}
```

`packages/ui/src/index.ts`:

```ts
export { InvoiceCheck } from "./InvoiceCheck";
export { PlatformProvider, usePlatform } from "./platform";
export type { Platform, SaveOutcome, SourceFile } from "./platform";
```

- [ ] **Step 7: Hooks use the platform.** Replace `packages/ui/src/useAiSettings.ts` entirely:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_AI_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from "@kiemtra/core";

import { usePlatform } from "./platform";

import type { AiLimits, AiSettings } from "@kiemtra/core";

const NO_LIMIT: AiLimits = {
  maxTexts: Number.MAX_SAFE_INTEGER,
  maxTextLength: Number.MAX_SAFE_INTEGER,
  concurrency: Number.MAX_SAFE_INTEGER,
};

function numericLimits({ maxTexts, maxTextLength, concurrency }: AiLimits): AiLimits {
  return { maxTexts, maxTextLength, concurrency };
}

export function useAiSettings() {
  const platform = usePlatform();
  const [limits, setLimits] = useState<AiLimits>(() => numericLimits(DEFAULT_AI_SETTINGS));
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  // localStorage is read after mount (not during render) so server and client HTML match.
  useEffect(() => {
    let isActive = true;
    void platform
      .getAiLimits()
      .then((raw) => numericLimits(sanitizeSettings(raw, NO_LIMIT)))
      .catch(() => numericLimits(DEFAULT_AI_SETTINGS))
      .then((platformLimits) => {
        if (!isActive) return;
        setLimits(platformLimits);
        setSettings(loadSettings(platformLimits));
      });
    return () => {
      isActive = false;
    };
  }, [platform]);

  const updateSettings = useCallback(
    (next: AiSettings) => {
      const clean = sanitizeSettings(next, limits);
      setSettings(clean);
      saveSettings(clean);
    },
    [limits],
  );

  // Reset restores the numbers but keeps the on/off choice.
  const resetSettings = useCallback(
    () => updateSettings({ ...sanitizeSettings(null, limits), isEnabled: settings.isEnabled }),
    [limits, settings.isEnabled, updateSettings],
  );

  return { settings, limits, updateSettings, resetSettings };
}
```

Replace `packages/ui/src/useInvoiceCheck.ts` entirely:

```ts
"use client";

import { useCallback, useState } from "react";

import { analyze, fetchAiOutcomes, InputError, needsAi, resultTemplate } from "@kiemtra/core";

import { usePlatform } from "./platform";

import type { AiSettings, AnalysisResult, ColumnMapping, InputErrorCode, SheetColumn } from "@kiemtra/core";
import type ExcelJS from "exceljs";
import type { SourceFile } from "./platform";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ERROR_MESSAGES: Record<InputErrorCode | "too_large" | "unexpected", string> = {
  unreadable: "Không đọc được file Excel.",
  no_sheet: "File không có sheet dữ liệu.",
  no_rows: "File chưa có dòng hóa đơn nào.",
  too_many_rows: "File có quá 5.000 dòng dữ liệu.",
  too_large: "File vượt quá 10 MB.",
  unexpected: "Đã xảy ra lỗi khi xử lý file.",
};

type SourceRef = Pick<SourceFile, "name" | "path">;

export type CheckState =
  | { phase: "idle" }
  | { phase: "processing"; fileName: string }
  | { phase: "mapping"; source: SourceRef; workbook: ExcelJS.Workbook; columns: SheetColumn[]; mapping: ColumnMapping }
  | { phase: "done"; runId: number; source: SourceRef; analysis: AnalysisResult; output: ArrayBuffer }
  | { phase: "error"; message: string };

export function outputFileName(fileName: string): string {
  return `${fileName.replace(/\.(xlsx|xlsm)$/i, "")}_ket_qua.xlsx`;
}

function errorMessage(error: unknown): string {
  return error instanceof InputError ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES.unexpected;
}

export function useInvoiceCheck(aiSettings: AiSettings) {
  const platform = usePlatform();
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const runAnalysis = useCallback(
    async (source: SourceRef, workbook: ExcelJS.Workbook, mapping: ColumnMapping) => {
      setState({ phase: "processing", fileName: source.name });
      setSavedTo(null);
      setSaveError(null);
      try {
        const { readRows, writeResult } = await import("@kiemtra/core/workbook");
        const input = readRows(workbook, mapping);
        const aiIndices = needsAi(input.rows);
        const outcomes = await fetchAiOutcomes(
          aiIndices.map((index) => input.rows[index].info),
          aiSettings,
          platform.askAi,
        );
        const ai = new Map(aiIndices.map((rowIndex, k) => [rowIndex, outcomes[k]]));
        const analysis = analyze(input.rows, input.threshold, ai);
        const output = await writeResult(resultTemplate(), analysis, source.name);
        setState({ phase: "done", runId: Date.now(), source, analysis, output });
      } catch (error) {
        setState({ phase: "error", message: errorMessage(error) });
      }
    },
    [aiSettings, platform],
  );

  const handleFile = useCallback(
    async (file: SourceFile) => {
      if (file.data.byteLength > MAX_FILE_BYTES) {
        setState({ phase: "error", message: ERROR_MESSAGES.too_large });
        return;
      }
      const source: SourceRef = { name: file.name, path: file.path };
      setState({ phase: "processing", fileName: file.name });
      try {
        const { inspectInput } = await import("@kiemtra/core/workbook");
        const inspected = await inspectInput(file.data);
        if (inspected.isComplete) {
          await runAnalysis(source, inspected.workbook, inspected.mapping);
          return;
        }
        const { workbook, columns, mapping } = inspected;
        setState({ phase: "mapping", source, workbook, columns, mapping });
      } catch (error) {
        setState({ phase: "error", message: errorMessage(error) });
      }
    },
    [runAnalysis],
  );

  const handleConfirmMapping = useCallback(
    (mapping: ColumnMapping) => {
      if (state.phase !== "mapping") return;
      void runAnalysis(state.source, state.workbook, mapping);
    },
    [state, runAnalysis],
  );

  const handleCancel = useCallback(() => setState({ phase: "idle" }), []);

  const handleSave = useCallback(async () => {
    if (state.phase !== "done") return;
    try {
      const outcome = await platform.saveResult(state.output, outputFileName(state.source.name), state.source);
      setSavedTo(outcome.savedTo);
      setSaveError(null);
    } catch (error) {
      setSaveError(`Không lưu được file: ${String(error)}`);
    }
  }, [state, platform]);

  return { state, savedTo, saveError, handleFile, handleConfirmMapping, handleCancel, handleSave };
}
```

- [ ] **Step 8: `InvoiceCheck` uses the platform.** Replace `packages/ui/src/InvoiceCheck.tsx` entirely:

```tsx
"use client";

import { AiSettingsPanel } from "./AiSettingsPanel";
import { ColumnMapping } from "./ColumnMapping";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { usePlatform } from "./platform";
import { ResultsView } from "./ResultsView";
import { useAiSettings } from "./useAiSettings";
import { useInvoiceCheck } from "./useInvoiceCheck";

import type { ChangeEvent } from "react";

export function InvoiceCheck() {
  const platform = usePlatform();
  const ai = useAiSettings();
  const { state, savedTo, saveError, handleFile, handleConfirmMapping, handleCancel, handleSave } = useInvoiceCheck(
    ai.settings,
  );
  const isProcessing = state.phase === "processing";

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (file) await handleFile({ name: file.name, path: null, data: await file.arrayBuffer() });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Kiểm tra thời điểm lập hóa đơn lưu trú</h1>
        <p className="text-muted-foreground">
          Tải lên file Excel xuất hóa đơn điện tử bán ra. Hệ thống tìm ngày check-out và cảnh báo hóa đơn lập trễ.
        </p>
        <p className="text-sm text-muted-foreground">{platform.privacyNotice}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="file"
          accept=".xlsx,.xlsm"
          aria-label="Chọn file Excel"
          className="max-w-sm"
          disabled={isProcessing}
          onChange={(event) => void handleChange(event)}
        />
        {state.phase === "done" && (
          <Button onClick={() => void handleSave()}>{platform.kind === "desktop" ? "Lưu kết quả" : "Tải kết quả"}</Button>
        )}
      </div>

      {savedTo && <p className="text-sm text-green-700">Đã lưu: {savedTo}</p>}
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <AiSettingsPanel
        settings={ai.settings}
        limits={ai.limits}
        onChange={ai.updateSettings}
        onReset={ai.resetSettings}
      />

      {isProcessing && <p className="text-muted-foreground">Đang xử lý…</p>}

      {state.phase === "mapping" && (
        <ColumnMapping
          key={state.source.name}
          fileName={state.source.name}
          columns={state.columns}
          initialMapping={state.mapping}
          onConfirm={handleConfirmMapping}
          onCancel={handleCancel}
        />
      )}

      {state.phase === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.phase === "done" && <ResultsView key={state.runId} analysis={state.analysis} />}
    </main>
  );
}
```

Check the other moved components for leftover `@kiemtra/core`-worthy imports (Task 2 already rewrote them). They must now import `"./components/ui/…"` and `"@kiemtra/core"` only: `grep -n 'import' packages/ui/src/*.tsx | grep -v '"\./\|@kiemtra/core\|react\|lucide-react\|cn"'` prints nothing.

- [ ] **Step 9: The web platform and page.** Create `apps/web/src/webPlatform.ts`:

```ts
import { saveFile } from "@/shared/utils/saveFile";

import type { AiAnswer, AiLimits, AiResponseItem } from "@kiemtra/core";
import type { Platform } from "@kiemtra/ui";

const AI_ROUTE = "/api/ai";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function askAiRoute(texts: string[], limits: AiLimits, fetchFn: typeof fetch = fetch): Promise<AiAnswer> {
  const response = await fetchFn(AI_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, settings: limits }),
  });
  if (response.status === 503) return { status: "disabled" };
  if (!response.ok) return { status: "failed" };
  const { results } = (await response.json()) as { results?: AiResponseItem[] };
  return Array.isArray(results) ? { status: "ok", results } : { status: "failed" };
}

export async function fetchAiLimits(fetchFn: typeof fetch = fetch): Promise<AiLimits> {
  const response = await fetchFn(AI_ROUTE);
  if (!response.ok) throw new Error(`GET ${AI_ROUTE}: HTTP ${response.status}`);
  const { limits } = (await response.json()) as { limits: AiLimits };
  return limits;
}

export const webPlatform: Platform = {
  kind: "web",
  privacyNotice: "Dữ liệu được xử lý ngay trên máy của bạn. Chỉ nội dung lưu trú không đọc được mới được gửi tới AI.",
  askAi: (texts, limits) => askAiRoute(texts, limits),
  getAiLimits: () => fetchAiLimits(),
  saveResult: async (data, fileName) => {
    saveFile(data, fileName, XLSX_MIME);
    return { savedTo: null };
  },
};
```

Create `apps/web/src/WebApp.tsx`:

```tsx
"use client";

import { InvoiceCheck, PlatformProvider } from "@kiemtra/ui";

import { webPlatform } from "./webPlatform";

export function WebApp() {
  return (
    <PlatformProvider platform={webPlatform}>
      <InvoiceCheck />
    </PlatformProvider>
  );
}
```

Replace `apps/web/src/app/page.tsx` (default export required by Next.js):

```tsx
import { WebApp } from "@/WebApp";

export default function Page() {
  return <WebApp />;
}
```

Create `apps/web/src/app/globals.css`:

```css
@import "@kiemtra/ui/styles.css";
```

`apps/web/next.config.ts`: `transpilePackages: ["@kiemtra/core", "@kiemtra/ui"]`.

`apps/web/package.json`:
- In `dependencies`, keep `next`, `react`, `react-dom`, `@kiemtra/core` and add `"@kiemtra/ui": "*"`.
- Remove `@base-ui/react`, `class-variance-authority`, `cn`, `exceljs`, `lucide-react`, `shadcn` and `tw-animate-css` (they are now `@kiemtra/ui` / `@kiemtra/core` dependencies).
- Add `"typecheck": "tsc --noEmit"` to `scripts`.

- [ ] **Step 10: Verify the automated checks**

```bash
npm install
npm run typecheck && npm test && npm run lint && npm run build:web
```

Expected: typecheck exits 0 for all three workspaces; tests total **136** — core **113** (aiClient 8 → 7), web **23** (19 + 4 `webPlatform`); lint and build succeed.

- [ ] **Step 11: Manual check (Review Focus 1)**

Run `npm run dev -w @kiemtra/web -- --port 3100` and open `http://localhost:3100` in a browser (Playwright):
1. Upload `~/Downloads/XUAT HDDT BAN RA.xlsx`. The tiles must read **76 / 40 / 8 / 28**.
2. Styling survived the move: `getComputedStyle` of a Cảnh báo `<tr>` must have a non-transparent `backgroundColor` (the `bg-red-50` class), and the "Cột (…)" button must have a visible border. If either is missing, the `@source` line from Step 5 is wrong.
3. Click **Tải kết quả**. `XUAT HDDT BAN RA_ket_qua.xlsx` downloads and has the single `KET_QUA_AI` sheet.
4. "Cài đặt AI" shows "Từ 1 đến 1000".

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: move the screens into @kiemtra/ui behind a Platform interface

The website now provides webPlatform (/api/ai, browser download); aiClient
sends batches through platform.askAi instead of fetch.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Desktop capabilities in the shared UI (inactive on the web)

**Files:**
- Modify: `packages/ui/src/{platform.tsx,useInvoiceCheck.ts,InvoiceCheck.tsx,AiSettingsPanel.tsx}`
- Create: `packages/ui/src/AiKeyFields.tsx`

**Interfaces:**
- Consumes: Task 3 `Platform`, `useInvoiceCheck`
- Produces: optional members on `Platform`:
  ```ts
  pickFile?: () => Promise<SourceFile | null>;
  onExternalFile?: (handler: (file: SourceFile) => void) => () => void;
  saveResultAs?: (data: ArrayBuffer, fileName: string) => Promise<SaveOutcome>;
  revealFile?: (path: string) => Promise<void>;
  aiKey?: { status: () => Promise<string | null>; save: (key: string) => Promise<string | null>; remove: () => Promise<void> };
  aiModel?: { get: () => Promise<string>; set: (model: string) => Promise<void> };
  ```
  and `useInvoiceCheck(...).handleSaveAs`.

The web platform defines none of these, so the website is unchanged. The code is exercised in Task 7.

- [ ] **Step 1: Extend `Platform`.** In `packages/ui/src/platform.tsx`, add inside the `Platform` type after `saveResult`:

```ts
  // Desktop-only capabilities; the web leaves them undefined.
  pickFile?: () => Promise<SourceFile | null>;
  onExternalFile?: (handler: (file: SourceFile) => void) => () => void;
  saveResultAs?: (data: ArrayBuffer, fileName: string) => Promise<SaveOutcome>;
  revealFile?: (path: string) => Promise<void>;
  aiKey?: {
    status: () => Promise<string | null>;
    save: (key: string) => Promise<string | null>;
    remove: () => Promise<void>;
  };
  aiModel?: { get: () => Promise<string>; set: (model: string) => Promise<void> };
```

- [ ] **Step 2: `handleSaveAs` in the hook.** In `packages/ui/src/useInvoiceCheck.ts`, add after `handleSave`:

```ts
  const handleSaveAs = useCallback(async () => {
    if (state.phase !== "done" || !platform.saveResultAs) return;
    try {
      const outcome = await platform.saveResultAs(state.output, outputFileName(state.source.name));
      if (outcome.savedTo) setSavedTo(outcome.savedTo);
      setSaveError(null);
    } catch (error) {
      setSaveError(`Không lưu được file: ${String(error)}`);
    }
  }, [state, platform]);
```

Then change the return to `return { state, savedTo, saveError, handleFile, handleConfirmMapping, handleCancel, handleSave, handleSaveAs };`.

- [ ] **Step 3: `AiKeyFields`.** Create `packages/ui/src/AiKeyFields.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { usePlatform } from "./platform";

const DEFAULT_MODEL_HINT = "Mặc định: gpt-6-luna";

// Desktop only: the user's own OpenAI key (kept by the OS credential store) and model.
export function AiKeyFields() {
  const { aiKey, aiModel } = usePlatform();
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [model, setModel] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    void aiKey?.status().then((status) => {
      if (isActive) setKeyStatus(status);
    });
    void aiModel?.get().then((current) => {
      if (isActive) setModel(current);
    });
    return () => {
      isActive = false;
    };
  }, [aiKey, aiModel]);

  if (!aiKey && !aiModel) return null;

  const handleSaveKey = async () => {
    if (!aiKey || !draftKey.trim()) return;
    try {
      setKeyStatus(await aiKey.save(draftKey.trim()));
      setDraftKey("");
      setMessage(null);
    } catch (error) {
      setMessage(`Không lưu được khóa: ${String(error)}`);
    }
  };

  const handleRemoveKey = async () => {
    if (!aiKey) return;
    await aiKey.remove();
    setKeyStatus(null);
  };

  const handleSaveModel = async () => {
    if (aiModel && model.trim()) await aiModel.set(model.trim());
  };

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {aiKey && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Khóa OpenAI API</span>
          {keyStatus ? (
            <div className="flex items-center gap-2">
              <span className="text-green-700">Đã lưu (••••{keyStatus})</span>
              <Button variant="outline" size="sm" onClick={() => void handleRemoveKey()}>
                Xóa khóa
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground">Chưa có khóa — AI sẽ không được dùng.</span>
          )}
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              aria-label="Khóa OpenAI API"
              placeholder="sk-…"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
            />
            <Button disabled={!draftKey.trim()} onClick={() => void handleSaveKey()}>
              Lưu khóa
            </Button>
          </div>
          <span className="text-muted-foreground">Khóa được lưu an toàn trong Windows (Credential Manager).</span>
          {message && <span className="text-red-600">{message}</span>}
        </div>
      )}
      {aiModel && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Model</span>
          <Input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            onBlur={() => void handleSaveModel()}
          />
          <span className="text-muted-foreground">{DEFAULT_MODEL_HINT}</span>
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Show the key fields in the AI panel.** In `packages/ui/src/AiSettingsPanel.tsx`:
- add `import { AiKeyFields } from "./AiKeyFields";`;
- render `<AiKeyFields />` directly after the closing `</label>` of the switch row (before the three number fields).

`AiKeyFields` returns `null` on the web.

- [ ] **Step 5: Open, drop, save as and reveal in `InvoiceCheck`.** In `packages/ui/src/InvoiceCheck.tsx`:
- change the React import to `import { useEffect } from "react";` (keep `import type { ChangeEvent } from "react";` last);
- destructure `handleSaveAs` from `useInvoiceCheck`;
- add after the hooks:

```tsx
  // Desktop: files dropped on the window or passed at launch.
  useEffect(() => platform.onExternalFile?.((file) => void handleFile(file)), [platform, handleFile]);

  const handlePick = async () => {
    const file = await platform.pickFile?.();
    if (file) await handleFile(file);
  };
```

Replace the `<Input type="file" … />` element with:

```tsx
        {platform.pickFile ? (
          <Button variant="outline" disabled={isProcessing} onClick={() => void handlePick()}>
            Chọn file Excel
          </Button>
        ) : (
          <Input
            type="file"
            accept=".xlsx,.xlsm"
            aria-label="Chọn file Excel"
            className="max-w-sm"
            disabled={isProcessing}
            onChange={(event) => void handleChange(event)}
          />
        )}
```

Directly after the existing save `<Button>` (inside the same `state.phase === "done"` condition, wrapped in a fragment), add:

```tsx
            {platform.saveResultAs && (
              <Button variant="outline" onClick={() => void handleSaveAs()}>
                Lưu thành…
              </Button>
            )}
```

Replace `{savedTo && <p className="text-sm text-green-700">Đã lưu: {savedTo}</p>}` with:

```tsx
      {savedTo && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-green-700">Đã lưu: {savedTo}</span>
          {platform.revealFile && (
            <Button variant="outline" size="sm" onClick={() => void platform.revealFile?.(savedTo)}>
              Mở thư mục
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 6: Verify the web is unchanged**

```bash
npm run typecheck && npm test && npm run lint && npm run build:web
```

Expected: all green; tests are still **136**. With the dev server on port 3100, upload the real file again: 76 / 40 / 8 / 28, no "Chọn file Excel" button (still the file input), no key fields in Cài đặt AI.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): optional desktop capabilities — pick/drop/launch files, save as, reveal, own AI key

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `apps/desktop` frontend (Vite + React) and the desktop platform

**Files:**
- Create: `apps/desktop/{package.json,index.html,vite.config.ts,tsconfig.json,vitest.config.mts}`, `apps/desktop/src/{main.tsx,main.css,aiAnswer.ts,aiAnswer.test.ts,desktopPlatform.ts}`

**Interfaces:**
- Consumes: `@kiemtra/core` (`extractCheckout`, `toIsoDate`, types), `@kiemtra/ui` (`InvoiceCheck`, `PlatformProvider`, `Platform`, `SourceFile`)
- Produces:
  - `toAiAnswer(answer: RustAnswer): AiAnswer`, `toResponseItem(item: RustItem): AiResponseItem`, `NO_KEY_NOTE`
  - `desktopPlatform: Platform`, which calls the Rust commands `read_file`, `startup_file`, `save_next_to`, `save_as`, `ai_key_status`, `set_ai_key`, `delete_ai_key`, `get_model`, `set_model`, `ask_ai` (Task 6/7)

- [ ] **Step 1: Package files**

`apps/desktop/package.json`:

```json
{
  "name": "@kiemtra/desktop",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build --no-bundle",
    "dev:vite": "vite",
    "build:vite": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource/be-vietnam-pro": "^5.3.0",
    "@kiemtra/core": "*",
    "@kiemtra/ui": "*",
    "@tauri-apps/api": "^2.11.1",
    "@tauri-apps/plugin-dialog": "^2.7.3",
    "@tauri-apps/plugin-opener": "^2.5.5",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@tauri-apps/cli": "^2.11.5",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.1.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vite": "^8.3.1",
    "vitest": "^5.0.2"
  }
}
```

`apps/desktop/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/desktop/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri loads the dev server from a fixed port and fails if it is taken.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022" },
});
```

`apps/desktop/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

`apps/desktop/index.html`:

```html
<!doctype html>
<html lang="vi" class="h-full antialiased">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kiểm tra hóa đơn lưu trú</title>
  </head>
  <body class="flex min-h-full flex-col">
    <div id="root" class="flex min-h-full flex-col"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/desktop/src/main.css` (the font is bundled so the portable app works offline):

```css
@import "@kiemtra/ui/styles.css";
@import "@fontsource/be-vietnam-pro/400.css";
@import "@fontsource/be-vietnam-pro/500.css";
@import "@fontsource/be-vietnam-pro/600.css";
@import "@fontsource/be-vietnam-pro/700.css";

html {
  --font-sans: "Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 2: Write the failing `aiAnswer` tests.** Create `apps/desktop/src/aiAnswer.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { NO_KEY_NOTE, toAiAnswer } from "./aiAnswer";

describe("toAiAnswer", () => {
  it("turns each AI answer text into a date with the shared rules", () => {
    expect(
      toAiAnswer({
        status: "ok",
        results: [{ answer: "02/05/2025" }, { answer: "KHONG_XAC_DINH" }, { date: null, note: "AI HTTP 429" }],
      }),
    ).toEqual({
      status: "ok",
      results: [{ date: "2025-05-02" }, { date: null, note: "AI không xác định được" }, { date: null, note: "AI HTTP 429" }],
    });
  });

  it("explains a missing key and passes failures through", () => {
    expect(toAiAnswer({ status: "disabled" })).toEqual({ status: "disabled", note: NO_KEY_NOTE });
    expect(NO_KEY_NOTE).toBe("Chưa lưu khóa OpenAI (Cài đặt AI)");
    expect(toAiAnswer({ status: "failed" })).toEqual({ status: "failed" });
  });
});
```

Run: `npm install && npm test -w @kiemtra/desktop`
Expected: FAIL with `Cannot find module './aiAnswer'`.

- [ ] **Step 3: Implement `aiAnswer.ts`**

```ts
import { extractCheckout, toIsoDate } from "@kiemtra/core";

import type { AiAnswer, AiResponseItem } from "@kiemtra/core";

// What the Rust `ask_ai` command returns: raw answer text per input, or a failure note.
export type RustItem = { answer: string } | { date: null; note: string };
export type RustAnswer = { status: "ok"; results: RustItem[] } | { status: "disabled" } | { status: "failed" };

export const NO_KEY_NOTE = "Chưa lưu khóa OpenAI (Cài đặt AI)";

// The shared rules read the date, so date logic lives only in @kiemtra/core.
export function toResponseItem(item: RustItem): AiResponseItem {
  if (!("answer" in item)) return item;
  const date = extractCheckout(item.answer);
  return date ? { date: toIsoDate(date) } : { date: null, note: "AI không xác định được" };
}

export function toAiAnswer(answer: RustAnswer): AiAnswer {
  if (answer.status === "ok") return { status: "ok", results: answer.results.map(toResponseItem) };
  if (answer.status === "disabled") return { status: "disabled", note: NO_KEY_NOTE };
  return answer;
}
```

Run: `npm test -w @kiemtra/desktop`
Expected: PASS (2 tests).

- [ ] **Step 4: The desktop platform.** Create `apps/desktop/src/desktopPlatform.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { toAiAnswer } from "./aiAnswer";

import type { AiLimits } from "@kiemtra/core";
import type { Platform, SaveOutcome, SourceFile } from "@kiemtra/ui";
import type { RustAnswer } from "./aiAnswer";

// Same ceilings as the website's server defaults; the user's own settings apply within them.
const LOCAL_LIMITS: AiLimits = { maxTexts: 1000, maxTextLength: 500, concurrency: 10 };
const EXCEL_FILTER = [{ name: "Excel", extensions: ["xlsx", "xlsm"] }];
const EXCEL_PATH = /\.xls[xm]$/i;

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

async function readSource(path: string): Promise<SourceFile> {
  const data = await invoke<ArrayBuffer>("read_file", { path });
  return { name: baseName(path), path, data };
}

function toBytes(data: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(data));
}

async function saveAs(data: ArrayBuffer, fileName: string): Promise<SaveOutcome> {
  const path = await save({ defaultPath: fileName, filters: EXCEL_FILTER });
  if (!path) return { savedTo: null };
  await invoke("save_as", { path, bytes: toBytes(data) });
  return { savedTo: path };
}

export const desktopPlatform: Platform = {
  kind: "desktop",
  privacyNotice:
    "Dữ liệu được xử lý ngay trên máy của bạn. Chỉ nội dung lưu trú không đọc được mới được gửi tới OpenAI bằng khóa của bạn.",
  askAi: async (texts, limits) => toAiAnswer(await invoke<RustAnswer>("ask_ai", { texts, limits })),
  getAiLimits: async () => LOCAL_LIMITS,
  saveResult: async (data, fileName, source) => {
    if (!source.path) return saveAs(data, fileName);
    const savedTo = await invoke<string>("save_next_to", { sourcePath: source.path, fileName, bytes: toBytes(data) });
    return { savedTo };
  },
  saveResultAs: saveAs,
  revealFile: (path) => revealItemInDir(path),
  pickFile: async () => {
    const path = await open({ multiple: false, directory: false, filters: EXCEL_FILTER });
    return typeof path === "string" ? readSource(path) : null;
  },
  onExternalFile: (handler) => {
    let isActive = true;
    let unlisten: () => void = () => {};
    void (async () => {
      // The launch file is handed out once (Rust takes it), so a remount cannot open it twice.
      const startup = await invoke<string | null>("startup_file");
      if (startup && isActive) handler(await readSource(startup));
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const path = event.payload.paths.find((candidate) => EXCEL_PATH.test(candidate));
        if (path) void readSource(path).then(handler);
      });
      if (isActive) unlisten = stop;
      else stop();
    })();
    return () => {
      isActive = false;
      unlisten();
    };
  },
  aiKey: {
    status: () => invoke<string | null>("ai_key_status"),
    save: async (key) => {
      await invoke("set_ai_key", { key });
      return invoke<string | null>("ai_key_status");
    },
    remove: () => invoke("delete_ai_key"),
  },
  aiModel: {
    get: () => invoke<string>("get_model"),
    set: (model) => invoke("set_model", { model }),
  },
};
```

`apps/desktop/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { InvoiceCheck, PlatformProvider } from "@kiemtra/ui";

import { desktopPlatform } from "./desktopPlatform";

import "./main.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={desktopPlatform}>
      <InvoiceCheck />
    </PlatformProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Verify**

```bash
npm install
npm run typecheck && npm test && npm run build:vite -w @kiemtra/desktop
```

Expected: typecheck passes for four workspaces; tests total **138** (136 + 2 desktop); `vite build` writes `apps/desktop/dist/index.html`. Warnings that `"use client"` directives were ignored are expected and harmless. Confirm `ls apps/desktop/dist/assets | grep -c woff2` is ≥ 3 (fonts bundled).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(desktop): Vite + React frontend with the desktop platform

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tauri backend — project, pure logic and Rust tests

**Files:**
- Create: `apps/desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/default.json,src/main.rs,src/lib.rs,icons/*}`

**Interfaces:**
- Consumes: Task 5 frontend (`npm run dev:vite` / `build:vite`)
- Produces (in `lib.rs`, all `pub` for tests):
  - `request_body(model: &str, text: &str) -> serde_json::Value`
  - `output_text(payload: &Value) -> String`
  - `note_for_status(status: u16) -> String`
  - `next_free_path(dir: &Path, file_name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf`
  - `startup_xlsx(args: &[String], exists: impl Fn(&Path) -> bool) -> Option<String>`
  - `mask_key(key: &str) -> String`
  - `Limits::effective(self) -> Limits`
  - `StartupFile::take(&self) -> Option<String>`
  - enums `AiItem`, `AiAnswer`

- [ ] **Step 1: The Rust toolchain.** Check with `rustc --version`. If it is missing, **ask the user** before installing. The install is a side effect outside the repo:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
source "$HOME/.cargo/env" && rustc --version
```

If the user declines, write the files in Steps 2–6 anyway and leave `cargo test` to CI (Task 8). Record this in the ledger as a ruling.

- [ ] **Step 2: Cargo and Tauri config**

`apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "kiemtra-hoadon"
version = "1.0.0"
description = "Kiểm tra hóa đơn lưu trú"
edition = "2021"

[lib]
name = "kiemtra_hoadon_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.13", features = ["json"] }
keyring = { version = "3.6", features = ["windows-native", "apple-native"] }
futures = "0.3"

[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
strip = true
```

`apps/desktop/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

`apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Kiểm tra hóa đơn lưu trú",
  "version": "1.0.0",
  "identifier": "vn.kiemtra.hoadon",
  "build": {
    "beforeDevCommand": "npm run dev:vite",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build:vite",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Kiểm tra hóa đơn lưu trú",
        "width": 1280,
        "height": 860,
        "minWidth": 900,
        "minHeight": 600,
        "dragDropEnabled": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:"
    }
  },
  "bundle": {
    "active": false,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

`apps/desktop/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window: open/save dialogs, reveal a saved file, and the app's own commands only.",
  "windows": ["main"],
  "permissions": ["core:default", "dialog:allow-open", "dialog:allow-save", "opener:allow-reveal-item-in-dir"]
}
```

`apps/desktop/src-tauri/src/main.rs`:

```rust
// No console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kiemtra_hoadon_lib::run()
}
```

- [ ] **Step 3: Icons (from the website icon)**

```bash
cd ~/Projects/kiemtra-hoadon-web
S=$(mktemp -d)
cp apps/web/src/app/icon.svg $S/icon.svg
qlmanage -t -s 1024 -o $S $S/icon.svg >/dev/null 2>&1
npx -w @kiemtra/desktop tauri icon $S/icon.svg.png -o apps/desktop/src-tauri/icons
ls apps/desktop/src-tauri/icons | grep -E '^(32x32\.png|128x128\.png|128x128@2x\.png|icon\.icns|icon\.ico)$' | wc -l
```

Expected: `5`.

- [ ] **Step 4: Write the failing Rust tests with stubs.** Create `apps/desktop/src-tauri/src/lib.rs`. Signatures are real; bodies are `unimplemented!()` except `run`:

```rust
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROMPT: &str =
    "Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH.";
pub const MAX_OUTPUT_TOKENS: u32 = 1000;
// Ceilings — the same as the website's server defaults.
pub const MAX_TEXTS: usize = 1000;
pub const MAX_TEXT_LENGTH: usize = 500;
pub const MAX_CONCURRENCY: usize = 10;

#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub max_texts: usize,
    pub max_text_length: usize,
    pub concurrency: usize,
}

impl Limits {
    pub fn effective(self) -> Limits {
        unimplemented!()
    }
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(untagged)]
pub enum AiItem {
    Answer { answer: String },
    Failed { date: Option<String>, note: String },
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum AiAnswer {
    Ok { results: Vec<AiItem> },
    Disabled,
    Failed,
}

pub struct StartupFile(pub Mutex<Option<String>>);

impl StartupFile {
    pub fn take(&self) -> Option<String> {
        unimplemented!()
    }
}

pub fn request_body(_model: &str, _text: &str) -> Value {
    unimplemented!()
}

pub fn output_text(_payload: &Value) -> String {
    unimplemented!()
}

pub fn note_for_status(_status: u16) -> String {
    unimplemented!()
}

pub fn next_free_path(_dir: &Path, _file_name: &str, _exists: impl Fn(&Path) -> bool) -> PathBuf {
    unimplemented!()
}

pub fn startup_xlsx(_args: &[String], _exists: impl Fn(&Path) -> bool) -> Option<String> {
    unimplemented!()
}

pub fn mask_key(_key: &str) -> String {
    unimplemented!()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashSet;

    #[test]
    fn request_body_uses_the_fixed_prompt_token_cap_and_no_storage() {
        assert_eq!(
            request_body("gpt-6-luna", "Thuê phòng nghỉ"),
            json!({
                "model": "gpt-6-luna",
                "instructions": PROMPT,
                "input": "Thuê phòng nghỉ",
                "max_output_tokens": 1000,
                "store": false
            })
        );
    }

    #[test]
    fn output_text_joins_output_text_parts_only() {
        let payload = json!({
            "output": [
                { "type": "reasoning", "content": [{ "type": "reasoning_text", "text": "thinking" }] },
                { "type": "message", "content": [{ "type": "output_text", "text": "02/05" }, { "type": "output_text", "text": "/2025" }] }
            ]
        });
        assert_eq!(output_text(&payload), "02/05/2025");
        assert_eq!(output_text(&json!({})), "");
    }

    #[test]
    fn note_for_status_explains_a_bad_key() {
        assert_eq!(note_for_status(401), "Khóa OpenAI không hợp lệ");
        assert_eq!(note_for_status(429), "AI HTTP 429");
        assert_eq!(note_for_status(500), "AI HTTP 500");
    }

    #[test]
    fn next_free_path_never_overwrites() {
        let dir = Path::new("/data/Hóa đơn");
        let taken: HashSet<PathBuf> = [
            dir.join("XUAT HDDT BAN RA_ket_qua.xlsx"),
            dir.join("XUAT HDDT BAN RA_ket_qua (1).xlsx"),
        ]
        .into_iter()
        .collect();
        let exists = |p: &Path| taken.contains(p);
        assert_eq!(next_free_path(dir, "other.xlsx", exists), dir.join("other.xlsx"));
        assert_eq!(
            next_free_path(dir, "XUAT HDDT BAN RA_ket_qua.xlsx", exists),
            dir.join("XUAT HDDT BAN RA_ket_qua (2).xlsx")
        );
        let none_taken = |_: &Path| false;
        assert_eq!(next_free_path(dir, "no-extension", none_taken), dir.join("no-extension"));
    }

    #[test]
    fn startup_xlsx_accepts_spaces_vietnamese_and_upper_case() {
        let all_exist = |_: &Path| true;
        let args = |path: &str| vec!["kiemtra-hoadon.exe".to_string(), path.to_string()];
        assert_eq!(
            startup_xlsx(&args(r"C:\Hóa đơn\XUAT HDDT BAN RA.xlsx"), all_exist),
            Some(r"C:\Hóa đơn\XUAT HDDT BAN RA.xlsx".to_string())
        );
        assert_eq!(startup_xlsx(&args(r"C:\a\B.XLSX"), all_exist), Some(r"C:\a\B.XLSX".to_string()));
        assert_eq!(startup_xlsx(&args(r"C:\a\notes.txt"), all_exist), None);
        assert_eq!(startup_xlsx(&args(r"C:\a\gone.xlsx"), |_: &Path| false), None);
        assert_eq!(startup_xlsx(&["kiemtra-hoadon.exe".to_string()], all_exist), None);
    }

    #[test]
    fn mask_key_keeps_only_the_last_four_characters() {
        assert_eq!(mask_key("sk-proj-abcdef1234"), "1234");
        assert_eq!(mask_key("abc"), "abc");
    }

    #[test]
    fn limits_are_clamped_to_one_and_the_ceilings() {
        let asked = Limits { max_texts: 5000, max_text_length: 0, concurrency: 99 };
        assert_eq!(asked.effective(), Limits { max_texts: 1000, max_text_length: 1, concurrency: 10 });
    }

    #[test]
    fn answers_serialise_to_the_contract_the_frontend_reads() {
        let answer = AiAnswer::Ok {
            results: vec![
                AiItem::Answer { answer: "02/05/2025".into() },
                AiItem::Failed { date: None, note: "AI HTTP 429".into() },
            ],
        };
        assert_eq!(
            serde_json::to_value(answer).unwrap(),
            json!({ "status": "ok", "results": [{ "answer": "02/05/2025" }, { "date": null, "note": "AI HTTP 429" }] })
        );
        assert_eq!(serde_json::to_value(AiAnswer::Disabled).unwrap(), json!({ "status": "disabled" }));
    }

    #[test]
    fn the_startup_file_is_handed_out_once() {
        let state = StartupFile(Mutex::new(Some("C:\\a.xlsx".into())));
        assert_eq!(state.take(), Some("C:\\a.xlsx".to_string()));
        assert_eq!(state.take(), None);
    }
}
```

Run: `npm run build:vite -w @kiemtra/desktop && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`. The first build downloads and compiles dependencies, which takes several minutes.
Expected: it compiles; 9 tests FAIL with `not implemented`.

- [ ] **Step 5: Implement the pure logic.** In `lib.rs`, replace each stub body:

```rust
impl Limits {
    pub fn effective(self) -> Limits {
        Limits {
            max_texts: self.max_texts.clamp(1, MAX_TEXTS),
            max_text_length: self.max_text_length.clamp(1, MAX_TEXT_LENGTH),
            concurrency: self.concurrency.clamp(1, MAX_CONCURRENCY),
        }
    }
}
```

```rust
impl StartupFile {
    pub fn take(&self) -> Option<String> {
        self.0.lock().ok()?.take()
    }
}
```

```rust
pub fn request_body(model: &str, text: &str) -> Value {
    serde_json::json!({
        "model": model,
        "instructions": PROMPT,
        "input": text,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "store": false
    })
}

pub fn output_text(payload: &Value) -> String {
    payload["output"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|item| item["content"].as_array().into_iter().flatten())
        .filter(|part| part["type"] == "output_text")
        .filter_map(|part| part["text"].as_str())
        .collect()
}

pub fn note_for_status(status: u16) -> String {
    if status == 401 {
        "Khóa OpenAI không hợp lệ".to_string()
    } else {
        format!("AI HTTP {status}")
    }
}

pub fn next_free_path(dir: &Path, file_name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(file_name);
    if !exists(&first) {
        return first;
    }
    let (stem, extension) = match file_name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (file_name.to_string(), String::new()),
    };
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){extension}")))
        .find(|candidate| !exists(candidate))
        .expect("an unbounded range always finds a free name")
}

pub fn startup_xlsx(args: &[String], exists: impl Fn(&Path) -> bool) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|arg| {
            let lower = arg.to_lowercase();
            (lower.ends_with(".xlsx") || lower.ends_with(".xlsm")) && exists(Path::new(arg.as_str()))
        })
        .cloned()
}

pub fn mask_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    chars[chars.len().saturating_sub(4)..].iter().collect()
}
```

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(desktop): Tauri project with tested request, naming and startup-file logic

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Tauri commands, wiring and a real run

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add commands and a real `run`)

**Interfaces:**
- Consumes: Task 6 pure functions, Task 5 `desktopPlatform` command names and argument shapes
- Produces the commands (the JS name is the camelCase form of the Rust arguments):
  - `startup_file() -> Option<String>`
  - `read_file(path) -> Response(bytes)`
  - `save_next_to(sourcePath, fileName, bytes: number[]) -> String`
  - `save_as(path, bytes)`
  - `ai_key_status() -> Option<String>`
  - `set_ai_key(key)`
  - `delete_ai_key()`
  - `get_model() -> String`
  - `set_model(model)`
  - `ask_ai(texts, limits) -> AiAnswer`

- [ ] **Step 1: Add the commands.** In `lib.rs`, add these imports at the top:

```rust
use std::time::Duration;

use futures::stream::{self, StreamExt};
use tauri::Manager;
```

Add after `mask_key`:

```rust
const OPENAI_URL: &str = "https://api.openai.com/v1/responses";
const TIMEOUT: Duration = Duration::from_secs(15);
const KEY_SERVICE: &str = "kiemtra-hoadon";
const KEY_USER: &str = "openai";
const DEFAULT_MODEL: &str = "gpt-6-luna";

fn failed(note: impl Into<String>) -> AiItem {
    AiItem::Failed { date: None, note: note.into() }
}

#[tauri::command]
fn startup_file(state: tauri::State<'_, StartupFile>) -> Option<String> {
    state.take()
}

#[tauri::command]
fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|error| format!("Không đọc được file: {error}"))
}

#[tauri::command]
fn save_next_to(source_path: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = Path::new(&source_path)
        .parent()
        .ok_or_else(|| "Không xác định được thư mục của file gốc".to_string())?;
    let target = next_free_path(dir, &file_name, |candidate| candidate.exists());
    std::fs::write(&target, bytes).map_err(|error| format!("Không lưu được file: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_as(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|error| format!("Không lưu được file: {error}"))
}

fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_USER).map_err(|error| error.to_string())
}

fn read_key() -> Option<String> {
    key_entry().ok()?.get_password().ok().filter(|key| !key.trim().is_empty())
}

#[tauri::command]
fn ai_key_status() -> Option<String> {
    read_key().map(|key| mask_key(&key))
}

#[tauri::command]
fn set_ai_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Khóa trống".to_string());
    }
    key_entry()?.set_password(key).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_ai_key() -> Result<(), String> {
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map(|dir| dir.join("config.json")).map_err(|error| error.to_string())
}

fn read_model(app: &tauri::AppHandle) -> String {
    config_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|config| config["model"].as_str().map(str::to_owned))
        .filter(|model| !model.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

#[tauri::command]
fn get_model(app: tauri::AppHandle) -> String {
    read_model(&app)
}

#[tauri::command]
fn set_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    let path = config_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    let config = serde_json::json!({ "model": model.trim() });
    std::fs::write(path, config.to_string()).map_err(|error| error.to_string())
}

async fn ask_one(client: &reqwest::Client, key: &str, model: &str, text: &str) -> AiItem {
    let response = match client.post(OPENAI_URL).bearer_auth(key).json(&request_body(model, text)).send().await {
        Ok(response) => response,
        Err(_) => return failed("Không gọi được AI"),
    };
    if !response.status().is_success() {
        return failed(note_for_status(response.status().as_u16()));
    }
    match response.json::<Value>().await {
        Ok(payload) => AiItem::Answer { answer: output_text(&payload) },
        Err(_) => failed("Không gọi được AI"),
    }
}

#[tauri::command]
async fn ask_ai(app: tauri::AppHandle, texts: Vec<String>, limits: Limits) -> AiAnswer {
    let Some(key) = read_key() else { return AiAnswer::Disabled };
    let model = read_model(&app);
    let limits = limits.effective();
    if texts.is_empty() || texts.len() > limits.max_texts {
        return AiAnswer::Failed;
    }
    let Ok(client) = reqwest::Client::builder().timeout(TIMEOUT).build() else { return AiAnswer::Failed };
    let texts: Vec<String> = texts.into_iter().map(|text| text.chars().take(limits.max_text_length).collect()).collect();
    let results = stream::iter(texts.iter())
        .map(|text| ask_one(&client, &key, &model, text))
        .buffered(limits.concurrency)
        .collect()
        .await;
    AiAnswer::Ok { results }
}
```

Replace `run` with:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let startup = startup_xlsx(&args, |path| path.exists());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(StartupFile(Mutex::new(startup)))
        .invoke_handler(tauri::generate_handler![
            startup_file,
            read_file,
            save_next_to,
            save_as,
            ai_key_status,
            set_ai_key,
            delete_ai_key,
            get_model,
            set_model,
            ask_ai
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Compile and test**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: 9 tests PASS and clippy reports no warnings. If `keyring` 3.6's API differs (for example `delete_credential` named differently), check `https://docs.rs/keyring/3.6.3` and adapt that one call. Record the change in the ledger.

- [ ] **Step 3: A real run on macOS, launched with a file (Review Focus 2 and 5)**

```bash
npm run build -w @kiemtra/desktop           # tauri build --no-bundle
S=$(mktemp -d); cp ~/Downloads/"XUAT HDDT BAN RA.xlsx" "$S/Hóa đơn test.xlsx"
apps/desktop/src-tauri/target/release/kiemtra-hoadon "$S/Hóa đơn test.xlsx" &
sleep 8; screencapture -x "$S/run.png"; echo "$S"
```

Read `$S/run.png`. Expected: the window shows the results with tiles **76 / 40 / 8 / 28**. The launch file, whose name has spaces and Vietnamese characters, was opened once, not twice. Quit the app (`kill %1`).

- [ ] **Step 4: Manual checklist for the user** (GUI interaction, macOS or Windows). Report it in the final message:
1. **Chọn file Excel** opens the file dialog, and opening the export gives 76 / 40 / 8 / 28.
2. Dragging the file onto the window gives the same result.
3. **Lưu kết quả** shows "Đã lưu: …/XUAT HDDT BAN RA_ket_qua.xlsx" next to the source. A second save gives `… (1).xlsx`. **Mở thư mục** reveals it.
4. **Lưu thành…** opens the save dialog.
5. In Cài đặt AI, paste a key and click **Lưu khóa**. It shows "Đã lưu (••••last4)". **Xóa khóa** removes it. With no key, unreadable rows say "Chưa lưu khóa OpenAI (Cài đặt AI)".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(desktop): Tauri commands for files, the OS credential store and OpenAI

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: CI, Windows release workflow and README

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/desktop.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: root scripts (Task 1), the desktop build (Task 7)
- Produces: a workflow artifact `kiemtra-hoadon-windows` (`kiemtra-hoadon.exe`), and a GitHub Release asset on `v*` tags

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run lint
      - run: npm run build:web
```

- [ ] **Step 2: `.github/workflows/desktop.yml`**

```yaml
name: Desktop (Windows)
on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop/src-tauri -> target
      - run: npm ci
      - run: npm test
      # tauri::generate_context! embeds ../dist at compile time, so build the frontend before cargo test
      - run: npm run build:vite -w @kiemtra/desktop
      - run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
      - run: npm run build:desktop
      - uses: actions/upload-artifact@v4
        with:
          name: kiemtra-hoadon-windows
          path: apps/desktop/src-tauri/target/release/kiemtra-hoadon.exe
      - if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: apps/desktop/src-tauri/target/release/kiemtra-hoadon.exe
```

- [ ] **Step 3: README.** Replace the top and "Run locally" sections and add "Desktop app". Keep the existing "Cost and abuse controls" and "Test data" sections, updating paths (`packages/core/fixtures/br-chitiet.xlsx`, `packages/core/templates/ket-qua-ai.xlsx`):

````markdown
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
````

- [ ] **Step 4: Verify locally**

```bash
npm run typecheck && npm test && npm run lint && npm run build:web
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/desktop.yml']];print('yaml ok')"
```

Expected: all green; `yaml ok`.

- [ ] **Step 5: Commit** (do not push)

```bash
git add -A
git commit -m "ci: web checks on every push and a Windows portable build on v* tags

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

In the final message, tell the user the steps that are theirs:
1. Merge and push `feat/desktop`.
2. Change Vercel's Root Directory to `apps/web`.
3. Push a `v1.0.0` tag, then download and run the `.exe` on Windows.
4. Run the Task 7 manual checklist.
