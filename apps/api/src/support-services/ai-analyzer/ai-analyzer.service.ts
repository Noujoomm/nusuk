import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { CustodyFundsService } from '../../custody-funds/custody-funds.service';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  FilePayload,
  readAsBase64,
  resolveMediaType,
} from './utils/file-to-base64';
import {
  CandidateInvoice,
  detectDuplicates,
  DuplicateCheck,
} from './utils/duplicate-detector';
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
} from './prompts/extraction.prompt';
import {
  CATEGORY_OPTIONS,
  CLASSIFICATION_RISK_SYSTEM_PROMPT,
  buildClassificationRiskUserPrompt,
} from './prompts/classification-risk.prompt';
import { InvoiceExtractionDto } from './dto/invoice-extraction.dto';
import { AIConfirmDto } from './dto/ai-confirm.dto';

/**
 * AI Invoice Analyzer for `CustodyFund` (v2) — this is the custody model
 * actually surfaced on /support-services in the UI. A parallel `CustodyInvoice`
 * v1 model exists in the schema but is not currently reachable from the
 * dashboard, so the analyzer targets v2 only.
 */

const COST_USD_PER_MTOK_INPUT = 3;
const COST_USD_PER_MTOK_OUTPUT = 15;
const USD_TO_SAR = 3.75;

const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp', 'ai-invoices');
const TEMP_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_PER_HOUR = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_VISION_ITERATIONS = 3;

export interface AnalyzeResult {
  success: true;
  extractionId: string;
  fileUrl: string;
  extracted: InvoiceExtractionDto;
  classification: { suggestedCategory: string; reasoning: string };
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    score: number;
    flags: string[];
    reasoning: string;
  };
  duplicateCheck: DuplicateCheck;
  budgetImpact: {
    currentBalance: number;
    afterDeduction: number;
    percentageUsed: number;
    alertLevel: 'ok' | 'warning' | 'critical';
  };
}

interface PendingAnalysis {
  extractionId: string;
  fundId: string;
  userId: string;
  filePath: string;
  fileName: string;
  mediaType: FilePayload['mediaType'];
  extracted: InvoiceExtractionDto;
  categorySuggestion: string;
  createdAt: number;
}

@Injectable()
export class AIAnalyzerService {
  private readonly logger = new Logger(AIAnalyzerService.name);
  private client: Anthropic | null = null;

