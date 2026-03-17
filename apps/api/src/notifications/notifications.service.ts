import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { buildSkipTake } from '../common/utils/pagination.util';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    type: string;
    title: string;
    titleAr: string;
    body?: string;
    bodyAr?: string;
    entityType?: string;
    entityId?: string;
    trackId?: string;
    senderId?: string;
  }) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type as any,
          title: data.title,
          titleAr: data.titleAr,
          body: data.body,
          bodyAr: data.bodyAr,
          entityType: data.entityType,
          entityId: data.entityId,
          trackId: data.trackId,
          senderId: data.senderId,
        },
        include: {
          sender: { select: { id: true, name: true, nameAr: true } },
        },
      });
      return notification;
    } catch (err) {
      this.logger.error(`Failed to create notification: ${err.message}`);
      throw err;
    }
  }

  async createForUsers(
    userIds: string[],
    data: {
      type: string;
      title: string;
      titleAr: string;
      body?: string;
      bodyAr?: string;
      entityType?: string;
      entityId?: string;
      trackId?: string;
      senderId?: string;
    },
  ) {
    const notifications = await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: data.type as any,
        title: data.title,
        titleAr: data.titleAr,
        body: data.body,
        bodyAr: data.bodyAr,
        entityType: data.entityType,
        entityId: data.entityId,
        trackId: data.trackId,
        senderId: data.senderId,
      })),
    });
    return notifications;
  }

  async findByUser(
    userId: string,
    params: { page: number; pageSize: number; unreadOnly?: boolean },
  ) {
    const { page, pageSize, unreadOnly = false } = params;
    const { skip, take } = buildSkipTake(page, pageSize);
    const where: any = { userId };

    if (unreadOnly) {
      where.isRead = false;
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: {
          sender: { select: { id: true, name: true, nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('الإشعار غير موجود');

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('الإشعار غير موجود');

    await this.prisma.notification.delete({ where: { id } });
    return { message: 'تم حذف الإشعار' };
  }

  async getPreferences(userId: string) {
    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return preferences;
  }

  async updatePreferences(
    userId: string,
    data: {
      emailEnabled?: boolean;
      assignmentAlert?: boolean;
      commentAlert?: boolean;
      mentionAlert?: boolean;
      deadlineAlert?: boolean;
      statusChangeAlert?: boolean;
    },
  ) {
    // Ensure preferences exist first
    await this.getPreferences(userId);

    return this.prisma.notificationPreference.update({
      where: { userId },
      data,
    });
  }
}
