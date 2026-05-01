import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, DistributionDiscrepancySeverity } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { DistributionTrackAccessGuard } from './guards/distribution-track-access.guard';
import { UploadFileDto } from './dto/upload-file.dto';
import { DistributionFileParserService } from './services/distribution-file-parser.service';
import { DistributionComparisonService } from './services/distribution-comparison.service';
import type { ComparisonResult } from './interfaces/analyzer.types';

/**
 * Phase 1 — owner of the analyzer session lifecycle. The heavy work
 * (file parsing, Claude Vision extraction, comparison engine, report
 * generation) lives in dedicated sibling services added in later phases.
 *
 * What this Phase 1 service does today:
 *   - Validates uploads (size, MIME) and creates a PENDING session row
 *     with the file bytes persisted to Postgres.
 *   - Lists / fetches / deletes sessions, scoped by ownership + role.
 *   - Returns 501-style placeholders for actions whose engines aren't
 *     wired yet (export, run analysis), so the controller surface is
 *     stable for the frontend stub.
 */

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/octet-stream', // fallback for browsers that mis-tag
]);

const ALLOWED_EXT = new Set(['.xlsx', '.xls', '.csv', '.pdf', '.jpg', '.jpeg', '.png', '.webp']);

@Injectable()
export class DistributionAnalyzerService {
  private readonly logger = new Logger(DistributionAnalyzerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessGuard: DistributionTrackAccessGuard,
    private readonly parser: DistributionFileParserService,
    private readonly comparator: DistributionComparisonService,
  ) {}

