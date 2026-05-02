import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttendanceManualStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * Manual overrides on top of the auto-derived daily summaries.
 *
 * Why a separate table instead of fields on PdfDailyAttendanceSummary:
 * reanalyze() / re-ingest blow away every summary row for an upload and
 * rebuild from raw PdfAttendanceRecord punches. If the manual edit lived
 * on the summary, it would silently disappear the next time someone hit
 * "إعادة تحليل". Keying by (employeeId, reportDate) — independent of
 * which upload the summary belongs to — keeps human edits durable.
 */
@Injectable()
export class AttendanceOverrideService {
  private readonly logger = new Logger(AttendanceOverrideService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    params: { employeeId: string; date: Date; status: AttendanceManualStatus; reason?: string | null },
    editorId: string,
  ) {
    const { employeeId, date, status, reason } = params;
    if (!employeeId) throw new BadRequestException('معرّف الموظف مطلوب');

    const employee = await this.prisma.pdfAttendanceEmployee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true },
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');

    // Normalize the date to a UTC date-only boundary so the unique index
    // matches regardless of which timezone the request was sent in.
    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);

    const existing = await this.prisma.attendanceStatusOverride.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
      select: { id: true, status: true, reason: true },
    });

    const result = existing
      ? await this.prisma.attendanceStatusOverride.update({
          where: { id: existing.id },
          data: { status, reason: reason ?? null, editedById: editorId, editedAt: new Date() },
        })
      : await this.prisma.attendanceStatusOverride.create({
          data: { employeeId, date: day, status, reason: reason ?? null, editedById: editorId },
        });

    // Always log — even no-ops get an entry, so the audit trail is
    // complete enough for a "who-changed-what-when" answer.
    await this.prisma.attendanceStatusOverrideLog.create({
      data: {
        overrideId: result.id,
        employeeId,
        date: day,
        previousStatus: existing?.status ?? null,
        newStatus: status,
        reason: reason ?? null,
        editedById: editorId,
      },
    });

    this.logger.log(
      `Override ${existing ? 'updated' : 'created'} employee=${employeeId} date=${day.toISOString().slice(0, 10)} status=${status} editor=${editorId}`,
    );
    return result;
  }

  async remove(employeeId: string, date: Date) {
    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);
    const existing = await this.prisma.attendanceStatusOverride.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
      select: { id: true, status: true },
    });
    if (!existing) return { removed: false };

    await this.prisma.$transaction([
      this.prisma.attendanceStatusOverrideLog.create({
        data: {
          employeeId,
          date: day,
          previousStatus: existing.status,
          // The log enum can't represent "removed"; we record the previous
          // status and leave newStatus as PRESENT (caller can detect a
          // remove by querying the override table — log is a paper trail).
          newStatus: existing.status,
          reason: 'إزالة التعديل اليدوي',
          editedById: 'system',
        },
      }),
      this.prisma.attendanceStatusOverride.delete({ where: { id: existing.id } }),
    ]);
    return { removed: true };
  }

  /** Bulk-fetch overrides for a date range — used by the analytics service
   *  to layer manual edits on top of every summary row in one shot. */
  async listForRange(from: Date, to: Date, scope?: { employeeIds?: string[] | null }) {
    const where: Prisma.AttendanceStatusOverrideWhereInput = {
      date: { gte: from, lte: to },
    };
    if (scope?.employeeIds && scope.employeeIds.length > 0) {
      where.employeeId = { in: scope.employeeIds };
    }
    return this.prisma.attendanceStatusOverride.findMany({
      where,
      select: { employeeId: true, date: true, status: true, reason: true, editedAt: true },
    });
  }

  async history(employeeId: string, date: Date) {
    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);
    return this.prisma.attendanceStatusOverrideLog.findMany({
      where: { employeeId, date: day },
      orderBy: { editedAt: 'desc' },
      include: {
        editor: { select: { id: true, name: true, nameAr: true, email: true } },
      },
      take: 20,
    });
  }
}
