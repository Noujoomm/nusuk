import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async getDashboardAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const taskWhere = { isDeleted: false };

    // ──────────────────────────────────────
    // 1. REPORTS ANALYTICS
    // ──────────────────────────────────────
    const [
      totalReports,
      reportsByType,
      reportsByTrack,
      recentReports,
      totalAiReports,
      completedAiReports,
      pendingAiReports,
      failedAiReports,
    ] = await this.prisma.withRetry(
      () => Promise.all([
        this.prisma.report.count(),
        this.prisma.report.groupBy({ by: ['type'], _count: true }),
        this.prisma.report.groupBy({
          by: ['trackId'],
          _count: true,
        }),
        this.prisma.report.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.aIReport.count(),
        this.prisma.aIReport.count({ where: { status: 'completed' } }),
        this.prisma.aIReport.count({ where: { status: { in: ['pending', 'generating'] } } }),
        this.prisma.aIReport.count({ where: { status: 'failed' } }),
      ]),
      'analytics.reports',
    );

    // Get track names for report breakdown
    const reportTrackIds = reportsByTrack.map((r) => r.trackId).filter(Boolean) as string[];
    const reportTracks = reportTrackIds.length > 0
      ? await this.prisma.track.findMany({
          where: { id: { in: reportTrackIds } },
          select: { id: true, nameAr: true, color: true },
        })
      : [];
    const reportTrackMap = Object.fromEntries(reportTracks.map((t) => [t.id, t]));

    const reportsByTrackData = reportsByTrack.map((r) => ({
      name: reportTrackMap[r.trackId!]?.nameAr || 'غير محدد',
      color: reportTrackMap[r.trackId!]?.color || '#6366f1',
      value: r._count,
    }));

    // Reports timeline (group by date)
    const reportsTimeline = this.groupByDate(recentReports.map((r) => r.createdAt));

    // Reports by type distribution
    const reportTypeLabels: Record<string, string> = {
      daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري',
      annual: 'سنوي', operational: 'تشغيلي',
    };
    const reportsByTypeData = reportsByType.map((r) => ({
      name: reportTypeLabels[r.type] || r.type,
      value: r._count,
    }));

    // ──────────────────────────────────────
    // 2. ACHIEVEMENTS ANALYTICS
    // ──────────────────────────────────────
    const [
      totalAchievements,
      achievementsByEntityType,
      totalDeliverables,
      deliverablesByTrack,
    ] = await this.prisma.withRetry(
      () => Promise.all([
        this.prisma.achievement.count(),
        this.prisma.achievement.groupBy({
          by: ['entityType'],
          _count: true,
        }),
        this.prisma.deliverable.count({ where: { isDeleted: false } }),
        this.prisma.deliverable.groupBy({
          by: ['trackId'],
          where: { isDeleted: false },
          _count: true,
        }),
      ]),
      'analytics.achievements',
    );
    // Deliverables don't have a status field — treat all non-deleted as active
    const completedDeliverables = 0;
    const pendingDeliverables = totalDeliverables;

    // Top contributors (users with most completed task assignments)
    const topContributorsRaw = await this.prisma.taskAssignment.groupBy({
      by: ['userId'],
      where: {
        task: { status: 'completed', isDeleted: false },
      },
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 5,
    });

    const contributorIds = topContributorsRaw.map((c) => c.userId);
    const contributorUsers = contributorIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: contributorIds } },
          select: { id: true, nameAr: true, name: true },
        })
      : [];
    const userMap = Object.fromEntries(contributorUsers.map((u) => [u.id, u]));

    const topContributors = topContributorsRaw.map((c) => ({
      name: userMap[c.userId]?.nameAr || userMap[c.userId]?.name || 'غير معروف',
      completed_tasks: c._count,
    }));

    // Achievement entity type labels
    const entityTypeLabels: Record<string, string> = {
      track: 'مسار', task: 'مهمة', scope_block: 'نطاق عمل', deliverable: 'مخرج',
    };

    // Deliverable track enrichment
    const delTrackIds = deliverablesByTrack.map((d) => d.trackId).filter(Boolean) as string[];
    const delTracks = delTrackIds.length > 0
      ? await this.prisma.track.findMany({
          where: { id: { in: delTrackIds } },
          select: { id: true, nameAr: true, color: true },
        })
      : [];
    const delTrackMap = Object.fromEntries(delTracks.map((t) => [t.id, t]));

    // ──────────────────────────────────────
    // 3. PERFORMANCE METRICS
    // ──────────────────────────────────────
    const [
      totalTasks,
      completedTasks,
      overdueTasks,
      tasksByStatus,
      tasksByPriority,
      completedByTrack,
      recentDailyUpdates,
      activeUsersCount,
      totalUsers,
      allTracks,
    ] = await this.prisma.withRetry(
      () => Promise.all([
        this.prisma.task.count({ where: taskWhere }),
        this.prisma.task.count({ where: { ...taskWhere, status: 'completed' } }),
        this.prisma.task.count({
          where: {
            ...taskWhere,
            dueDate: { lt: now },
            status: { notIn: ['completed', 'cancelled'] },
          },
        }),
        this.prisma.task.groupBy({ by: ['status'], where: taskWhere, _count: true }),
        this.prisma.task.groupBy({ by: ['priority'], where: taskWhere, _count: true }),
        this.prisma.task.groupBy({
          by: ['trackId'],
          where: { ...taskWhere, status: 'completed', trackId: { not: null } },
          _count: true,
        }),
        this.prisma.dailyUpdate.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.auditLog.groupBy({
          by: ['actorId'],
          where: { createdAt: { gte: sevenDaysAgo }, actorId: { not: null } },
        }).then((r) => r.length),
        this.prisma.user.count({ where: { isLocked: false } }),
        this.prisma.track.findMany({
          select: {
            id: true, nameAr: true, color: true,
            _count: { select: { tasks: { where: taskWhere }, employees: true } },
          },
        }),
      ]),
      'analytics.performance',
    );

    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Average completion time
    const doneTasks = await this.prisma.task.findMany({
      where: { ...taskWhere, status: 'completed', startDate: { not: null } },
      select: { startDate: true, updatedAt: true },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });
    let avgCompletionDays = 0;
    if (doneTasks.length > 0) {
      const totalDays = doneTasks.reduce((sum, t) => {
        const start = new Date(t.startDate!);
        const end = new Date(t.updatedAt);
        const diff = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        return sum + diff;
      }, 0);
      avgCompletionDays = Math.round(totalDays / doneTasks.length);
    }

    // Engagement rate (daily updates in last 7 days / expected)
    const updatesLast7 = await this.prisma.dailyUpdate.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });
    const trackCount = allTracks.length;
    const expectedUpdates = trackCount * 7;
    const engagementRate = expectedUpdates > 0 ? Math.round((updatesLast7 / expectedUpdates) * 100) : 0;

    // Updates timeline
    const updatesTimeline = this.groupByDate(recentDailyUpdates.map((u) => u.createdAt));

    // Tasks completed by track enrichment
    const completedByTrackMap = Object.fromEntries(completedByTrack.map((c) => [c.trackId, c._count]));
    const tasksCompletedByTrackData = allTracks.map((t) => ({
      name: t.nameAr,
      color: t.color || '#6366f1',
      value: completedByTrackMap[t.id] || 0,
    }));

    // ──────────────────────────────────────
    // 4. SMART INSIGHTS
    // ──────────────────────────────────────
    const insights: Array<{
      type: 'success' | 'warning' | 'info';
      icon: string;
      title_ar: string;
      description_ar: string;
    }> = [];

    // Best performing track
    const trackTaskCounts = await this.prisma.task.groupBy({
      by: ['trackId'],
      where: { ...taskWhere, trackId: { not: null } },
      _count: true,
    });
    const trackTotalMap = Object.fromEntries(trackTaskCounts.map((t) => [t.trackId, t._count]));

    let bestTrack: { name: string; rate: number } | null = null;
    for (const t of allTracks) {
      const total = trackTotalMap[t.id] || 0;
      const completed = completedByTrackMap[t.id] || 0;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      if (total >= 1 && (!bestTrack || rate > bestTrack.rate)) {
        bestTrack = { name: t.nameAr, rate };
      }
    }
    if (bestTrack && bestTrack.rate > 0) {
      insights.push({
        type: 'success',
        icon: 'trophy',
        title_ar: 'أفضل مسار أداءً',
        description_ar: `${bestTrack.name} بنسبة إنجاز ${bestTrack.rate}%`,
      });
    }

    // Overdue warning per track
    const overdueByTrack = await this.prisma.task.groupBy({
      by: ['trackId'],
      where: {
        ...taskWhere,
        dueDate: { lt: now },
        status: { notIn: ['completed', 'cancelled'] },
        trackId: { not: null },
      },
      _count: true,
      orderBy: { _count: { trackId: 'desc' } },
      take: 1,
    });
    if (overdueByTrack.length > 0 && overdueByTrack[0]._count > 0) {
      const tId = overdueByTrack[0].trackId!;
      const trackInfo = allTracks.find((t) => t.id === tId);
      insights.push({
        type: 'warning',
        icon: 'alert-triangle',
        title_ar: 'تأخر في المهام',
        description_ar: `المسار "${trackInfo?.nameAr || 'غير محدد'}" لديه ${overdueByTrack[0]._count} مهام متأخرة`,
      });
    }

    // Low engagement
    if (engagementRate < 50 && trackCount > 0) {
      insights.push({
        type: 'info',
        icon: 'lightbulb',
        title_ar: 'تحسين المتابعة اليومية',
        description_ar: `نسبة الالتزام بالتحديثات اليومية ${engagementRate}% — يُنصح بمتابعة الفرق`,
      });
    }

    // High completion
    if (taskCompletionRate >= 75) {
      insights.push({
        type: 'success',
        icon: 'check-circle',
        title_ar: 'أداء ممتاز',
        description_ar: `نسبة إنجاز المهام ${taskCompletionRate}% — استمروا في العمل المتميز`,
      });
    }

    // Tracks without recent updates
    const tracksWithUpdates = await this.prisma.dailyUpdate.groupBy({
      by: ['trackId'],
      where: { createdAt: { gte: sevenDaysAgo }, trackId: { not: null } },
    });
    const tracksWithUpdatesSet = new Set(tracksWithUpdates.map((t) => t.trackId));
    const tracksWithoutUpdates = allTracks
      .filter((t) => !tracksWithUpdatesSet.has(t.id))
      .map((t) => t.nameAr);
    if (tracksWithoutUpdates.length > 0) {
      insights.push({
        type: 'info',
        icon: 'clock',
        title_ar: 'مسارات بدون تحديثات حديثة',
        description_ar: `المسارات التالية لم ترسل تحديثات خلال ٧ أيام: ${tracksWithoutUpdates.slice(0, 3).join('، ')}`,
      });
    }

    // ──────────────────────────────────────
    // 5. TRACK PERFORMANCE COMPARISON
    // ──────────────────────────────────────
    const overdueByTrackFull = await this.prisma.task.groupBy({
      by: ['trackId'],
      where: {
        ...taskWhere,
        dueDate: { lt: now },
        status: { notIn: ['completed', 'cancelled'] },
        trackId: { not: null },
      },
      _count: true,
    });
    const overdueMap = Object.fromEntries(overdueByTrackFull.map((o) => [o.trackId, o._count]));

    const recentUpdatesByTrack = await this.prisma.dailyUpdate.groupBy({
      by: ['trackId'],
      where: { createdAt: { gte: sevenDaysAgo }, trackId: { not: null } },
      _count: true,
    });
    const recentUpdatesMap = Object.fromEntries(recentUpdatesByTrack.map((u) => [u.trackId, u._count]));

    const trackPerformance = allTracks.map((t) => {
      const tTotal = trackTotalMap[t.id] || 0;
      const tCompleted = completedByTrackMap[t.id] || 0;
      return {
        id: t.id,
        name_ar: t.nameAr,
        color: t.color || '#6366f1',
        total_tasks: tTotal,
        completed_tasks: tCompleted,
        overdue_tasks: overdueMap[t.id] || 0,
        recent_updates: recentUpdatesMap[t.id] || 0,
        employee_count: t._count.employees,
        task_completion_rate: tTotal > 0 ? Math.round((tCompleted / tTotal) * 100) : 0,
      };
    });

    // ──────────────────────────────────────
    // 6. ACTIVITY FEED + EXTRA COUNTS
    // ──────────────────────────────────────
    const [
      totalDailyUpdates,
      totalFiles,
      recentActivity,
      recentReportsFeed,
      recentFilesFeed,
    ] = await this.prisma.withRetry(
      () => Promise.all([
        this.prisma.dailyUpdate.count(),
        this.prisma.uploadedFile.count(),
        this.prisma.taskUpdate.findMany({
          select: {
            id: true, content: true, createdAt: true,
            author: { select: { id: true, name: true, nameAr: true } },
            task: { select: { id: true, titleAr: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 15,
        }),
        this.prisma.report.findMany({
          select: {
            id: true, title: true, type: true, createdAt: true,
            author: { select: { id: true, name: true, nameAr: true } },
            track: { select: { id: true, nameAr: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.uploadedFile.findMany({
          select: {
            id: true, fileName: true, createdAt: true,
            uploadedBy: { select: { id: true, name: true, nameAr: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]),
      'analytics.activityFeed',
    );

    const activityFeed = [
      ...recentActivity.map((a) => ({
        id: a.id, type: 'task_update' as const,
        user_name: a.author?.nameAr || a.author?.name || '—',
        description: a.content?.slice(0, 100) || '',
        context: a.task?.titleAr || '',
        created_at: a.createdAt,
      })),
      ...recentReportsFeed.map((r) => ({
        id: r.id, type: 'report' as const,
        user_name: r.author?.nameAr || r.author?.name || '—',
        description: r.title,
        context: r.track?.nameAr || '',
        created_at: r.createdAt,
      })),
      ...recentFilesFeed.map((f) => ({
        id: f.id, type: 'file' as const,
        user_name: f.uploadedBy?.nameAr || f.uploadedBy?.name || '—',
        description: f.fileName,
        context: '',
        created_at: f.createdAt,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);

    return {
      reports: {
        total_reports: totalReports,
        total_ai_reports: totalAiReports,
        completed_ai_reports: completedAiReports,
        pending_ai_reports: pendingAiReports,
        failed_ai_reports: failedAiReports,
        reports_by_track: reportsByTrackData,
        reports_by_type: reportsByTypeData,
        reports_timeline: reportsTimeline,
      },
      achievements: {
        total_achievements: totalAchievements,
        total_deliverables: totalDeliverables,
        completed_deliverables: completedDeliverables,
        pending_deliverables: pendingDeliverables,
        deliverables_by_track: deliverablesByTrack.map((d) => ({
          name: delTrackMap[d.trackId]?.nameAr || 'غير محدد',
          color: delTrackMap[d.trackId]?.color || '#6366f1',
          value: d._count,
        })),
        achievements_by_track: achievementsByEntityType.map((a) => ({
          name: entityTypeLabels[a.entityType] || a.entityType,
          color: '#6366f1',
          value: a._count,
        })),
        top_contributors: topContributors,
      },
      performance: {
        task_completion_rate: taskCompletionRate,
        avg_completion_days: avgCompletionDays,
        active_users: activeUsersCount,
        total_users: totalUsers,
        engagement_rate: engagementRate,
        overdue_tasks: overdueTasks,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        tasks_by_status: Object.fromEntries(tasksByStatus.map((s) => [s.status, s._count])),
        tasks_by_priority: Object.fromEntries(tasksByPriority.map((p) => [p.priority, p._count])),
        tasks_completed_by_track: tasksCompletedByTrackData,
        updates_timeline: updatesTimeline,
      },
      insights,
      track_performance: trackPerformance,
      summary: {
        total_daily_updates: totalDailyUpdates,
        total_files: totalFiles,
      },
      activity_feed: activityFeed,
    };
  }

  private groupByDate(dates: Date[]): Array<{ date: string; count: number }> {
    const map = new Map<string, number>();
    for (const d of dates) {
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }
}