  private readonly rateHits = new Map<string, number[]>();
  private readonly pending = new Map<string, PendingAnalysis>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly funds: CustodyFundsService,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) this.client = new Anthropic({ apiKey });
    else this.logger.warn('ANTHROPIC_API_KEY not set — AI invoice analyzer will 503');

    try {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    } catch { /* best-effort */ }
  }

  // ── /ai-analyze ─────────────────────────────────────────────────────────

  async analyze(
    fundId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<AnalyzeResult> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'محلل الفواتير غير متاح حالياً: ANTHROPIC_API_KEY غير مضبوط.',
      );
    }
    if (!this.rateOk(userId)) {
      throw new HttpException(
        'تجاوزت الحد المسموح لتحليل الفواتير (20 تحليل/ساعة). حاول لاحقاً.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const fund = await this.prisma.custodyFund.findUnique({
      where: { id: fundId },
      select: {
        id: true,
        currentBalance: true,
        totalAmount: true,
        status: true,
      },
    });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    if (fund.status === 'closed') {
      throw new BadRequestException('العهدة مُقفلة — لا يمكن تحليل فواتير جديدة.');
    }

    if (!file || !file.size) throw new BadRequestException('الملف فارغ.');
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('حجم الملف يتجاوز 10 ميجابايت.');
    }

    const mediaType = resolveMediaType(file.originalname, file.mimetype);
    if (!mediaType) {
      throw new BadRequestException(
        'نوع الملف غير مدعوم. يُقبل فقط: PDF, PNG, JPG, JPEG, WEBP, GIF.',
      );
    }

    const extractionId = randomUUID();
    const targetName = `${Date.now()}-${extractionId}${path.extname(file.originalname)}`;
    const targetPath = path.join(TEMP_DIR, targetName);

    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.renameSync(file.path, targetPath);
      } catch {
        fs.copyFileSync(file.path, targetPath);
        try { fs.unlinkSync(file.path); } catch { /* best-effort */ }
      }
    } else if (file.buffer) {
      fs.writeFileSync(targetPath, file.buffer);
    } else {
      throw new BadRequestException('تعذّرت قراءة محتوى الملف.');
    }

    const started = Date.now();
    const logRow = await this.prisma.aIExtractionLog.create({
      data: {
        custodyId: fundId, // we're reusing the column as "fund id"
        userId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: mediaType,
        status: 'pending',
        extractionId,
      },
    });

    try {
      const { base64, sizeBytes } = readAsBase64(targetPath);
      const { extracted, tokensIn, tokensOut } = await this.visionExtract(
        base64,
        mediaType,
      );

      const extractionDto = this.coerceExtractionDto(extracted);

      // Historical context from this fund's past 90 days of invoices.
      const history = await this.prisma.custodyFundInvoice.findMany({
        where: {
          custodyFundId: fundId,
          invoiceDate: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          vendorName: true,
          invoiceName: true,
          amount: true,
          invoiceDate: true,
          aiCategory: true,
        },
        take: 200,
      });

      const historicalCategories = Array.from(
        new Set(history.map((h) => h.aiCategory).filter(Boolean) as string[]),
      );
      const avgInvoice =
        history.length > 0
          ? history.reduce((s, h) => s + h.amount, 0) / history.length
          : 0;
      const isNewVendor =
        !history.some(
          (h) =>
            (h.vendorName ?? h.invoiceName ?? '').toLowerCase().trim() ===
            (extractionDto.vendorName ?? '').toLowerCase().trim(),
        );
      const daysOld = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(extractionDto.invoiceDate).getTime()) / 86_400_000,
        ),
      );

      const { classification, risk, tokensIn: cIn, tokensOut: cOut } =
        await this.classifyAndScore({
          extracted: extractionDto as unknown as Record<string, unknown>,
          historicalCategories,
          currentBalance: fund.currentBalance,
          averageInvoice: Number(avgInvoice.toFixed(2)),
          daysOld,
          isNewVendor,
        });

      const duplicateCheck = detectDuplicates(
        {
          vendorName: extractionDto.vendorName,
          invoiceNumber: extractionDto.invoiceNumber,
          totalAmount: extractionDto.totalAmount,
          invoiceDate: extractionDto.invoiceDate,
        },
        history.map<CandidateInvoice>((h) => ({
          id: h.id,
          vendorName: h.vendorName ?? h.invoiceName,
          invoiceNumber: null, // v2 doesn't have an invoice number column
          totalAmount: h.amount,
          invoiceDate: h.invoiceDate,
        })),
      );

      const budgetImpact = this.computeBudgetImpact(
        fund.currentBalance,
        fund.totalAmount,
        extractionDto.totalAmount,
      );

      this.pending.set(extractionId, {
        extractionId,
        fundId,
        userId,
        filePath: targetPath,
        fileName: file.originalname,
        mediaType,
        extracted: extractionDto,
        categorySuggestion: classification.suggestedCategory,
        createdAt: Date.now(),
      });

      const totalTokensIn = tokensIn + cIn;
      const totalTokensOut = tokensOut + cOut;
      await this.prisma.aIExtractionLog.update({
        where: { id: logRow.id },
        data: {
          status: 'completed',
          tokensUsed: totalTokensIn + totalTokensOut,
          costInSar: Number(
            (
              ((totalTokensIn * COST_USD_PER_MTOK_INPUT +
                totalTokensOut * COST_USD_PER_MTOK_OUTPUT) /
                1_000_000) *
              USD_TO_SAR
            ).toFixed(4),
          ),
          processingTime: Date.now() - started,
        },
      });

      this.logger.log(
        `[ai-invoice] analyze ok fund=${fundId} user=${userId} file=${file.originalname} ` +
          `size=${sizeBytes}B tokens=${totalTokensIn + totalTokensOut} ms=${Date.now() - started}`,
      );

      return {
        success: true,
        extractionId,
        fileUrl: `/api/support-services/ai-invoice/preview/${extractionId}`,
        extracted: extractionDto,
        classification,
        riskAssessment: risk,
        duplicateCheck,
        budgetImpact,
      };
    } catch (err: any) {
      this.logger.error(
        `[ai-invoice] analyze failed fund=${fundId} file=${file.originalname}: ${err?.message ?? err}`,
      );
      try { fs.unlinkSync(targetPath); } catch { /* best-effort */ }
      await this.prisma.aIExtractionLog.update({
        where: { id: logRow.id },
        data: {
          status: 'failed',
          errorMessage: String(err?.message ?? err).slice(0, 2000),
          processingTime: Date.now() - started,
        },
      });
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        'تعذّر تحليل الفاتورة بالذكاء الاصطناعي. جرّب مرة أخرى أو أدخل البيانات يدوياً.',
      );
    }
  }

  // ── /ai-confirm ────────────────────────────────────────────────────────

  async confirm(fundId: string, userId: string, dto: AIConfirmDto) {
    const pending = this.pending.get(dto.extractionId);
    if (!pending) {
      throw new NotFoundException(
        'لم يُعثر على جلسة التحليل. ربما انتهت صلاحيتها — يرجى إعادة رفع الفاتورة.',
      );
    }
    if (pending.fundId !== fundId) {
      throw new BadRequestException('الجلسة تخص عهدة مختلفة.');
    }
    if (pending.userId !== userId) {
      throw new BadRequestException('هذه الجلسة ليست لك.');
    }

    const edited = dto.editedData;
    const categoryLabel = dto.category || pending.categorySuggestion;

    // Go through the existing CustodyFundsService so balance/alert logic and
    // downstream audit wiring stay identical to manual invoice creation.
    const created = await this.funds.addInvoice(
      fundId,
      {
        invoiceName: edited.vendorName,
        amount: edited.totalAmount,
        invoiceDate: edited.invoiceDate,
        notes: dto.notes ?? undefined,
      },
      userId,
    );

    // Stamp AI fields + persist the original file in Postgres.
    let attachmentData: Buffer | null = null;
    try {
      attachmentData = fs.readFileSync(pending.filePath);
    } catch (e: any) {
      this.logger.warn(
        `[ai-invoice] could not read temp file on confirm: ${e?.message ?? e}`,
      );
    }

    await this.prisma.custodyFundInvoice.update({
      where: { id: created.id },
      data: {
        vendorName: edited.vendorName,
        vendorTaxNumber: edited.vendorTaxNumber ?? null,
        attachmentOriginalName: pending.fileName,
        attachmentData: attachmentData ? new Uint8Array(attachmentData) : undefined,
        attachmentMimeType: pending.mediaType,
        attachmentSizeBytes: attachmentData?.length,
        aiExtracted: true,
        aiConfidence: edited.confidence ?? null,
        aiCategory: categoryLabel,
        aiExtractionId: dto.extractionId,
        aiProcessedAt: new Date(),
        aiRawResponse: {
          extracted: edited as any,
          suggestedCategory: pending.categorySuggestion,
          notes: dto.notes ?? null,
          invoiceNumber: edited.invoiceNumber,
        } as any,
      },
    });

    try { fs.unlinkSync(pending.filePath); } catch { /* best-effort */ }
    this.pending.delete(dto.extractionId);

    // Reload so the response includes the AI fields we just wrote.
    const finalInvoice = await this.prisma.custodyFundInvoice.findUnique({
      where: { id: created.id },
      include: {
        createdBy: { select: { id: true, nameAr: true } },
      },
    });
    return { invoice: finalInvoice, extractionId: dto.extractionId };
  }

  async cancel(fundId: string, userId: string, extractionId: string) {
    const pending = this.pending.get(extractionId);
    if (!pending) return { detail: 'expired or unknown' };
    if (pending.fundId !== fundId || pending.userId !== userId) {
      throw new BadRequestException('ليس لديك صلاحية إلغاء هذه الجلسة.');
    }
    try { fs.unlinkSync(pending.filePath); } catch { /* best-effort */ }
    this.pending.delete(extractionId);
    return { detail: 'cancelled' };
  }

  preview(
    extractionId: string,
    userId: string,
  ): { filePath: string; mediaType: string; fileName: string } {
    const pending = this.pending.get(extractionId);
    if (!pending) throw new NotFoundException('انتهت صلاحية المعاينة.');
    if (pending.userId !== userId) {
      throw new BadRequestException('ليس لديك صلاحية معاينة هذه الجلسة.');
    }
    return {
      filePath: pending.filePath,
      mediaType: pending.mediaType,
      fileName: pending.fileName,
    };
  }

  // ── Claude Vision + text calls ─────────────────────────────────────────

  private async visionExtract(
    base64: string,
    mediaType: FilePayload['mediaType'],
  ): Promise<{ extracted: Record<string, unknown>; tokensIn: number; tokensOut: number }> {
    const model =
      this.config.get('ANTHROPIC_MODEL_DEFAULT') || 'claude-sonnet-4-5';

    const imageBlock: any =
      mediaType === 'application/pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          }
        : {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          };

    return this.withRetries(async () => {
      const res = await this.client!.messages.create({
        model,
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [imageBlock, { type: 'text', text: EXTRACTION_USER_PROMPT }],
          } as any,
        ],
      });
      const textBlock = res.content.find((b: any) => b.type === 'text') as
        | { type: 'text'; text: string }
        | undefined;
      const raw = textBlock?.text ?? '';
      const parsed = this.parseJSON(raw);
      if (!parsed) throw new Error('Claude vision did not return valid JSON');
      if ((parsed as any).error === 'unreadable') {
        throw new BadRequestException(
          `تعذّر قراءة الفاتورة: ${(parsed as any).reason ?? 'غير معروف'}`,
        );
      }
      return {
        extracted: parsed as Record<string, unknown>,
        tokensIn: res.usage.input_tokens,
        tokensOut: res.usage.output_tokens,
      };
    });
  }

  private async classifyAndScore(input: {
    extracted: Record<string, unknown>;
    historicalCategories: string[];
    currentBalance: number;
    averageInvoice: number;
    daysOld: number;
    isNewVendor: boolean;
  }) {
    const model =
      this.config.get('ANTHROPIC_MODEL_DEFAULT') || 'claude-sonnet-4-5';
    return this.withRetries(async () => {
      const res = await this.client!.messages.create({
        model,
        max_tokens: 800,
        system: CLASSIFICATION_RISK_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildClassificationRiskUserPrompt(input),
          },
        ],
      });
      const raw =
        (res.content.find((b: any) => b.type === 'text') as any)?.text ?? '';
      const parsed = this.parseJSON(raw) as any;
      if (!parsed || !parsed.risk) {
        throw new Error('Classification/risk response malformed');
      }
      const category = CATEGORY_OPTIONS.includes(parsed.suggestedCategory)
        ? parsed.suggestedCategory
        : 'أخرى';
      const level: 'low' | 'medium' | 'high' = ['low', 'medium', 'high'].includes(
        parsed.risk.level,
      )
        ? parsed.risk.level
        : 'medium';
      return {
        classification: {
          suggestedCategory: category,
          reasoning: String(parsed.categoryReasoning ?? '').slice(0, 500),
        },
        risk: {
          level,
          score: Math.max(0, Math.min(100, Number(parsed.risk.score) || 50)),
          flags: Array.isArray(parsed.risk.flags)
            ? parsed.risk.flags.map((f: unknown) => String(f).slice(0, 200))
            : [],
          reasoning: String(parsed.risk.reasoning ?? '').slice(0, 1000),
        },
        tokensIn: res.usage.input_tokens,
        tokensOut: res.usage.output_tokens,
      };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < MAX_VISION_ITERATIONS; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        if (e instanceof BadRequestException) throw e;
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
    throw lastErr ?? new Error('unknown');
  }

  private parseJSON(raw: string): unknown | null {
    if (!raw) return null;
    const cleaned = raw
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(cleaned.slice(first, last + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private coerceExtractionDto(raw: Record<string, unknown>): InvoiceExtractionDto {
    const num = (v: unknown, d = 0): number => {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) && n >= 0 ? n : d;
    };
    const str = (v: unknown, fallback = ''): string =>
      typeof v === 'string' && v.trim() ? v.trim() : fallback;
    const items = Array.isArray(raw.items) ? (raw.items as any[]) : [];
    const totalAmount = num(raw.totalAmount);
    const vatAmount = num(raw.vatAmount);
    const subtotal = num(raw.subtotal, Math.max(0, totalAmount - vatAmount));
    const currency = ['SAR', 'USD', 'EUR', 'AED'].includes(raw.currency as string)
      ? (raw.currency as 'SAR' | 'USD' | 'EUR' | 'AED')
      : 'SAR';
    const confidence = Math.max(0, Math.min(1, num(raw.confidence, 0.5)));
    const invoiceDate = this.coerceDate(raw.invoiceDate);

    return {
      vendorName: str(raw.vendorName, 'مورد غير محدد'),
      vendorTaxNumber: (raw.vendorTaxNumber as string | null) ?? null,
      invoiceNumber: str(raw.invoiceNumber, 'INV-AUTO'),
      invoiceDate,
      hijriDate: (raw.hijriDate as string | null) ?? null,
      subtotal,
      vatAmount,
      vatPercentage: num(raw.vatPercentage, 15),
      totalAmount,
      currency,
      paymentMethod: (raw.paymentMethod as string | null) ?? null,
      items: items.map((i) => ({
        description: str(i?.description, '—'),
        quantity: num(i?.quantity),
        unitPrice: num(i?.unitPrice),
        total: num(i?.total),
      })),
      confidence,
    };
  }

  private coerceDate(raw: unknown): string {
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }

  private computeBudgetImpact(
    currentBalance: number,
    totalAmount: number,
    invoiceAmount: number,
  ) {
    const after = Math.max(0, currentBalance - invoiceAmount);
    const base = totalAmount > 0 ? totalAmount : currentBalance;
    const pct = base > 0 ? ((base - after) / base) * 100 : 0;
    const alertLevel: 'ok' | 'warning' | 'critical' =
      pct >= 95 ? 'critical' : pct >= 80 ? 'warning' : 'ok';
    return {
      currentBalance,
      afterDeduction: after,
      percentageUsed: Number(pct.toFixed(2)),
      alertLevel,
    };
  }

  private rateOk(userId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000;
    const prev = (this.rateHits.get(userId) ?? []).filter((t) => t > windowStart);
    if (prev.length >= RATE_LIMIT_PER_HOUR) {
      this.rateHits.set(userId, prev);
      return false;
    }
    prev.push(now);
    this.rateHits.set(userId, prev);
    return true;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpired() {
    const cutoff = Date.now() - TEMP_TTL_MS;
    for (const [id, p] of this.pending.entries()) {
      if (p.createdAt < cutoff) {
        try { fs.unlinkSync(p.filePath); } catch { /* best-effort */ }
        this.pending.delete(id);
      }
    }
    try {
      const entries = fs.readdirSync(TEMP_DIR);
      for (const name of entries) {
        const full = path.join(TEMP_DIR, name);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile() && stat.mtimeMs < cutoff) {
            fs.unlinkSync(full);
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
}
