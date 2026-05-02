import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { CustodyFundsService } from '../../custody-funds/custody-funds.service';
import { AIAnalyzerService, AnalyzeResult } from './ai-analyzer.service';
import { resolveMediaType, FilePayload } from './utils/file-to-base64';
import { CandidateInvoice, detectDuplicates } from './utils/duplicate-detector';
import { BatchSaveDto, BatchSaveItemDto } from './dto/batch-save.dto';
import { BatchRetryDto } from './dto/batch-retry.dto';

/**
 * Batch AI Invoice Analyzer — accepts 1-10 invoices in one request and runs
 * Claude Vision on each in parallel via {@link AIAnalyzerService}. Each upload
 * keeps its own retry-safe copy on disk so failed entries can be retried
 * without re-uploading; saves are atomic (single Prisma transaction).
 *
 * Single-invoice flow under /custody-funds/:fundId/ai-invoice/* is unaffected.
 */

const BATCH_TEMP_DIR = path.join(
  process.cwd(),
  'uploads',
  'temp',
  'ai-invoice-batches',
);
const BATCH_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_BATCH_FILES = 10;
const MIN_BATCH_FILES = 1;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BATCH_BYTES = 100 * 1024 * 1024;

interface BatchItemSuccess {
  index: number;
  status: 'success';
  fileName: string;
  fileSize: number;
  retryFilePath: string;
  retryMimeType: FilePayload['mediaType'];
  extractionId: string;
  fileUrl: string;
  analysisResult: AnalyzeResult;
  processingTimeMs: number;
}

interface BatchItemError {
  index: number;
  status: 'error';
  fileName: string;
  fileSize: number;
  retryFilePath: string;
  retryMimeType: FilePayload['mediaType'] | string;
  error: {
    code: string;
    message: string;
    technical?: string;
    retryable: boolean;
  };
  processingTimeMs: number;
}

type BatchItem = BatchItemSuccess | BatchItemError;

interface BatchSession {
  batchId: string;
  userId: string;
  fundId: string;
  items: BatchItem[];
  createdAt: number;
  totalProcessingTimeMs: number;
}

