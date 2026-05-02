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

  /**
   * Apply the same status to many (employee, date) pairs in one transaction.
   * Performance-critical: a 500-cell selection across 30 employees and 17
   * days fires once and we don't want N round-trips. Strategy:
   *   1. one findMany() to load every existing override for the input set
   *   2. one createMany() for new rows + per-row update for changed rows
   *      (Prisma can't bulk update with different where clauses, but the
   *      updates run inside the transaction so the whole batch is atomic)
   *   3. one createMany() for the audit logs
   *
   * Skips writes when the existing override already matches `status` (to
   * keep the log clean — the user dragging across 100 cells where 80 are
   * already correct should not produce 80 no-op log entries).
   */
  async bulkUpsert(
    cells: Array<{ employeeId: string; date: string }>,
    status: AttendanceManualStatus,
    reason: string | null,
    editorId: string,
  ): Promise<{ total: number; updated: number; created: number; skipped: number }> {
    if (!Array.isArray(cells) || cells.length === 0) {
      throw new BadRequestException('لم يتم تحديد أي خلايا');
    }
    if (cells.length > 500) {
      throw new BadRequestException('الحد الأقصى 500 خلية لكل عملية');
    }

    // De-duplicate by (employeeId, date) — drag selection can produce dupes
    // when the rectangle math is sloppy or the user toggles the same cell.
    const seen = new Set<string>();
    const normalised: Array<{ employeeId: string; date: Date; key: string }> = [];
    for (const c of cells) {
      if (!c?.employeeId || !c?.date) continue;
      const day = new Date(c.date);
      if (Number.isNaN(day.getTime())) continue;
      day.setUTCHours(0, 0, 0, 0);
      const key = `${c.employeeId}|${day.toISOString().slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalised.push({ employeeId: c.employeeId, date: day, key });
    }

    return this.prisma.$transaction(
      async (tx) => {
        const employeeIds = [...new Set(normalised.map((n) => n.employeeId))];
        const dates = [...new Set(normalised.map((n) => n.date.getTime()))].map((ms) => new Date(ms));

        const existing = await tx.attendanceStatusOverride.findMany({
          where: { employeeId: { in: employeeIds }, date: { in: dates } },
          select: { id: true, employeeId: true, date: true, status: true },
        });
        const byKey = new Map<string, (typeof existing)[number]>();
        for (const e of existing) {
          byKey.set(`${e.employeeId}|${e.date.toISOString().slice(0, 10)}`, e);
        }

        const toCreate: Array<{ employeeId: string; date: Date }> = [];
        const toUpdate: Array<{ id: string; previous: AttendanceManualStatus }> = [];
        let skipped = 0;

        for (const n of normalised) {
          const cur = byKey.get(n.key);
          if (!cur) {
            toCreate.push({ employeeId: n.employeeId, date: n.date });
          } else if (cur.status === status) {
            skipped += 1;
          } else {
            toUpdate.push({ id: cur.id, previous: cur.status });
          }
        }

        // Creates as one batch.
        if (toCreate.length > 0) {
          await tx.attendanceStatusOverride.createMany({
            data: toCreate.map((c) => ({
              employeeId: c.employeeId,
              date: c.date,
              status,
              reason,
              editedById: editorId,
            })),
            skipDuplicates: true,
          });
        }

        // Updates run sequentially because the WHERE differs per row, but
        // they're all inside the same transaction so the whole batch
        // commits or rolls back together.
        for (const u of toUpdate) {
          await tx.attendanceStatusOverride.update({
            where: { id: u.id },
            data: { status, reason, editedById: editorId, editedAt: new Date() },
          });
        }

        // Audit log — every actual change gets one row. Re-fetch the new
        // rows so log carries the current overrideId for created entries.
        const refreshed = await tx.attendanceStatusOverride.findMany({
          where: { employeeId: { in: employeeIds }, date: { in: dates } },
          select: { id: true, employeeId: true, date: true },
        });
        const refreshedByKey = new Map<string, string>();
        for (const r of refreshed) {
          refreshedByKey.set(`${r.employeeId}|${r.date.toISOString().slice(0, 10)}`, r.id);
        }

        const logs: Array<{
          overrideId: string | null;
          employeeId: string;
          date: Date;
          previousStatus: AttendanceManualStatus | null;
          newStatus: AttendanceManualStatus;
          reason: string | null;
          editedById: string;
        }> = [];
        for (const n of normalised) {
          const cur = byKey.get(n.key);
          if (cur && cur.status === status) continue; // skipped
          logs.push({
            overrideId: refreshedByKey.get(n.key) ?? null,
            employeeId: n.employeeId,
            date: n.date,
            previousStatus: cur?.status ?? null,
            newStatus: status,
            reason,
            editedById: editorId,
          });
        }
        if (logs.length > 0) {
          await tx.attendanceStatusOverrideLog.createMany({ data: logs });
        }

        const total = normalised.length;
        const updated = toUpdate.length;
        const created = toCreate.length;
        this.logger.log(
          `Bulk override: total=${total} updated=${updated} created=${created} skipped=${skipped} editor=${editorId}`,
        );
        return { total, updated, created, skipped };
      },
      { timeout: 30000 },
    );
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
