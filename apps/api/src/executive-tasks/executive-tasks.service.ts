import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateExecutiveTaskDto, UpdateExecutiveTaskDto } from './executive-tasks.dto';

const STATUS_LABEL_MAP: Record<string, string> = {
  'تم الارسال': 'sent',
  'قيد التنفيذ': 'in_progress',
  'قيد التعديل': 'editing',
  'تم التعديل': 'edited',
  'معتمد': 'approved',
  'مكتملة': 'completed',
  'مكتمل': 'completed',
};

@Injectable()
export class ExecutiveTasksService {
  private readonly logger = new Logger(ExecutiveTasksService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(params?: {
    search?: string;
    status?: string;
    sheetName?: string;
    track?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const {
      search,
      status,
      sheetName,
      track,
      page = 1,
      pageSize = 50,
      sortBy = 'sortOrder',
      sortOrder = 'asc',
    } = params || {};

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { track: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { responsible: { contains: search, mode: 'insensitive' } },
        { followUp: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) where.status = status;
    if (sheetName) where.sheetName = sheetName;
    if (track) where.track = { contains: track, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.executiveTask.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.executiveTask.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async stats() {
    const [total, byStatus, bySheet, byTrack] = await Promise.all([
      this.prisma.executiveTask.count(),
      this.prisma.executiveTask.groupBy({ by: ['status'], _count: true }),
      this.prisma.executiveTask.groupBy({ by: ['sheetName'], _count: true }),
      this.prisma.executiveTask.groupBy({
        by: ['track'],
        _count: true,
        where: { track: { not: null } },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s) => (statusMap[s.status] = s._count));

    const sheetMap: Record<string, number> = {};
    bySheet.forEach((s) => (sheetMap[s.sheetName] = s._count));

    const trackMap: Record<string, number> = {};
    byTrack.forEach((t) => {
      if (t.track) trackMap[t.track] = t._count;
    });

    return {
      total,
      byStatus: statusMap,
      bySheet: sheetMap,
      byTrack: trackMap,
    };
  }

  async sheets() {
    const sheets = await this.prisma.executiveTask.groupBy({
      by: ['sheetName'],
      _count: true,
    });
    return sheets.map((s) => ({ name: s.sheetName, count: s._count }));
  }

  async findOne(id: string) {
    const task = await this.prisma.executiveTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('المهمة غير موجودة');
    return task;
  }

  private normalizeDates(dto: any): any {
    const dateFields = ['receiveDate', 'lastActionDate', 'dueDate', 'deliveryDate'];
    const result = { ...dto };
    for (const field of dateFields) {
      if (result[field] && typeof result[field] === 'string') {
        // Convert "2026-03-14" to full ISO DateTime
        if (/^\d{4}-\d{2}-\d{2}$/.test(result[field])) {
          result[field] = new Date(result[field] + 'T00:00:00.000Z');
        } else {
          result[field] = new Date(result[field]);
        }
      }
    }
    return result;
  }

  async create(dto: CreateExecutiveTaskDto) {
    return this.prisma.executiveTask.create({ data: this.normalizeDates(dto) });
  }

  async update(id: string, dto: UpdateExecutiveTaskDto) {
    await this.findOne(id);
    return this.prisma.executiveTask.update({ where: { id }, data: this.normalizeDates(dto) });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.executiveTask.delete({ where: { id } });
  }

  // ─── Excel Import ───

  parseStatusLabel(arabicStatus: string | null): string {
    if (!arabicStatus) return 'in_progress';
    const trimmed = arabicStatus.trim();
    return STATUS_LABEL_MAP[trimmed] || 'in_progress';
  }

  async importFromData(rows: Array<Record<string, any>>, sheetName: string) {
    this.logger.log(`Importing ${rows.length} rows for sheet "${sheetName}"`);

    // Delete existing rows for this sheet before re-import
    await this.prisma.executiveTask.deleteMany({ where: { sheetName } });

    const tasks = rows.map((row, idx) => ({
      sheetName,
      name: (row.name || row['الاسم'] || row['المهمة'] || '').toString().trim(),
      status: this.parseStatusLabel(row.status || row['الحالة']) as any,
      track: (row.track || row['المسار'] || row['المسؤولية'] || null)?.toString().trim() || null,
      entity: (row.entity || row['الجهة'] || null)?.toString().trim() || null,
      responsible: (row.responsible || row['المسؤولية'] || null)?.toString().trim() || null,
      followUp: (row.followUp || row['المتابعة'] || null)?.toString().trim() || null,
      receiveDate: this.parseDate(row.receiveDate || row['تاريخ استلام'] || row['تاريخ الطلب ']),
      lastActionDate: this.parseDate(row.lastActionDate || row['تاريخ اخر اجراء']),
      dueDate: this.parseDate(row.dueDate || row['تاريخ استحقاق']),
      deliveryDate: this.parseDate(row.deliveryDate || row['تسليم الطلب']),
      notes: (row.notes || row['الملاحظات'] || row['ملاحظات'] || null)?.toString().trim() || null,
      sortOrder: idx,
    })).filter((t) => t.name && t.name.length > 0);

    if (tasks.length === 0) {
      this.logger.warn(`No valid rows found in sheet "${sheetName}"`);
      return { imported: 0 };
    }

    await this.prisma.executiveTask.createMany({ data: tasks });
    this.logger.log(`Imported ${tasks.length} tasks for sheet "${sheetName}"`);
    return { imported: tasks.length };
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const str = value.toString().trim();
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
}
