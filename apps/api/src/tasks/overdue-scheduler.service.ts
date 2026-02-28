import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class OverdueSchedulerService {
  private readonly logger = new Logger(OverdueSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private events: EventsGateway,
  ) {}

  /**
   * Every 15 minutes: detect newly overdue tasks and notify assignees.
   * Uses lastOverdueNotifiedAt for idempotency — only notifies once per task.
   */
  @Cron('0 */15 * * * *')
  async detectOverdueTasks() {
    try {
      const now = new Date();
      const overdueTasks = await this.prisma.task.findMany({
        where: {
          isDeleted: false,
          dueDate: { lt: now },
          status: { notIn: ['completed', 'cancelled'] },
          lastOverdueNotifiedAt: null,
        },
        include: {
          assignments: { select: { userId: true } },
          track: { select: { id: true, nameAr: true } },
        },
        take: 100,
      });

      if (overdueTasks.length === 0) return;

      this.logger.log(`Found ${overdueTasks.length} newly overdue tasks`);

      for (const task of overdueTasks) {
        // Collect all users to notify: assignee + assignments + creator
        const userIds = new Set<string>();
        if (task.assigneeUserId) userIds.add(task.assigneeUserId);
        if (task.createdById) userIds.add(task.createdById);
        task.assignments.forEach((a) => userIds.add(a.userId));

        if (userIds.size > 0) {
          await this.notifications.createForUsers([...userIds], {
            type: 'task_overdue',
            title: 'Task Overdue',
            titleAr: 'مهمة متأخرة',
            body: `Task "${task.title}" is overdue`,
            bodyAr: `المهمة "${task.titleAr}" تجاوزت الموعد المحدد`,
            entityType: 'task',
            entityId: task.id,
            trackId: task.trackId || undefined,
          });

          // Emit real-time notification
          userIds.forEach((uid) => {
            this.events.emitToUser(uid, 'notification.new', {
              type: 'task_overdue',
              taskId: task.id,
              titleAr: task.titleAr,
            });
          });
        }

        // Mark as notified (idempotency)
        await this.prisma.task.update({
          where: { id: task.id },
          data: { lastOverdueNotifiedAt: now },
        });
      }

      this.logger.log(`Notified for ${overdueTasks.length} overdue tasks`);
    } catch (error) {
      this.logger.error('Error in overdue task detection', error);
    }
  }

  /**
   * Daily at 9:00 AM Riyadh time (UTC+3 → 6:00 AM UTC): send reminder
   * for all still-overdue tasks.
   */
  @Cron('0 6 * * *') // 6:00 UTC = 9:00 Riyadh
  async sendDailyOverdueReminders() {
    try {
      const now = new Date();
      const overdueTasks = await this.prisma.task.findMany({
        where: {
          isDeleted: false,
          dueDate: { lt: now },
          status: { notIn: ['completed', 'cancelled'] },
          lastOverdueNotifiedAt: { not: null },
        },
        include: {
          assignments: { select: { userId: true } },
        },
        take: 200,
      });

      if (overdueTasks.length === 0) return;

      this.logger.log(`Sending daily reminders for ${overdueTasks.length} overdue tasks`);

      for (const task of overdueTasks) {
        const userIds = new Set<string>();
        if (task.assigneeUserId) userIds.add(task.assigneeUserId);
        task.assignments.forEach((a) => userIds.add(a.userId));

        if (userIds.size > 0) {
          const daysDiff = Math.ceil((now.getTime() - new Date(task.dueDate!).getTime()) / (1000 * 60 * 60 * 24));

          await this.notifications.createForUsers([...userIds], {
            type: 'task_overdue',
            title: 'Overdue Reminder',
            titleAr: 'تذكير بمهمة متأخرة',
            body: `Task "${task.title}" is ${daysDiff} days overdue`,
            bodyAr: `المهمة "${task.titleAr}" متأخرة منذ ${daysDiff} يوم`,
            entityType: 'task',
            entityId: task.id,
            trackId: task.trackId || undefined,
          });
        }

        // Update lastOverdueNotifiedAt to now
        await this.prisma.task.update({
          where: { id: task.id },
          data: { lastOverdueNotifiedAt: now },
        });
      }
    } catch (error) {
      this.logger.error('Error sending daily overdue reminders', error);
    }
  }
}