@Injectable()
export class AIBatchInvoiceService {
  private readonly logger = new Logger(AIBatchInvoiceService.name);
  private readonly batches = new Map<string, BatchSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly funds: CustodyFundsService,
    private readonly analyzer: AIAnalyzerService,
  ) {
    try {
      fs.mkdirSync(BATCH_TEMP_DIR, { recursive: true });
    } catch {
      /* best-effort */
    }
  }

  // ── /batch-analyze ─────────────────────────────────────────────────────

  async batchAnalyze(
    fundId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length < MIN_BATCH_FILES) {
      throw new BadRequestException('يجب رفع فاتورة واحدة على الأقل.');
    }
    if (files.length > MAX_BATCH_FILES) {
      this.cleanupMulterScratch(files);
      throw new BadRequestException(
        `الحد الأقصى ${MAX_BATCH_FILES} فواتير دفعة واحدة.`,
      );
    }

    let totalSize = 0;
    for (const f of files) {
      if (!f.size) {
        this.cleanupMulterScratch(files);
        throw new BadRequestException(`الملف "${f.originalname}" فارغ.`);
      }
      if (f.size > MAX_FILE_BYTES) {
        this.cleanupMulterScratch(files);
        throw new BadRequestException(
          `حجم الملف "${f.originalname}" يتجاوز 10 ميجابايت.`,
        );
      }
      totalSize += f.size;
    }
    if (totalSize > MAX_TOTAL_BATCH_BYTES) {
      this.cleanupMulterScratch(files);
      throw new BadRequestException(
        'إجمالي حجم الملفات يتجاوز 100 ميجابايت.',
      );
    }

    const fund = await this.prisma.custodyFund.findUnique({
      where: { id: fundId },
      select: { id: true, status: true },
    });
    if (!fund) {
      this.cleanupMulterScratch(files);
      throw new NotFoundException('العهدة غير موجودة');
    }
    if (fund.status === 'closed') {
      this.cleanupMulterScratch(files);
      throw new BadRequestException(
        'العهدة مُقفلة — لا يمكن تحليل فواتير جديدة.',
      );
    }

    const batchId = randomUUID();
    const batchDir = path.join(BATCH_TEMP_DIR, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    // Persist a retry-safe copy BEFORE handing each file to the analyzer (which
    // takes ownership of file.path and renames it). Without this copy a failed
    // analysis would force the user to re-upload.
    const preserved = files.map((f, i) => {
      const ext = path.extname(f.originalname) || '';
      const retryPath = path.join(batchDir, `${i}-${Date.now()}${ext}`);
      try {
        fs.copyFileSync(f.path, retryPath);
      } catch (e: any) {
        this.logger.error(
          `[batch-ai] failed to copy retry file for ${f.originalname}: ${
            e?.message ?? e
          }`,
        );
      }
      const mediaType = resolveMediaType(f.originalname, f.mimetype);
      return { index: i, file: f, retryPath, mediaType };
    });

    const startedAll = Date.now();

    // Promise.allSettled — one failure must not kill the other invoices.
    const settled = await Promise.allSettled(
      preserved.map((p) => this.analyzeOne(fundId, userId, p)),
    );

    const items: BatchItem[] = settled.map((r, i) => {
      const p = preserved[i];
      if (r.status === 'fulfilled') return r.value;
      const reason = r.reason;
      const code = this.classifyError(reason);
      return {
        index: p.index,
        status: 'error',
        fileName: p.file.originalname,
        fileSize: p.file.size,
        retryFilePath: p.retryPath,
        retryMimeType: p.mediaType ?? p.file.mimetype,
        error: {
          code,
          message: this.normalizeErrorMessage(reason),
          technical: reason?.stack
            ? String(reason.stack).slice(0, 500)
            : undefined,
          retryable: this.isRetryable(code),
        },
        processingTimeMs: Date.now() - startedAll,
      };
    });

    const successCount = items.filter((i) => i.status === 'success').length;
    const errorCount = items.length - successCount;

    // Cross-batch duplicate detection — flag invoices that look like other
    // invoices uploaded in the same batch.
    this.flagInBatchDuplicates(items);

    const totalMs = Date.now() - startedAll;

    try {
      await this.prisma.invoiceBatch.create({
        data: {
          id: batchId,
          userId,
          custodyFundId: fundId,
          totalFiles: items.length,
          successCount,
          errorCount,
          status: 'processing',
          totalProcessingTimeMs: totalMs,
        },
      });
    } catch (e: any) {
      this.logger.error(
        `[batch-ai] failed to persist batch row: ${e?.message ?? e}`,
      );
    }

    this.batches.set(batchId, {
      batchId,
      userId,
      fundId,
      items,
      createdAt: Date.now(),
      totalProcessingTimeMs: totalMs,
    });

    this.logger.log(
      `[batch-ai] batchAnalyze ok batchId=${batchId} fund=${fundId} user=${userId} ` +
        `total=${items.length} ok=${successCount} err=${errorCount} ms=${totalMs}`,
    );

    return {
      batchId,
      totalFiles: items.length,
      successCount,
      errorCount,
      totalProcessingTimeMs: totalMs,
      results: items.map(this.publicizeItem.bind(this)),
    };
  }

  private async analyzeOne(
    fundId: string,
    userId: string,
    p: {
      index: number;
      file: Express.Multer.File;
      retryPath: string;
      mediaType: FilePayload['mediaType'] | null;
    },
  ): Promise<BatchItemSuccess> {
    const started = Date.now();
    const result = await this.analyzer.analyze(fundId, userId, p.file);
    return {
      index: p.index,
      status: 'success',
      fileName: p.file.originalname,
      fileSize: p.file.size,
      retryFilePath: p.retryPath,
      retryMimeType: (p.mediaType ?? 'application/pdf') as FilePayload['mediaType'],
      extractionId: result.extractionId,
      fileUrl: result.fileUrl,
      analysisResult: result,
      processingTimeMs: Date.now() - started,
    };
  }

  // ── /batch-analyze/:batchId/retry ──────────────────────────────────────

  async batchRetry(
    fundId: string,
    userId: string,
    batchId: string,
    dto: BatchRetryDto,
  ) {
    const session = this.requireSession(batchId, userId, fundId);
    const startedAll = Date.now();

    const requested = new Set(dto.indices);
    const itemsToRetry = session.items.filter(
      (it): it is BatchItemError =>
        requested.has(it.index) && it.status === 'error',
    );
    if (itemsToRetry.length === 0) {
      throw new BadRequestException(
        'لا توجد عناصر فاشلة قابلة لإعادة المحاولة.',
      );
    }

    const settled = await Promise.allSettled(
      itemsToRetry.map(async (it) => {
        if (!fs.existsSync(it.retryFilePath)) {
          throw new BadRequestException(
            'انتهت صلاحية الملف الأصلي. يرجى إعادة رفع الفاتورة.',
          );
        }
        // The analyzer takes ownership of file.path (renames it); always work
        // on a duplicate so the retry copy survives multiple attempts.
        const fakeMulter = this.synthesizeMulter(it);
        const started = Date.now();
        const result = await this.analyzer.analyze(fundId, userId, fakeMulter);
        return {
          index: it.index,
          fileName: it.fileName,
          fileSize: it.fileSize,
          retryFilePath: it.retryFilePath,
          retryMimeType: it.retryMimeType as FilePayload['mediaType'],
          status: 'success' as const,
          extractionId: result.extractionId,
          fileUrl: result.fileUrl,
          analysisResult: result,
          processingTimeMs: Date.now() - started,
        };
      }),
    );

    settled.forEach((r, i) => {
      const original = itemsToRetry[i];
      const idx = session.items.findIndex((x) => x.index === original.index);
      if (idx < 0) return;
      if (r.status === 'fulfilled') {
        session.items[idx] = r.value;
      } else {
        const reason = r.reason;
        const code = this.classifyError(reason);
        session.items[idx] = {
          ...original,
          error: {
            code,
            message: this.normalizeErrorMessage(reason),
            technical: reason?.stack
              ? String(reason.stack).slice(0, 500)
              : undefined,
            retryable: this.isRetryable(code),
          },
          processingTimeMs: Date.now() - startedAll,
        };
      }
    });

    this.flagInBatchDuplicates(session.items);

    const successCount = session.items.filter(
      (i) => i.status === 'success',
    ).length;
    const errorCount = session.items.length - successCount;

    try {
      await this.prisma.invoiceBatch.update({
        where: { id: batchId },
        data: { successCount, errorCount },
      });
    } catch {
      /* best-effort */
    }

    this.logger.log(
      `[batch-ai] batchRetry batchId=${batchId} retried=${itemsToRetry.length} ` +
        `nowOk=${successCount} nowErr=${errorCount}`,
    );

    return {
      batchId,
      totalFiles: session.items.length,
      successCount,
      errorCount,
      totalProcessingTimeMs: Date.now() - startedAll,
      results: session.items.map(this.publicizeItem.bind(this)),
    };
  }

  private synthesizeMulter(it: BatchItemError): Express.Multer.File {
    const ext = path.extname(it.retryFilePath);
    const dir = path.dirname(it.retryFilePath);
    const tmp = path.join(
      dir,
      `${path.basename(it.retryFilePath, ext)}-attempt-${Date.now()}${ext}`,
    );
    fs.copyFileSync(it.retryFilePath, tmp);
    return {
      fieldname: 'files',
      originalname: it.fileName,
      encoding: '7bit',
      mimetype: it.retryMimeType,
      size: fs.statSync(tmp).size,
      destination: dir,
      filename: path.basename(tmp),
      path: tmp,
      buffer: undefined as any,
      stream: undefined as any,
    };
  }

  // ── /batch-save ────────────────────────────────────────────────────────

  async batchSave(userId: string, dto: BatchSaveDto) {
    const session = this.batches.get(dto.batchId);
    if (!session) {
      throw new NotFoundException(
        'لم يُعثر على جلسة الدفعة. ربما انتهت صلاحيتها — يرجى إعادة رفع الفواتير.',
      );
    }
    if (session.userId !== userId) {
      throw new BadRequestException('هذه الجلسة ليست لك.');
    }

    const successByIndex = new Map<number, BatchItemSuccess>();
    for (const it of session.items) {
      if (it.status === 'success') successByIndex.set(it.index, it);
    }

    for (const inv of dto.invoices) {
      const it = successByIndex.get(inv.index);
      if (!it) {
        throw new BadRequestException(
          `الفاتورة #${inv.index + 1} غير موجودة أو لم تنجح في التحليل.`,
        );
      }
    }

    // Re-check the fund is still open right before persistence.
    const fund = await this.prisma.custodyFund.findUnique({
      where: { id: session.fundId },
      select: { status: true },
    });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    if (fund.status === 'closed') {
      throw new BadRequestException(
        'العهدة مُقفلة — لا يمكن حفظ الفواتير.',
      );
    }

    // Read all temp files BEFORE the transaction so a single FS error doesn't
    // leave us with a partial save.
    const filesToPersist: Array<{
      it: BatchItemSuccess;
      inv: BatchSaveItemDto;
      buffer: Buffer | null;
    }> = [];
    for (const inv of dto.invoices) {
      const it = successByIndex.get(inv.index)!;
      let buffer: Buffer | null = null;
      try {
        const preview = this.analyzer.preview(it.extractionId, userId);
        buffer = fs.readFileSync(preview.filePath);
      } catch (e: any) {
        this.logger.warn(
          `[batch-ai] could not read pending file for index=${inv.index}: ${
            e?.message ?? e
          }`,
        );
      }
      filesToPersist.push({ it, inv, buffer });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const { it, inv, buffer } of filesToPersist) {
        const row = await tx.custodyFundInvoice.create({
          data: {
            custodyFundId: session.fundId,
            batchId: session.batchId,
            invoiceName: inv.editedData.vendorName,
            amount: inv.editedData.totalAmount,
            invoiceDate: new Date(inv.editedData.invoiceDate),
            notes: inv.notes,
            attachmentData: buffer ? new Uint8Array(buffer) : undefined,
            attachmentMimeType: it.retryMimeType,
            attachmentSizeBytes: buffer?.length,
            attachmentOriginalName: it.fileName,
            vendorName: inv.editedData.vendorName,
            vendorTaxNumber: inv.editedData.vendorTaxNumber ?? null,
            aiExtracted: true,
            aiConfidence: inv.editedData.confidence ?? null,
            aiCategory:
              inv.category ??
              it.analysisResult.classification.suggestedCategory,
            aiRiskLevel: it.analysisResult.riskAssessment.level,
            aiRiskScore: it.analysisResult.riskAssessment.score,
            aiRiskFlags: it.analysisResult.riskAssessment.flags,
            aiExtractionId: it.extractionId,
            aiProcessedAt: new Date(),
            aiRawResponse: {
              extracted: inv.editedData as any,
              suggestedCategory:
                it.analysisResult.classification.suggestedCategory,
              notes: inv.notes ?? null,
              invoiceNumber: inv.editedData.invoiceNumber,
              risk: it.analysisResult.riskAssessment,
              duplicateCheck: it.analysisResult.duplicateCheck,
              budgetImpact: it.analysisResult.budgetImpact,
            } as any,
            createdById: userId,
          },
        });
        ids.push(row.id);
      }
      await tx.invoiceBatch.update({
        where: { id: session.batchId },
        data: {
          savedCount: ids.length,
          status:
            ids.length === session.items.length
              ? 'completed'
              : 'partially_saved',
          savedAt: new Date(),
          completedAt: new Date(),
        },
      });
      return ids;
    });

    // Cleanup pending sessions + temp files (best-effort; failure here doesn't
    // affect the user-visible save outcome).
    for (const { it } of filesToPersist) {
      try {
        await this.analyzer.cancel(session.fundId, userId, it.extractionId);
      } catch {
        /* ignore */
      }
    }
    this.cleanupBatchDir(session.batchId);
    this.batches.delete(session.batchId);

    this.logger.log(
      `[batch-ai] batchSave ok batchId=${session.batchId} saved=${created.length}`,
    );

    return {
      batchId: session.batchId,
      savedCount: created.length,
      invoiceIds: created,
    };
  }

  // ── /batch-discard ─────────────────────────────────────────────────────

  async batchDiscard(fundId: string, userId: string, batchId: string) {
    const session = this.batches.get(batchId);
    if (!session) return { detail: 'expired or unknown' };
    if (session.fundId !== fundId || session.userId !== userId) {
      throw new BadRequestException('ليس لديك صلاحية إلغاء هذه الدفعة.');
    }
    for (const it of session.items) {
      if (it.status === 'success') {
        try {
          await this.analyzer.cancel(fundId, userId, it.extractionId);
        } catch {
          /* ignore */
        }
      }
    }
    this.cleanupBatchDir(batchId);
    this.batches.delete(batchId);
    try {
      await this.prisma.invoiceBatch.update({
        where: { id: batchId },
        data: { status: 'discarded', completedAt: new Date() },
      });
    } catch {
      /* best-effort */
    }
    return { detail: 'discarded' };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private requireSession(
    batchId: string,
    userId: string,
    fundId: string,
  ): BatchSession {
    const session = this.batches.get(batchId);
    if (!session) {
      throw new NotFoundException(
        'لم يُعثر على جلسة الدفعة. ربما انتهت صلاحيتها — يرجى إعادة رفع الفواتير.',
      );
    }
    if (session.userId !== userId) {
      throw new BadRequestException('هذه الجلسة ليست لك.');
    }
    if (session.fundId !== fundId) {
      throw new BadRequestException('الدفعة تخص عهدة مختلفة.');
    }
    return session;
  }

  private flagInBatchDuplicates(items: BatchItem[]) {
    const successes = items.filter(
      (i): i is BatchItemSuccess => i.status === 'success',
    );
    if (successes.length < 2) return;

    for (const a of successes) {
      const others: CandidateInvoice[] = successes
        .filter((b) => b !== a)
        .map((b) => ({
          id: `batch-${b.index}`,
          vendorName: b.analysisResult.extracted.vendorName,
          invoiceNumber: b.analysisResult.extracted.invoiceNumber,
          totalAmount: b.analysisResult.extracted.totalAmount,
          invoiceDate: new Date(b.analysisResult.extracted.invoiceDate),
        }));
      const inBatch = detectDuplicates(
        {
          vendorName: a.analysisResult.extracted.vendorName,
          invoiceNumber: a.analysisResult.extracted.invoiceNumber,
          totalAmount: a.analysisResult.extracted.totalAmount,
          invoiceDate: a.analysisResult.extracted.invoiceDate,
        },
        others,
      );
      if (inBatch.similarInvoices.length === 0) continue;
      const merged = a.analysisResult.duplicateCheck.similarInvoices.concat(
        inBatch.similarInvoices.map((s) => ({
          ...s,
          id: `${s.id}-in-batch`,
        })),
      );
      a.analysisResult = {
        ...a.analysisResult,
        duplicateCheck: {
          isDuplicate:
            a.analysisResult.duplicateCheck.isDuplicate || inBatch.isDuplicate,
          similarInvoices: merged.slice(0, 5),
        },
      };
    }
  }

  private classifyError(err: any): string {
    if (!err) return 'AI_PROVIDER_ERROR';
    if (err instanceof BadRequestException) {
      const msg = String(err.message ?? '').toLowerCase();
      if (msg.includes('فارغ')) return 'CORRUPT_FILE';
      if (msg.includes('غير مدعوم')) return 'UNSUPPORTED_FORMAT';
      if (msg.includes('قراءة الفاتورة')) return 'UNREADABLE_FILE';
      return 'CORRUPT_FILE';
    }
    if (err instanceof HttpException) {
      const status = err.getStatus?.();
      if (status === 503) return 'AI_PROVIDER_ERROR';
      if (status === 429) return 'RATE_LIMITED';
    }
    if (err.code === 'ETIMEDOUT' || /timeout/i.test(err.message ?? '')) {
      return 'AI_TIMEOUT';
    }
    return 'AI_PROVIDER_ERROR';
  }

  private isRetryable(code: string): boolean {
    return (
      code === 'AI_TIMEOUT' ||
      code === 'AI_PROVIDER_ERROR' ||
      code === 'RATE_LIMITED' ||
      code === 'UNREADABLE_FILE'
    );
  }

  private normalizeErrorMessage(err: any): string {
    if (!err) return 'تعذّر تحليل الفاتورة';
    if (err instanceof HttpException) {
      const r = err.getResponse?.();
      if (typeof r === 'object' && r && 'message' in r) {
        const m = (r as any).message;
        if (Array.isArray(m)) return m.join(' · ');
        if (typeof m === 'string') return m;
      }
      return err.message || 'تعذّر تحليل الفاتورة';
    }
    return String(err.message ?? err).slice(0, 300);
  }

  private publicizeItem(it: BatchItem) {
    if (it.status === 'success') {
      return {
        index: it.index,
        status: it.status,
        fileName: it.fileName,
        fileSize: it.fileSize,
        extractionId: it.extractionId,
        fileUrl: it.fileUrl,
        analysisResult: it.analysisResult,
        processingTimeMs: it.processingTimeMs,
      };
    }
    return {
      index: it.index,
      status: it.status,
      fileName: it.fileName,
      fileSize: it.fileSize,
      error: it.error,
      processingTimeMs: it.processingTimeMs,
    };
  }

  private cleanupBatchDir(batchId: string) {
    const dir = path.join(BATCH_TEMP_DIR, batchId);
    try {
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          try {
            fs.unlinkSync(path.join(dir, f));
          } catch {
            /* ignore */
          }
        }
        fs.rmdirSync(dir);
      }
    } catch {
      /* ignore */
    }
  }

  private cleanupMulterScratch(files: Express.Multer.File[]) {
    for (const f of files) {
      if (f.path && fs.existsSync(f.path)) {
        try {
          fs.unlinkSync(f.path);
        } catch {
          /* best-effort */
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpiredBatches() {
    const cutoff = Date.now() - BATCH_TTL_MS;
    for (const [id, s] of this.batches.entries()) {
      if (s.createdAt < cutoff) {
        this.cleanupBatchDir(id);
        this.batches.delete(id);
        try {
          await this.prisma.invoiceBatch.update({
            where: { id },
            data: { status: 'discarded', completedAt: new Date() },
          });
        } catch {
          /* best-effort */
        }
      }
    }
    // Also clean orphaned dirs on disk (e.g., after a process restart).
    try {
      const dirs = fs.readdirSync(BATCH_TEMP_DIR);
      for (const d of dirs) {
        const full = path.join(BATCH_TEMP_DIR, d);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory() && stat.mtimeMs < cutoff) {
            for (const f of fs.readdirSync(full)) {
              try {
                fs.unlinkSync(path.join(full, f));
              } catch {
                /* ignore */
              }
            }
            fs.rmdirSync(full);
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
}
