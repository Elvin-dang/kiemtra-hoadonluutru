# Kiểm tra hóa đơn lưu trú

Upload the e-invoice sales export ("XUAT HDDT BAN RA", sheet `BR_ChiTiet`) and see which hotel invoices were issued late relative to the guest's check-out date. A portable Windows desktop app (Tauri 2).

## Layout

| Path | What |
|---|---|
| `packages/core` | Date rules, Excel read/write, analysis, table logic — all tests live here |
| `packages/ui` | The React screens, used through a `Platform` interface |
| `apps/desktop` | Tauri 2 Windows app (Vite + React + Rust) |

## Develop

```bash
npm install
npm test               # all workspaces
npm run dev:desktop    # needs Rust (https://rustup.rs)
```

Editing `packages/core/templates/ket-qua-ai.xlsx`? Run `npm run embed-template -w @kiemtra/core`; a test fails if you forget.
Adding a shadcn component: run `npx shadcn add <name>` in `packages/ui`, then change any `@/components/ui/...` imports in the new file to relative `./...` imports.

## Desktop app (Windows)

- **Release:** push a tag, e.g. `git tag v1.0.0 && git push origin v1.0.0`. The "Desktop (Windows)" workflow builds `kiemtra-hoadon.exe` (portable, ~10 MB) and attaches it to the GitHub Release. It can also be run by hand from the Actions tab (artifact only).
- **First run:** the app is not code-signed, so Windows SmartScreen shows "Windows protected your PC" → click **More info → Run anyway**.
- **Requirements:** Windows 10/11 with Microsoft Edge WebView2 (built into Windows 11 and up-to-date Windows 10).
- **OpenAI:** each user saves their own key in **Cài đặt AI → Khóa OpenAI API**; it is stored in Windows Credential Manager (entry `kiemtra-hoadon`). The model (default `gpt-6-luna`) is kept in `%APPDATA%\vn.kiemtra.hoadon\config.json`.
- **Opening files:** Chọn file Excel, drag a file onto the window, or drop it onto the `.exe` / a shortcut. **Lưu kết quả** saves `<name>_ket_qua.xlsx` next to the source (never overwrites — adds "(1)", "(2)", …).

## Test data

`packages/core/fixtures/br-chitiet.xlsx` is an anonymised copy of a real export (dates and descriptions kept exactly; names, tax codes and addresses replaced). It is the golden test input. Never commit a real export — exports contain customer data.
