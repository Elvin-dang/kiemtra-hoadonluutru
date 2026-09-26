# Kiểm tra hóa đơn lưu trú

Upload an invoice workbook (sheet `DU_LIEU_GOC`) and see which hotel invoices were issued late relative to the guest's check-out date.

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

The route itself accepts at most 50 texts of at most 500 characters per request, uses a fixed prompt, and never returns raw model text.

## Reference

`fixtures/reference_kiemtra_hoadon.py` is the original Python implementation; `fixtures/sample.xlsx` is the golden test input.
