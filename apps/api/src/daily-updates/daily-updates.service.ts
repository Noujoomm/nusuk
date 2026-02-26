import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDailyUpdateDto, UpdateDailyUpdateDto } from './daily-updates.dto';

@Injectable()
export class DailyUpdatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    pageSize?: number;
    type?: string;
    trackId?: string;
    search?: string;
    pinned?: string;
    priority?: string;
    userId?: string;
  }) {
    const { page = 1, pageSize = 20, type, trackId, search, pinned, priority, userId } = params;
    const where: any = { isDeleted: false };
    if (type) where.type = type;
    if (trackId) where.trackId = trackId;
    if (pinned === 'true') where.pinned = true;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { titleAr: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { contentAr: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.dailyUpdate.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, nameAr: true, role: true } },
          track: { select: { id: true, name: true, nameAr: true, color: true } },
          ...(userId ? { reads: { where: { userId }, select: { id: true } } } : {}),
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dailyUpdate.count({ where }),
    ]);

    // Add isRead flag
    const enriched = data.map((item: any) => {
      const { reads, ...rest } = item;
      return { ...rest, isRead: reads ? reads.length > 0 : false };
    });

    // Count unread for this user
    let unreadCount = 0;
    if (userId) {
      const totalUpdates = await this.prisma.dailyUpdate.count({ where: { isDeleted: false } });
      const readCount = await this.prisma.dailyUpdateRead.count({ where: { userId } });
      unreadCount = Math.max(0, totalUpdates - readCount);
    }

    return { data: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize), unreadCount };
  }

  async findById(id: string) {
    const update = await this.prisma.dailyUpdate.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, nameAr: true, role: true } },
        track: { select: { id: true, name: true, nameAr: true, color: true } },
      },
    });
    if (!update || update.isDeleted) throw new NotFoundException('التحديث غير موجود');
    return update;
  }

  async create(dto: CreateDailyUpdateDto, authorId: string) {
    return this.prisma.dailyUpdate.create({
      data: {
        ...dto,
        authorId,
      } as any,
      include: {
        author: { select: { id: true, name: true, nameAr: true, role: true } },
        track: { select: { id: true, name: true, nameAr: true, color: true } },
      },
    });
  }

  async update(id: string, dto: UpdateDailyUpdateDto, userId: string, userRole: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new NotFoundException('التحديث غير موجود');

    // Only author or admin/pm can edit
    if (existing.authorId !== userId && !['admin', 'pm'].includes(userRole)) {
      throw new ForbiddenException('لا يمكنك تعديل هذا التحديث');
    }

    // Track edit history
    const editHistory = (existing.editHistory as any[]) || [];
    editHistory.push({
      editedBy: userId,
      editedAt: new Date().toISOString(),
      previousTitle: existing.titleAr,
      previousContent: existing.contentAr || existing.content,
    });

    return this.prisma.dailyUpdate.update({
      where: { id },
      data: {
        ...dto,
        editHistory,
      } as any,
      include: {
        author: { select: { id: true, name: true, nameAr: true, role: true } },
        track: { select: { id: true, name: true, nameAr: true, color: true } },
      },
    });
  }

  async delete(id: string, userId: string, userRole: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التحديث غير موجود');

    if (existing.authorId !== userId && !['admin', 'pm'].includes(userRole)) {
      throw new ForbiddenException('لا يمكنك حذف هذا التحديث');
    }

    // Soft delete
    await this.prisma.dailyUpdate.update({
      where: { id },
      data: { isDeleted: true },
    });
    return { message: 'تم حذف التحديث' };
  }

  async markAsRead(updateId: string, userId: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id: updateId } });
    if (!existing || existing.isDeleted) throw new NotFoundException('التحديث غير موجود');

    await this.prisma.dailyUpdateRead.upsert({
      where: { updateId_userId: { updateId, userId } },
      create: { updateId, userId },
      update: {},
    });
    return { success: true };
  }

  async markAllAsRead(userId: string) {
    const unreadUpdates = await this.prisma.dailyUpdate.findMany({
      where: {
        isDeleted: false,
        NOT: { reads: { some: { userId } } },
      },
      select: { id: true },
    });

    if (unreadUpdates.length > 0) {
      await this.prisma.dailyUpdateRead.createMany({
        data: unreadUpdates.map((u) => ({ updateId: u.id, userId })),
        skipDuplicates: true,
      });
    }
    return { success: true, marked: unreadUpdates.length };
  }

  async getUnreadCount(userId: string) {
    const totalUpdates = await this.prisma.dailyUpdate.count({ where: { isDeleted: false } });
    const readCount = await this.prisma.dailyUpdateRead.count({ where: { userId } });
    return { unreadCount: Math.max(0, totalUpdates - readCount) };
  }

  async togglePin(id: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التحديث غير موجود');

    return this.prisma.dailyUpdate.update({
      where: { id },
      data: { pinned: !existing.pinned },
      include: {
        author: { select: { id: true, name: true, nameAr: true, role: true } },
        track: { select: { id: true, name: true, nameAr: true, color: true } },
      },
    });
  }
}
