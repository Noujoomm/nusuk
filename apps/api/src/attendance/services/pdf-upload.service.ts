import { Injectable, BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PDFParse } from 'pdf-parse';
import { createHash } from 'crypto';
import { cleanPdfText, extractReportDate, parsePunches, ParsedPunch } from '../utils/pdf-text-cleaner';
import { matchEmployee, MatchCandidate } from '../utils/name-matcher';
import { analyzeDay } from '../utils/analyzer';
import { Prisma, PdfShiftType } from '@prisma/client';
import { fixStoredFilename } from '../../common/fix-filename';

@Injectable()
export class PdfUploadService {
  private readonly logger = new Logger(PdfUploadService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * End-to-end ingestion of a single daily PDF:
   *  1. parse text into ParsedPunch[]
   *  2. match each row against the seeded employee master list
   *  3. persist Upload + Records + per-employee DailySummary in one transaction
   *  4. learn: when a fuzzy/token match resolves a previously-unlinked
   *     employee number, save it back to the candidate so next upload hits
   *     the fast `employee_number` path.
   */
  async ingest(
    fileName: string,
    fileSize: number,
    buffer: Buffer,
    uploadedBy: string | null,
  ) {
    // ─── 1. Parse PDF ─────────────────────────────────────────────────
    let rawText = '';
    let parsed: ParsedPunch[] = [];
    let reportDate: Date | null = null;
    try {
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      rawText = data.text || '';
      const lines = cleanPdfText(rawText);
      reportDate = extractReportDate(lines);
      parsed = parsePunches(lines);
    } catch (err: any) {
      throw new BadRequestException(`فشل قراءة ملف PDF: ${err?.message || err}`);
    }

    if (!reportDate) {
      throw new BadRequestException('لم يتم العثور على تاريخ التقرير في رأس الملف');
    }
    if (parsed.length === 0) {
      throw new BadRequestException('لم يتم استخراج أي سجلات بصمة من الملف');
    }

    // ─── 1b. Reject duplicates for the same report date ──────────────────
    // The biometric system emits one PDF per day; re-uploading the same date
    // would silently double-count records and break the daily summary.
    // Caller must DELETE the prior upload first if they really want to redo.
    const existing = await this.prisma.pdfAttendanceUpload.findFirst({
      where: { reportDate, status: 'processed' },
      select: { id: true, fileName: true },
    });
    if (existing) {
      throw new ConflictException(
        `يوجد ملف مرفوع مسبقاً بتاريخ ${reportDate.toISOString().slice(0, 10)} (${fixStoredFilename(existing.fileName)}). احذفه أولاً ثم أعد الرفع.`,
      );
    }

    // ─── 1c. Hash for integrity check on later download ──────────────────
    const fileChecksum = createHash('sha256').update(buffer).digest('hex');

    // ─── 2. Match against master list ──────────────────────────────────
    const employees = await this.prisma.pdfAttendanceEmployee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        normalizedName: true,
        employeeNumber: true,
        aliases: true,
        shiftType: true,
      },
    });

    const candidates: MatchCandidate[] = employees.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      normalizedName: e.normalizedName,
      employeeNumber: e.employeeNumber,
      aliases: e.aliases,
    }));
    const shiftById = new Map(employees.map((e) => [e.id, e.shiftType]));

    interface EnrichedRecord extends ParsedPunch {
      employeeId: string | null;
      isMatched: boolean;
      matchConfidence: number | null;
      matchMethod: string | null;
    }
    const enriched: EnrichedRecord[] = [];
    const numbersToLearn = new Map<string, string>(); // employeeId → number

    for (const p of parsed) {
      const m = matchEmployee(p.rawName, p.rawEmployeeNumber, candidates);
      enriched.push({
        ...p,
        employeeId: m?.candidateId ?? null,
        isMatched: m != null,
        matchConfidence: m?.confidence ?? null,
        matchMethod: m?.method ?? null,
      });
      if (m && m.method !== 'employee_number') {
        // Discovered the employee# for this candidate — remember to back-fill it.
        const existing = candidates.find((c) => c.id === m.candidateId);
        if (existing && !existing.employeeNumber && p.rawEmployeeNumber) {
          existing.employeeNumber = p.rawEmployeeNumber;
          numbersToLearn.set(m.candidateId, p.rawEmployeeNumber);
        }
      }
    }

    const matchedCount = enriched.filter((r) => r.isMatched).length;
    const unmatchedCount = enriched.length - matchedCount;

    // ─── 3. Persist ────────────────────────────────────────────────────
    const upload = await this.prisma.$transaction(async (tx) => {
      const up = await tx.pdfAttendanceUpload.create({
        data: {
          fileName,
          fileSize,
          mimeType: 'application/pdf',
          fileChecksum,
          // Cast: Prisma typings expect Uint8Array<ArrayBuffer> exactly, but
          // Node Buffer is Uint8Array<ArrayBufferLike>. The bytes are
          // identical at runtime — the cast is safe.
          fileData: buffer as any, // ← stored in Postgres so it survives Railway redeploys
          reportDate,
          uploadedBy,
          totalRecords: parsed.length,
          matchedCount,
          unmatchedCount,
          rawText: rawText.slice(0, 50000), // cap to keep row size sane
          status: 'processed',
        },
      });

      // Persist every record (matched or not — unmatched ones are surfaced for manual link-up).
      if (enriched.length > 0) {
        await tx.pdfAttendanceRecord.createMany({
          data: enriched.map((r) => ({
            uploadId: up.id,
            employeeId: r.employeeId,
            rawEmployeeNumber: r.rawEmployeeNumber,
            rawName: r.rawName,
            rawDepartment: r.rawDepartment,
            recordDate: r.recordDate,
            recordTime: r.recordTime,
            punchType: r.punchType,
            workCode: r.workCode,
            dataSource: r.dataSource,
            isMatched: r.isMatched,
            matchConfidence: r.matchConfidence,
            matchMethod: r.matchMethod,
          })),
        });
      }

      // Build per-employee summaries for EVERY active employee — including
      // ones with zero records today (so absences show up explicitly).
      const recordsByEmployee = new Map<string, EnrichedRecord[]>();
      for (const r of enriched) {
        if (!r.employeeId) continue;
        const list = recordsByEmployee.get(r.employeeId) ?? [];
        list.push(r);
        recordsByEmployee.set(r.employeeId, list);
      }

      const summaries: Prisma.PdfDailyAttendanceSummaryUncheckedCreateInput[] = [];
      for (const emp of employees) {
        const empRecords = recordsByEmployee.get(emp.id) ?? [];
        const analysis = analyzeDay(
          empRecords.map((r) => ({ recordTime: r.recordTime, punchType: r.punchType })),
          emp.shiftType as PdfShiftType,
        );
        summaries.push({
          uploadId: up.id,
          employeeId: emp.id,
          reportDate: reportDate!,
          firstCheckIn: analysis.firstCheckIn,
          lastCheckOut: analysis.lastCheckOut,
          totalHours: analysis.totalHours,
          recordsCount: analysis.recordsCount,
          status: analysis.status,
          flags: analysis.flags,
        });
      }
      if (summaries.length > 0) {
        await tx.pdfDailyAttendanceSummary.createMany({ data: summaries });
      }

      // Back-fill discovered employee numbers
      for (const [empId, num] of numbersToLearn) {
        await tx.pdfAttendanceEmployee.update({
          where: { id: empId },
          data: { employeeNumber: num },
        }).catch((err) => {
          // A unique-constraint violation just means another employee already
          // claims this number — log and move on rather than abort the whole txn.
          this.logger.warn(`Could not back-fill empNum=${num} for employee=${empId}: ${err.message}`);
        });
      }

      return up;
    }, { timeout: 60000 });

    this.logger.log(
      `PDF ingest done: upload=${upload.id} date=${reportDate.toISOString().slice(0, 10)} records=${parsed.length} matched=${matchedCount} unmatched=${unmatchedCount}`,
    );

    return {
      uploadId: upload.id,
      reportDate: reportDate.toISOString().slice(0, 10),
      totalRecords: parsed.length,
      matchedCount,
      unmatchedCount,
      employeesAnalyzed: employees.length,
    };
  }

  /**
   * Returns the daily report for one upload — every employee's summary plus
   * the unmatched raw records for the manual-link UI.
   */
  async getDailyReport(uploadId: string) {
    const upload = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
    });
    if (!upload) throw new NotFoundException('الرفعة غير موجودة');

    const summaries = await this.prisma.pdfDailyAttendanceSummary.findMany({
      where: { uploadId },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            track: true,
            trackDetail: true,
            employeeNumber: true,
            shiftType: true,
            scheduledCheckIn: true,
            scheduledCheckOut: true,
            center: true,
            worksByCharter: true,
          },
        },
      },
      orderBy: [{ employee: { track: 'asc' } }, { employee: { fullName: 'asc' } }],
    });

    const unmatched = await this.prisma.pdfAttendanceRecord.findMany({
      where: { uploadId, isMatched: false },
      select: {
        id: true,
        rawEmployeeNumber: true,
        rawName: true,
        rawDepartment: true,
        recordTime: true,
        punchType: true,
      },
      orderBy: [{ rawEmployeeNumber: 'asc' }, { recordTime: 'asc' }],
    });

    return {
      upload: {
        id: upload.id,
        fileName: fixStoredFilename(upload.fileName),
        reportDate: upload.reportDate.toISOString().slice(0, 10),
        totalRecords: upload.totalRecords,
        matchedCount: upload.matchedCount,
        unmatchedCount: upload.unmatchedCount,
        createdAt: upload.createdAt,
      },
      summaries,
      unmatched,
    };
  }

  /**
   * Paginated list of past uploads. Each row carries a per-track absence
   * breakdown so the history page can show "أين كانت الغيابات" at a glance
   * without loading the full daily report.
   */
  async listUploads(query: {
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 30));

    const where: Prisma.PdfAttendanceUploadWhereInput = {};
    if (query.from || query.to) {
      where.reportDate = {};
      if (query.from) where.reportDate.gte = new Date(`${query.from}T00:00:00.000Z`);
      if (query.to) where.reportDate.lte = new Date(`${query.to}T00:00:00.000Z`);
    }

    const [items, total] = await Promise.all([
      this.prisma.pdfAttendanceUpload.findMany({
        where,
        orderBy: { reportDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          reportDate: true,
          status: true,
          totalRecords: true,
          matchedCount: true,
          unmatchedCount: true,
          fileChecksum: true,
          uploadedBy: true,
          createdAt: true,
          _count: { select: { downloads: true } },
        },
      }),
      this.prisma.pdfAttendanceUpload.count({ where }),
    ]);

    // Cheap per-track absence breakdown — one grouped query per upload set
    // beats N+1, and the result is small (uploads × tracks).
    const uploadIds = items.map((u) => u.id);
    const breakdownRows = uploadIds.length
      ? await this.prisma.pdfDailyAttendanceSummary.findMany({
          where: { uploadId: { in: uploadIds }, status: 'absent' },
          select: { uploadId: true, employee: { select: { track: true } } },
        })
      : [];

    const trackBreakdownByUpload = new Map<string, Record<string, number>>();
    for (const row of breakdownRows) {
      const map = trackBreakdownByUpload.get(row.uploadId) ?? {};
      const t = row.employee.track || 'غير محدد';
      map[t] = (map[t] ?? 0) + 1;
      trackBreakdownByUpload.set(row.uploadId, map);
    }

    return {
      items: items.map((u) => ({
        ...u,
        fileName: fixStoredFilename(u.fileName),
        absencesByTrack: trackBreakdownByUpload.get(u.id) ?? {},
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Returns the original PDF bytes + filename. Records the download in the
   * audit table so we can later answer "who pulled this and when".
   */
  async downloadFile(
    uploadId: string,
    requestInfo: { userId?: string | null; ipAddress?: string; userAgent?: string },
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string; checksum: string | null }> {
    const upload = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
      select: { fileName: true, mimeType: true, fileChecksum: true, fileData: true },
    });
    if (!upload) throw new NotFoundException('الرفعة غير موجودة');
    if (!upload.fileData) {
      throw new NotFoundException('الملف الأصلي غير محفوظ لهذه الرفعة (ربما تم رفعها قبل تفعيل التخزين)');
    }

    await this.prisma.pdfAttendanceFileDownload.create({
      data: {
        uploadId,
        downloadedBy: requestInfo.userId ?? null,
        ipAddress: requestInfo.ipAddress,
        userAgent: requestInfo.userAgent?.slice(0, 1000), // cap absurdly long UA strings
      },
    });

    return {
      buffer: Buffer.from(upload.fileData),
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      checksum: upload.fileChecksum,
    };
  }

  /** Hard delete — drops Upload + cascades Records/Summaries/Downloads. */
  async deleteUpload(uploadId: string): Promise<void> {
    const exists = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('الرفعة غير موجودة');

    await this.prisma.pdfAttendanceUpload.delete({ where: { id: uploadId } });
    this.logger.log(`Deleted upload=${uploadId}`);
  }

  async getDownloadHistory(uploadId: string) {
    return this.prisma.pdfAttendanceFileDownload.findMany({
      where: { uploadId },
      orderBy: { downloadedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Recompute every DailySummary for a single past upload using the CURRENT
   * analyzer logic. Used after deploying analyzer changes that affect status
   * mapping (e.g. the on_call split that replaces the deprecated `exempt`).
   *
   * Records and matches are left untouched — only summaries are rewritten.
   */
  async reanalyze(uploadId: string) {
    const upload = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
      select: { id: true, reportDate: true },
    });
    if (!upload) throw new NotFoundException('الرفعة غير موجودة');

    const employees = await this.prisma.pdfAttendanceEmployee.findMany({
      where: { isActive: true },
      select: { id: true, shiftType: true },
    });

    const records = await this.prisma.pdfAttendanceRecord.findMany({
      where: { uploadId, isMatched: true },
      select: { employeeId: true, recordTime: true, punchType: true },
    });

    const recordsByEmployee = new Map<string, Array<{ recordTime: string; punchType: 'check_in' | 'check_out' }>>();
    for (const r of records) {
      if (!r.employeeId) continue;
      const list = recordsByEmployee.get(r.employeeId) ?? [];
      list.push({ recordTime: r.recordTime, punchType: r.punchType as 'check_in' | 'check_out' });
      recordsByEmployee.set(r.employeeId, list);
    }

    let updated = 0;
    let created = 0;

    await this.prisma.$transaction(async (tx) => {
      // Wipe and recreate the summaries for this upload — simpler and safer
      // than per-row diffs when the analyzer's status set has expanded.
      await tx.pdfDailyAttendanceSummary.deleteMany({ where: { uploadId } });

      const data: Prisma.PdfDailyAttendanceSummaryUncheckedCreateInput[] = [];
      for (const emp of employees) {
        const empRecords = recordsByEmployee.get(emp.id) ?? [];
        const analysis = analyzeDay(empRecords, emp.shiftType as PdfShiftType);
        data.push({
          uploadId,
          employeeId: emp.id,
          reportDate: upload.reportDate,
          firstCheckIn: analysis.firstCheckIn,
          lastCheckOut: analysis.lastCheckOut,
          totalHours: analysis.totalHours,
          recordsCount: analysis.recordsCount,
          status: analysis.status,
          flags: analysis.flags,
        });
      }
      if (data.length > 0) {
        await tx.pdfDailyAttendanceSummary.createMany({ data });
        created = data.length;
      }
    }, { timeout: 60000 });

    this.logger.log(`Re-analyzed upload=${uploadId}: ${created} summaries written (${updated} updated)`);
    return { uploadId, summariesWritten: created };
  }

  /** Re-analyze every past upload — admin maintenance after analyzer changes. */
  async reanalyzeAll() {
    const uploads = await this.prisma.pdfAttendanceUpload.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const results: Array<{ uploadId: string; summariesWritten: number }> = [];
    for (const u of uploads) {
      try {
        const r = await this.reanalyze(u.id);
        results.push(r);
      } catch (err: any) {
        this.logger.error(`Re-analyze failed for upload=${u.id}: ${err.message}`);
        results.push({ uploadId: u.id, summariesWritten: -1 });
      }
    }
    return { totalUploads: uploads.length, results };
  }
}
