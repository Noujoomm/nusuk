import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AbsenceStatus, Prisma } from '@prisma/client';
import {
  BulkAbsenceDto,
  GetEmployeesByTrackBookletDto,
} from '../dto/absence.dto';

@Injectable()
export class AbsenceService {
  private readonly logger = new Logger(AbsenceService.name);

  constructor(private prisma: PrismaService) {}

  async getEmployeesByTrackAndBooklet(dto: GetEmployeesByTrackBookletDto) {
    const targetDate = parseDateOnly(dto.date);

    const [track, booklet] = await Promise.all([
      this.prisma.track.findFirst({ where: { id: dto.trackId, isActive: true } }),
      this.prisma.booklet.findFirst({
        where: { id: dto.bookletId, trackId: dto.trackId, isActive: true },
      }),
    ]);
    if (!track) throw new NotFoundException('المسار غير موجود');
    if (!booklet) throw new NotFoundException('الكراسة غير موجودة أو لا تنتمي لهذا المسار');

    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        trackId: dto.trackId,
        bookletId: dto.bookletId,
        isActive: true,
        startDate: { lte: targetDate },
        OR: [{ endDate: null }, { endDate: { gte: targetDate } }],
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            fullNameAr: true,
            position: true,
            positionAr: true,
            email: true,
            phone: true,
            department: true,
            status: true,
          },
        },
      },
      orderBy: { employee: { fullNameAr: 'asc' } },
    });

    const todaysAbsences = await this.prisma.absence.findMany({
      where: {
        trackId: dto.trackId,
        bookletId: dto.bookletId,
        absenceDate: targetDate,
      },
      select: { id: true, employeeId: true, type: true, status: true, reason: true, hours: true },
    });
    const absenceMap = new Map(todaysAbsences.map((a) => [a.employeeId, a]));

    return {
      track: { id: track.id, name: track.name, nameAr: track.nameAr },
      booklet: { id: booklet.id, code: booklet.code, nameAr: booklet.nameAr },
      date: targetDate,
      totalEmployees: assignments.length,
      employees: assignments.map((a) => ({
        ...a.employee,
        existingAbsence: absenceMap.get(a.employee.id) || null,
      })),
    };
  }

  async createBulkAbsence(recordedById: string, dto: BulkAbsenceDto) {
    const absenceDate = parseDateOnly(dto.absenceDate);

    // Validate track + booklet exist and match
    const booklet = await this.prisma.booklet.findFirst({
      where: { id: dto.bookletId, trackId: dto.trackId, isActive: true },
    });
    if (!booklet) throw new NotFoundException('الكراسة غير موجودة أو لا تنتمي لهذا المسار');

    // Confirm all submitted employees are actually assigned to this booklet
    const validAssignments = await this.prisma.employeeAssignment.findMany({
      where: {
        trackId: dto.trackId,
        bookletId: dto.bookletId,
        employeeId: { in: dto.employees.map((e) => e.employeeId) },
        isActive: true,
      },
      select: { employeeId: true },
    });
    const validIds = new Set(validAssignments.map((a) => a.employeeId));
    const invalid = dto.employees.filter((e) => !validIds.has(e.employeeId));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `الموظفون التالون غير مرتبطين بهذا المسار والكراسة: ${invalid.map((e) => e.employeeId).join(', ')}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const created: Array<Prisma.AbsenceGetPayload<{}>> = [];
      const skipped: Array<{ employeeId: string; error: string }> = [];

      for (const emp of dto.employees) {
        try {
          const absence = await tx.absence.upsert({
            where: {
              employeeId_absenceDate_type: {
                employeeId: emp.employeeId,
                absenceDate,
                type: emp.type,
              },
            },
            create: {
              employeeId: emp.employeeId,
              trackId: dto.trackId,
              bookletId: dto.bookletId,
              absenceDate,
              type: emp.type,
              status: AbsenceStatus.PENDING,
              reason: emp.reason || dto.globalReason,
              hours: emp.hours != null ? new Prisma.Decimal(emp.hours) : null,
              notes: emp.notes,
              recordedById,
            },
            update: {
              reason: emp.reason || dto.globalReason,
              hours: emp.hours != null ? new Prisma.Decimal(emp.hours) : null,
              notes: emp.notes,
              recordedById,
            },
          });
          created.push(absence);
        } catch (e: any) {
          skipped.push({ employeeId: emp.employeeId, error: e.message ?? 'unknown' });
        }
      }
      return { created, skipped };
    });

    this.logger.log(
      `Bulk absence: track=${dto.trackId} booklet=${dto.bookletId} date=${dto.absenceDate} created=${result.created.length} skipped=${result.skipped.length} by=${recordedById}`,
    );

    return {
      success: true,
      createdCount: result.created.length,
      skippedCount: result.skipped.length,
      created: result.created,
      skipped: result.skipped,
    };
  }

  async getAbsenceReport(trackId: string, bookletId: string, date: string) {
    const targetDate = parseDateOnly(date);

    const absences = await this.prisma.absence.findMany({
      where: { trackId, bookletId, absenceDate: targetDate },
      include: {
        employee: { select: { id: true, fullNameAr: true, fullName: true } },
        recordedBy: { select: { id: true, name: true, nameAr: true } },
        approvedBy: { select: { id: true, name: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byType = absences.reduce<Record<string, number>>((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});

    return { date: targetDate, totalAbsences: absences.length, byType, absences };
  }

  async approve(id: string, approverId: string) {
    const existing = await this.prisma.absence.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('سجل الغياب غير موجود');
    return this.prisma.absence.update({
      where: { id },
      data: {
        status: AbsenceStatus.APPROVED,
        approvedById: approverId,
        approvedAt: new Date(),
      },
    });
  }

  async reject(id: string, approverId: string) {
    const existing = await this.prisma.absence.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('سجل الغياب غير موجود');
    return this.prisma.absence.update({
      where: { id },
      data: {
        status: AbsenceStatus.REJECTED,
        approvedById: approverId,
        approvedAt: new Date(),
      },
    });
  }

  async deleteAbsence(id: string) {
    const existing = await this.prisma.absence.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('سجل الغياب غير موجود');
    await this.prisma.absence.delete({ where: { id } });
    return { message: 'تم حذف سجل الغياب' };
  }
}

// Postgres `@db.Date` columns are stored at UTC-midnight. Parse YYYY-MM-DD
// the same way so equality queries hit the right row regardless of TZ.
function parseDateOnly(input?: string): Date {
  const raw = input ?? new Date().toISOString().slice(0, 10);
  return new Date(`${raw}T00:00:00.000Z`);
}
