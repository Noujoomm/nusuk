import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { DistributionTrackAccessGuard } from './guards/distribution-track-access.guard';
import { UploadFileDto } from './dto/upload-file.dto';

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

  // ─── Phase 2+ stubs (intentionally NotImplemented for now) ───
  async runAnalysis(_sessionId: string, _userId: string): Promise<never> {
    throw new BadRequestException(
      'محرك التحليل قيد التجهيز — سيتم تفعيله في المرحلة التالية',
    );
  }

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
