# Custody Invoice Attachments — كيف تعمل الآن

## ملخص القرار

- **التخزين:** Postgres bytes (`CustodyFundInvoice.attachmentData`) — ليس Railway filesystem.
- **السبب:** حاوية Railway ephemeral. `uploads/custody-invoices/` يُمسح عند كل redeploy. نقلنا التخزين إلى قاعدة البيانات حتى تصمد الملفات.
- **الحد الأعلى:** 10 MB لكل ملف. الأنواع المقبولة: PDF · JPG/JPEG · PNG · WEBP · XLSX · XLS · DOCX.

## Upload flow

```
Frontend (page.tsx)
    │ multipart/form-data: file + invoice meta
    ▼
POST /api/custody-funds/:fundId/invoices
    │  FileInterceptor { storage: memoryStorage(), limits: 10MB, fileFilter: whitelist }
    ▼
controller.addInvoice
    │  fixMulterFilename(file)                ← converts Latin-1 mojibake → UTF-8
    │  service.addInvoice(fundId, {
    │     invoiceName, amount, invoiceDate, ...
    │     attachmentBuffer: file.buffer,      ← in-memory Buffer (≤10MB)
    │     attachmentOriginalName: file.originalname,
    │     attachmentMimeType: file.mimetype,
    │  }, userId)
    ▼
prisma.custodyFundInvoice.create({ data: {
  ...,
  attachmentData: Uint8Array(buffer),       ← persistent
  attachmentMimeType, attachmentSizeBytes,  ← persistent metadata
  attachmentOriginalName,                   ← Arabic-safe
  // attachmentUrl intentionally NOT written for new uploads
} })
```

## Download flow

```
Frontend (page.tsx, onClick)
    │ custodyInvoiceApi.download(invoiceId)
    │ axios.get('/custody-funds/invoices/:id/download', responseType: 'blob')
    ▼
controller.downloadInvoice
    │  (1) if invoice.attachmentData → send Buffer with DB mimeType + RFC-5987 filename.
    │  (2) elif invoice.attachmentUrl && existsSync → stream legacy FS file.
    │  (3) else → 404 with friendly Arabic message.
    ▼
Frontend
    │  content-type sniff — if JSON, read blob.text() → parse → toast.error.
    │  otherwise build object URL + <a download> with the Arabic filename
    │  parsed back from Content-Disposition's filename*=UTF-8'' form.
```

## AI Invoice Analyzer interaction

The AI path (`POST /custody-funds/:fundId/ai-invoice/...`) stores the original file in **the same column** (`attachmentData`) and never overwrites it. AI extraction results live on the side in `aiRawResponse` + the `ai*` columns. The download endpoint sees only the original bytes.

## Migration for legacy rows

Script: `apps/api/scripts/fix-legacy-attachments.ts`

```bash
# 1. Dry-run (default) — prints diff, writes nothing.
cd apps/api
npx ts-node scripts/fix-legacy-attachments.ts

# 2. When the dry-run looks right:
npx ts-node scripts/fix-legacy-attachments.ts --apply
```

The script does three things per row:

1. **Filename mojibake fix.** If `attachmentOriginalName` is Latin-1 mojibake of Arabic, it rewrites it in-place (same detection heuristic as `fixMulterFilename`).
2. **FS → DB recovery.** If `attachmentData` is null and the legacy `attachmentUrl` still points at a real file on disk, it slurps the bytes into `attachmentData` so the file survives the next Railway redeploy.
3. **Orphan detection.** If both paths miss (bytes empty + FS file gone), the row is flagged in a report — the file is genuinely lost to Railway's ephemeral FS and must be re-uploaded by the user.

Idempotent. Safe to re-run.

## Why not Railway Volume?

We scoped this fix to the custody-invoices surface because that's where the user-facing bug was. Adding a Railway Volume for the other upload paths (tasks, daily-updates, scope-blocks, file-library, imports) is a separate decision and a separate PR: it's an ops change (volume mount + path env var + restart discipline), not a code-only change. The DB-bytes approach here is the persistent equivalent and matches what we already do for `ReportFileChunk` and `IntelligenceTemplateChunk`.

## Known caveats

- **10 MB cap.** Coming from multer. Aligns with the UI's 10 MB validation and Anthropic Vision's practical limit. Raise both in lock-step if needed.
- **Memory pressure.** `memoryStorage` holds the full buffer in the request's Node memory until the DB write completes. With 10 MB × concurrent upload count, this is fine on Railway's default container; revisit if we see OOMs.
- **DB size.** Large invoices bloat the `custody_fund_invoices` table. Once volume grows past a few GB consider moving to a dedicated chunked-attachments table (like `ReportFileChunk`).
