# AI Invoice Analyzer — محلّل الفواتير بالذكاء الاصطناعي

Claude Vision-powered invoice intake for the `support-services/custodies` domain on منصة رؤية.

## Flow

```
[UI: drag-drop file]
     │  multipart/form-data
     ▼
POST /api/support-services/custodies/:custodyId/ai-invoice/analyze
     │
     ├── resolve mime type (image/pdf whitelist)
     ├── rate-limit (20/hour/user, in-memory)
     ├── move file → uploads/temp/ai-invoices/<uuid>.ext
     ├── Claude Vision call #1 → extraction JSON
     ├── Claude text call #2 → { category, risk }
     ├── local duplicate detection (Levenshtein, last 90 days)
     ├── budget impact math
     ├── AIExtractionLog row {status:'completed', tokens, cost}
     ▼
[UI: preview + editable form + classification/risk/budget/duplicate cards]
     │
     ▼
POST /api/support-services/custodies/:custodyId/ai-invoice/confirm
     │
     ├── re-use SupportServicesService.createInvoice → CustodyInvoice row
     ├── stamp AI fields on the invoice
     ├── persist the file as DB-backed InvoiceAttachment (bytes in Postgres)
     ├── delete temp file, drop pending session
     ▼
[UI: redirect to custody detail]
```

## Endpoints

| Method | Path | Roles |
|---|---|---|
| POST | `/support-services/custodies/:custodyId/ai-invoice/analyze` (multipart `file`) | admin, system_manager, pm, track_lead |
| POST | `/support-services/custodies/:custodyId/ai-invoice/confirm` (JSON body) | same |
| DELETE | `/support-services/custodies/:custodyId/ai-invoice/:extractionId` | same |
| GET | `/support-services/ai-invoice/preview/:extractionId` | any authenticated user — owner check inside |

## Request / response shapes

### `POST /analyze`

```
multipart/form-data { file: <PDF|PNG|JPG|JPEG|WEBP|GIF, ≤10MB> }
```

→ 200 `AnalyzeResult` (see [apps/api/src/support-services/ai-analyzer/ai-analyzer.service.ts](../apps/api/src/support-services/ai-analyzer/ai-analyzer.service.ts)).

→ 429 if rate-limited. 503 if `ANTHROPIC_API_KEY` unset.

### `POST /confirm`

```json
{
  "extractionId": "<uuid from /analyze>",
  "editedData": { /* full InvoiceExtractionDto */ },
  "notes": "optional string",
  "category": "optional override"
}
```

## Environment variables

Already present in `.env.example` from the AI Agent work:

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL_DEFAULT=claude-sonnet-4-5   # can swap to -4-6 or -4-7
```

No new variables required for this feature.

## Prisma additions

Non-breaking, picked up by Railway's `preDeployCommand` via `prisma db push`:

- `CustodyInvoice` gains AI fields (all nullable): `aiExtracted`, `aiConfidence`, `aiCategory`, `aiRiskLevel`, `aiRiskScore`, `aiRiskFlags[]`, `aiExtractionId`, `aiProcessedAt`, `vendorTaxNumber`, `vendorName`, `aiRawResponse`.
- `InvoiceAttachment` gains `storageProvider` (default `"LOCAL"`) + `fileData Bytes?` so AI-uploaded attachments survive Railway's ephemeral filesystem.
- New `AIExtractionLog` model — one row per analyze request (success or failure) with tokens + SAR cost for observability.

## Hard limits / deferred items

- **Rate limit is in-memory per replica.** OK for a single Railway replica; move to Redis before scaling.
- **No Bulk Upload.** Bonus item; defer.
- **No Smart Autofill from prior vendor invoices.** Bonus; defer.
- **No AI Insights widget on dashboard.** Bonus; defer.
- **No voice notes.** Bonus; defer.
- **Legacy attachments still on LOCAL provider.** Unaffected; only new AI-uploaded attachments use `DB` + `fileData`.
- **Rate limit bypass not implemented.** Admins get the same 20/hr cap.

## Cost estimate

Two Claude Sonnet calls per invoice:
1. Vision extraction — ~1500-3000 input tokens (image encoded) + ~600 output.
2. Classification + risk — ~500 input + ~200 output.

At `claude-sonnet-4-5` pricing (~$3/M input, $15/M output): roughly **$0.01-0.02 per invoice** (~0.04-0.08 ر.س). Logged per-request in `AIExtractionLog.costInSar` for budgeting.

## Testing locally

```bash
# 1. Ensure ANTHROPIC_API_KEY is set in .env
# 2. Start dev
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:3000

# 3. Navigate:
#    /support-services/custodies/<custodyId>/ai-invoice
# 4. Drag-drop any Saudi invoice PDF or scan.
```

The 1-hour temp-file TTL is enforced by a cron that runs every 30 minutes (`@Cron(EVERY_30_MINUTES)` on `AIAnalyzerService.cleanupExpired`). Files older than 1h are deleted whether or not a pending session references them.