  // ─── Upload — Phase 1 creates the row, Phase 2 wires the queue ───
  async createSession(
    file: Express.Multer.File,
    userId: string,
    dto: UploadFileDto,
  ) {
    if (!file) throw new BadRequestException('يرجى رفع ملف Excel/CSV/PDF أو صورة');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('حجم الملف يتجاوز الحد المسموح به (20 ميجابايت)');
    }
    const ext = (file.originalname.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) && !ALLOWED_EXT.has(ext)) {
      throw new BadRequestException('نوع الملف غير مدعوم');
    }

    const trackId = this.accessGuard.getDistributionTrackId();
    if (!trackId) throw new ForbiddenException('مسار التوزيع غير معرّف في النظام');

    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const session = await this.prisma.distributionAnalysisSession.create({
      data: {
        userId,
        trackId,
        fileName: file.originalname,
        originalFileName: file.originalname,
        fileType: file.mimetype || 'application/octet-stream',
        fileSize: file.size,
        fileBytes: file.buffer as any, // Postgres Bytes — stored so the file survives Railway redeploys
        fileChecksum: checksum,
        dateRangeStart: dto.dateRangeStart ? new Date(dto.dateRangeStart) : null,
        dateRangeEnd: dto.dateRangeEnd ? new Date(dto.dateRangeEnd) : null,
        centerFilter: dto.centerFilter ?? 'all',
        analysisDepth: dto.analysisDepth ?? 'COMPREHENSIVE',
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true, fileName: true, fileSize: true },
    });
    this.logger.log(`Created session=${session.id} user=${userId} file="${file.originalname}" size=${file.size}B`);
    return {
      sessionId: session.id,
      status: session.status,
      fileName: session.fileName,
      fileSize: session.fileSize,
      createdAt: session.createdAt,
    };
  }

  // ─── Read APIs ───
  async listSessions(userId: string, role: string, page = 1, limit = 20, status?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.DistributionAnalysisSessionWhereInput = {
      // Non-privileged users only see their own sessions; admin/system_manager see all.
      ...(role === 'admin' || role === 'system_manager' ? {} : { userId }),
      ...(status ? { status: status as any } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.distributionAnalysisSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          fileType: true,
          status: true,
          matchPercentage: true,
          totalRows: true,
          matchedRows: true,
          mismatchedRows: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      this.prisma.distributionAnalysisSession.count({ where }),
    ]);
    return { data, pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) } };
  }

  async getSession(sessionId: string, userId: string, role: string) {
    const session = await this.prisma.distributionAnalysisSession.findUnique({
      where: { id: sessionId },
      include: {
        discrepancies: { orderBy: [{ severity: 'asc' }, { rowIdentifier: 'asc' }] },
      },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    this.assertOwnerOrPrivileged(session.userId, userId, role);
    // Strip fileBytes — never sent over JSON; downloaded via separate endpoint.
    const { fileBytes: _omit, ...safe } = session;
    return safe;
  }

  async deleteSession(sessionId: string, userId: string, role: string) {
    const session = await this.prisma.distributionAnalysisSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    this.assertOwnerOrPrivileged(session.userId, userId, role);
    await this.prisma.distributionAnalysisSession.delete({ where: { id: sessionId } });
    return { deleted: true };
  }

  // ─── Run analysis (full pipeline) ─────────────────────────────────────
  async runAnalysis(sessionId: string, userId: string) {
    const session = await this.prisma.distributionAnalysisSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (session.userId !== userId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!owner || (owner.role !== 'admin' && owner.role !== 'system_manager')) {
        throw new ForbiddenException('ليس لديك صلاحية لتشغيل هذه الجلسة');
      }
    }
    if (!session.fileBytes) {
      throw new BadRequestException('الملف الأصلي غير محفوظ — أعد رفعه لتشغيل التحليل');
    }

    const startedAt = Date.now();
    await this.prisma.distributionAnalysisSession.update({
      where: { id: sessionId },
      data: { status: 'PARSING', errorMessage: null },
    });

    try {
      // 1) Parse / extract
      await this.prisma.distributionAnalysisSession.update({
        where: { id: sessionId },
        data: { status: 'EXTRACTING' },
      });
      const buffer = Buffer.from(session.fileBytes);
      const extracted = await this.parser.parse(buffer, session.fileType, session.fileName);
      if (extracted.rows.length === 0) {
        throw new BadRequestException(
          'لم يتم استخراج أي صفوف من الملف. تأكد من أن الجدول يحتوي على بيانات وأن الأعمدة تطابق المخطط المتوقع.',
        );
      }

      // 2) Compare against the platform window
      await this.prisma.distributionAnalysisSession.update({
        where: { id: sessionId },
        data: { status: 'ANALYZING' },
      });
      const platform = await this.comparator.loadPlatformWindow(extracted, {
        dateFrom: session.dateRangeStart,
        dateTo: session.dateRangeEnd,
        center: (session.centerFilter as 'makkah' | 'madinah' | 'all' | null) ?? 'all',
      });
      const comparison = this.comparator.compare(extracted, platform);

      // 3) Persist headline numbers + JSON snapshots
      const updated = await this.prisma.distributionAnalysisSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          extractedData: extracted as any,
          platformData: platform as any,
          comparisonResult: comparison as any,
          matchPercentage: comparison.matchPercentage,
          totalRows: comparison.totalRows,
          matchedRows: comparison.matchedRows,
          mismatchedRows: comparison.mismatchedRows,
          aiModel: extracted.modelUsed ?? 'n/a',
          aiInputTokens: extracted.inputTokens ?? null,
          aiOutputTokens: extracted.outputTokens ?? null,
          processingTimeMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });

      // 4) Replace discrepancies (drop + insert keeps re-runs idempotent)
      await this.prisma.distributionAnalysisDiscrepancy.deleteMany({ where: { sessionId } });
      const discRows = comparison.rowComparisons
        .filter((r) => r.type !== 'VALUE_MISMATCH' || r.severity !== 'LOW')
        .slice(0, 500)
        .map((r) => ({
          sessionId,
          rowIdentifier: r.rowIdentifier,
          fieldName: r.fieldName ?? r.type,
          uploadedValue: r.extractedValue == null ? null : String(r.extractedValue),
          platformValue: r.platformValue == null ? null : String(r.platformValue),
          difference: r.difference,
          severity: r.severity as DistributionDiscrepancySeverity,
        }));
      if (discRows.length) {
        await this.prisma.distributionAnalysisDiscrepancy.createMany({ data: discRows });
      }

      this.logger.log(
        `Analysis ok session=${sessionId} match=${comparison.matchPercentage}% disc=${discRows.length} (${updated.processingTimeMs}ms)`,
      );
      return this.getSession(sessionId, userId, 'admin');
    } catch (err: any) {
      this.logger.error(`Analysis failed session=${sessionId}: ${err?.message}`);
      await this.prisma.distributionAnalysisSession.update({
        where: { id: sessionId },
        data: {
          status: 'FAILED',
          errorMessage: String(err?.message ?? err).slice(0, 2000),
          processingTimeMs: Date.now() - startedAt,
        },
      });
      if (err instanceof BadRequestException || err instanceof ForbiddenException) throw err;
      throw new BadRequestException(err?.message || 'فشل تشغيل التحليل');
    }
  }

  // ─── Export (Phase 5: DOCX/Excel) ─────────────────────────────────────
  async exportReport(_sessionId: string, _userId: string, _role: string): Promise<never> {
    throw new BadRequestException(
      'تصدير التقارير قيد التجهيز — سيتم تفعيله في المرحلة التالية',
    );
  }

  // ─── helpers ───
  private assertOwnerOrPrivileged(ownerId: string, userId: string, role: string) {
    if (ownerId === userId) return;
    if (role === 'admin' || role === 'system_manager') return;
    throw new ForbiddenException('ليس لديك صلاحية للوصول لهذه الجلسة');
  }
}
