import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PDFParse } from 'pdf-parse';
import { cleanPdfText, extractReportDate, parsePunches, ParsedPunch } from '../utils/pdf-text-cleaner';
import { matchEmployee, MatchCandidate } from '../utils/name-matcher';
import { analyzeDay } from '../utils/analyzer';
import { Prisma, PdfShiftType } from '@prisma/client';

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
        fileName: upload.fileName,
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

  async listUploads() {
    return this.prisma.pdfAttendanceUpload.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        fileName: true,
        reportDate: true,
        totalRecords: true,
        matchedCount: true,
        unmatchedCount: true,
        createdAt: true,
      },
    });
  }
}
