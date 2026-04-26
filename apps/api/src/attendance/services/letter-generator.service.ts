import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  buildLetter,
  deriveShortName,
  AbsenceEntry,
  GeneratedLetter,
  DEFAULT_RECIPIENT,
} from '../utils/letter-formatter';

/**
 * Generates the official Arabic absence letter from stored attendance data.
 *
 * IMPORTANT: only `status='absent'` rows are considered absences for the
 * letter. on_call_no_visit, incomplete_hours, check_in_only / check_out_only,
 * online, and unscheduled are deliberately excluded — they describe other
 * states and would mislead the recipient.
 */
@Injectable()
export class LetterGeneratorService {
  private readonly logger = new Logger(LetterGeneratorService.name);

  constructor(private prisma: PrismaService) {}

  /** Letter for one daily report (one upload). */
  async generateDailyLetter(uploadId: string, recipientName?: string): Promise<GeneratedLetter> {
    const upload = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
      select: { reportDate: true },
    });
    if (!upload) throw new NotFoundException('الرفعة غير موجودة');

    const absences = await this.prisma.pdfDailyAttendanceSummary.findMany({
      where: { uploadId, status: 'absent' },
      include: { employee: { select: { id: true, fullName: true, track: true } } },
      orderBy: [{ employee: { track: 'asc' } }, { employee: { fullName: 'asc' } }],
    });

    const letter = buildLetter({
      recipientName: recipientName?.trim() || DEFAULT_RECIPIENT,
      reportType: 'daily',
      reportDate: upload.reportDate,
      absences: absences.map<AbsenceEntry>((s) => ({
        employeeId: s.employeeId,
        fullName: s.employee.fullName,
        shortName: deriveShortName(s.employee.fullName),
        track: s.employee.track,
        absenceDates: [s.reportDate],
      })),
    });

    this.logger.log(
      `Daily letter for upload=${uploadId} reportDate=${upload.reportDate.toISOString().slice(0, 10)} absences=${letter.metadata.uniqueEmployees}`,
    );
    return letter;
  }

  /**
   * Letter for a date range. Groups every employee's absences across the
   * range so each employee appears once with the right form (single day /
   * continuous / scattered).
   */
  async generateRangeLetter(
    rangeStart: Date,
    rangeEnd: Date,
    recipientName?: string,
    options?: { noteAboutLastDay?: boolean },
  ): Promise<GeneratedLetter> {
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      throw new NotFoundException('تواريخ غير صحيحة');
    }
    if (rangeEnd.getTime() < rangeStart.getTime()) {
      throw new NotFoundException('تاريخ النهاية قبل تاريخ البداية');
    }

    const summaries = await this.prisma.pdfDailyAttendanceSummary.findMany({
      where: {
        reportDate: { gte: rangeStart, lte: rangeEnd },
        status: 'absent',
      },
      include: { employee: { select: { id: true, fullName: true, track: true } } },
      orderBy: [{ employee: { track: 'asc' } }, { employee: { fullName: 'asc' } }, { reportDate: 'asc' }],
    });

    // Group by employee — one AbsenceEntry per person with all their dates.
    const byEmployee = new Map<string, AbsenceEntry>();
    for (const s of summaries) {
      const existing = byEmployee.get(s.employeeId);
      if (existing) {
        existing.absenceDates.push(s.reportDate);
      } else {
        byEmployee.set(s.employeeId, {
          employeeId: s.employeeId,
          fullName: s.employee.fullName,
          shortName: deriveShortName(s.employee.fullName),
          track: s.employee.track,
          absenceDates: [s.reportDate],
        });
      }
    }

    // Note about last day: only meaningful when caller asked AND no absence
    // landed on the rangeEnd day.
    let noteAboutLastDay = false;
    if (options?.noteAboutLastDay) {
      const lastDayHasAbsence = summaries.some((s) => isSameDayUtc(s.reportDate, rangeEnd));
      noteAboutLastDay = !lastDayHasAbsence;
    }

    const letter = buildLetter({
      recipientName: recipientName?.trim() || DEFAULT_RECIPIENT,
      reportType: 'range',
      rangeStart,
      rangeEnd,
      absences: Array.from(byEmployee.values()),
      noteAboutLastDay,
    });

    this.logger.log(
      `Range letter ${rangeStart.toISOString().slice(0, 10)}→${rangeEnd.toISOString().slice(0, 10)} absences=${letter.metadata.uniqueEmployees} totalDays=${letter.metadata.totalAbsences}`,
    );
    return letter;
  }
}

function isSameDayUtc(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
