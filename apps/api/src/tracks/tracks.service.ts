import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreateTrackDto,
  UpdateTrackDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateDeliverableDto,
  UpdateDeliverableDto,
  CreateScopeDto,
  UpdateScopeDto,
  CreateTrackKPIDto,
  UpdateTrackKPIDto,
  CreatePenaltyDto,
  UpdatePenaltyDto,
} from './tracks.dto';

@Injectable()
export class TracksService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, role: string) {
    // Admin and PM can see all tracks
    if (role === 'admin' || role === 'pm') {
      return this.prisma.track.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              tasks: true,
              employees: { where: { isDeleted: false } },
              deliverables: { where: { isDeleted: false } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
    }

    // Others see only tracks they have permission for
    const permissions = await this.prisma.trackPermission.findMany({
      where: { userId, permissions: { hasSome: ['view'] } },
      select: { trackId: true },
    });

    return this.prisma.track.findMany({
      where: { id: { in: permissions.map((p) => p.trackId) }, isActive: true },
      include: {
        _count: {
          select: {
            tasks: true,
            employees: { where: { isDeleted: false } },
            deliverables: { where: { isDeleted: false } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findById(id: string) {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tasks: true,
            employees: { where: { isDeleted: false } },
            deliverables: { where: { isDeleted: false } },
            kpis: { where: { isDeleted: false } },
            penalties: { where: { isDeleted: false } },
            scopes: { where: { isDeleted: false } },
          },
        },
        permissions: {
          include: { user: { select: { id: true, name: true, nameAr: true, role: true } } },
        },
        employees: { where: { isDeleted: false }, orderBy: { createdAt: 'asc' } },
        deliverables: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        kpis: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        penalties: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        scopes: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!track) throw new NotFoundException('المسار غير موجود');
    return track;
  }

  async create(dto: CreateTrackDto) {
    return this.prisma.track.create({ data: dto as any });
  }

  async update(id: string, dto: UpdateTrackDto) {
    await this.findById(id);
    return this.prisma.track.update({
      where: { id },
      data: dto as any,
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.track.delete({ where: { id } });
    return { message: 'تم حذف المسار' };
  }

  async checkPermission(userId: string, trackId: string, permission: string, role: string) {
    if (role === 'admin') return true;

    const tp = await this.prisma.trackPermission.findUnique({
      where: { userId_trackId: { userId, trackId } },
    });

    if (!tp || !tp.permissions.includes(permission)) {
      throw new ForbiddenException('ليس لديك صلاحية لهذا الإجراء');
    }
    return true;
  }

  async getEmployees(params: { trackId?: string; search?: string; status?: string }) {
    const where: any = { isDeleted: false };
    if (params.trackId) where.trackId = params.trackId;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { fullNameAr: { contains: params.search, mode: 'insensitive' } },
        { fullName: { contains: params.search, mode: 'insensitive' } },
        { positionAr: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.employee.findMany({
      where,
      include: {
        track: { select: { id: true, name: true, nameAr: true, color: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getPenalties(params: { trackId?: string; resolved?: string }) {
    const where: any = { isDeleted: false };
    if (params.trackId) where.trackId = params.trackId;
    if (params.resolved === 'true') where.isResolved = true;
    if (params.resolved === 'false') where.isResolved = false;
    return this.prisma.penalty.findMany({
      where,
      include: { track: { select: { id: true, nameAr: true, color: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePenalty(id: string, data: any) {
    return this.prisma.penalty.update({ where: { id }, data });
  }

  // ─── EMPLOYEE CRUD ───

  async createEmployee(dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: dto as any,
      include: { track: true },
    });
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new NotFoundException('الموظف غير موجود');
    return this.prisma.employee.update({
      where: { id },
      data: dto as any,
      include: { track: true },
    });
  }

  async deleteEmployee(id: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الموظف غير موجود');
    await this.prisma.employee.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'تم حذف الموظف' };
  }

  async restoreEmployee(id: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الموظف غير موجود');
    await this.prisma.employee.update({ where: { id }, data: { isDeleted: false } });
    return { message: 'تم استعادة الموظف' };
  }

  async bulkDeleteEmployees(ids: string[]) {
    const result = await this.prisma.employee.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });
    return { message: `تم حذف ${result.count} موظف`, count: result.count };
  }

  // ─── DELIVERABLE CRUD ───

  async createDeliverable(dto: CreateDeliverableDto) {
    return this.prisma.deliverable.create({
      data: dto as any,
      include: { track: true },
    });
  }

  async updateDeliverable(id: string, dto: UpdateDeliverableDto) {
    const existing = await this.prisma.deliverable.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new NotFoundException('المخرج غير موجود');
    return this.prisma.deliverable.update({
      where: { id },
      data: dto as any,
      include: { track: true },
    });
  }

  async deleteDeliverable(id: string) {
    const existing = await this.prisma.deliverable.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المخرج غير موجود');
    await this.prisma.deliverable.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'تم حذف المخرج' };
  }

  async restoreDeliverable(id: string) {
    await this.prisma.deliverable.update({ where: { id }, data: { isDeleted: false } });
    return { message: 'تم استعادة المخرج' };
  }

  async bulkDeleteDeliverables(ids: string[]) {
    const result = await this.prisma.deliverable.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });
    return { message: `تم حذف ${result.count} مخرج`, count: result.count };
  }

  // ─── SCOPE CRUD ───

  async createScope(dto: CreateScopeDto) {
    return this.prisma.scope.create({
      data: dto as any,
      include: { track: true },
    });
  }

  async updateScope(id: string, dto: UpdateScopeDto) {
    const existing = await this.prisma.scope.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new NotFoundException('نطاق العمل غير موجود');
    return this.prisma.scope.update({
      where: { id },
      data: dto as any,
      include: { track: true },
    });
  }

  async deleteScope(id: string) {
    const existing = await this.prisma.scope.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('نطاق العمل غير موجود');
    await this.prisma.scope.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'تم حذف نطاق العمل' };
  }

  async restoreScope(id: string) {
    await this.prisma.scope.update({ where: { id }, data: { isDeleted: false } });
    return { message: 'تم استعادة نطاق العمل' };
  }

  // ─── TRACK KPI CRUD ───

  async createTrackKPI(dto: CreateTrackKPIDto) {
    return this.prisma.trackKPI.create({
      data: dto as any,
      include: { track: true },
    });
  }

  async updateTrackKPI(id: string, dto: UpdateTrackKPIDto) {
    const existing = await this.prisma.trackKPI.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new NotFoundException('مؤشر الأداء غير موجود');
    return this.prisma.trackKPI.update({
      where: { id },
      data: dto as any,
      include: { track: true },
    });
  }

  async deleteTrackKPI(id: string) {
    const existing = await this.prisma.trackKPI.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('مؤشر الأداء غير موجود');
    await this.prisma.trackKPI.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'تم حذف مؤشر الأداء' };
  }

  async restoreTrackKPI(id: string) {
    await this.prisma.trackKPI.update({ where: { id }, data: { isDeleted: false } });
    return { message: 'تم استعادة مؤشر الأداء' };
  }

  // ─── PENALTY CREATE & DELETE ───

  async createPenalty(dto: CreatePenaltyDto) {
    return this.prisma.penalty.create({
      data: dto as any,
      include: { track: true },
    });
  }

  async deletePenalty(id: string) {
    const existing = await this.prisma.penalty.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الغرامة غير موجودة');
    await this.prisma.penalty.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'تم حذف الغرامة' };
  }

  async restorePenalty(id: string) {
    await this.prisma.penalty.update({ where: { id }, data: { isDeleted: false } });
    return { message: 'تم استعادة الغرامة' };
  }
}
