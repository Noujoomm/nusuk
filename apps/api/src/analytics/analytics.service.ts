import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { startOfDayInRiyadh } from './utils/riyadh-time.util';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async getDashboardAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    // "Today" for the daily-tracks card means today since midnight in Asia/Riyadh.
    // The KSA never observes DST, so the offset is a constant +3h — no need
    // for a tz lib. Resets to zero at 00:00 Makkah every day.
    const startOfTodayMakkah = startOfDayInRiyadh(now);
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

    // Average completion time + engagement (single retry block)
    const [doneTasks, updatesLast7] = await this.prisma.withRetry(
      () => Promise.all([
        this.prisma.task.findMany({
          where: { ...taskWhere, status: 'completed', startDate: { not: null } },
          select: { startDate: true, updatedAt: true },
          take: 200,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.dailyUpdate.count({
          where: { createdAt: { gte: sevenDaysAgo } },
        }),
      ]),
      'analytics.completion+engagement',
    );
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

    // Top 3 tracks — today since 00:00 Asia/Riyadh: 70% reports + 30% daily
    // interaction. Same composite formula and same normalization as before;
    // only the window changes from "sliding 24h" to "calendar day in Makkah".
    // Card visibly resets at midnight Makkah and fills back up through the day.
    const [reportsDayByTrack, engagementDayByTrack] = await this.prisma.withRetry(
      () => Promise.all([
        this.prisma.report.groupBy({
          by: ['trackId'],
          where: { createdAt: { gte: startOfTodayMakkah } },
          _count: true,
        }),
        this.prisma.dailyUpdate.groupBy({
          by: ['trackId'],
          where: { trackId: { not: null }, createdAt: { gte: startOfTodayMakkah } },
          _count: true,
        }),
      ]),
      'analytics.dailyRanking',
    );
    const reportsMap = Object.fromEntries(reportsDayByTrack.map((r) => [r.trackId, r._count]));
    const engagementMap = Object.fromEntries(engagementDayByTrack.map((u) => [u.trackId, u._count]));

    const maxReports = Math.max(1, ...Object.values(reportsMap) as number[]);
    const maxEngagement = Math.max(1, ...Object.values(engagementMap) as number[]);

    const rankedTracks = allTracks
      .map((t) => {
        const reportsScore = ((reportsMap[t.id] || 0) / maxReports) * 100;
        const interactionScore = ((engagementMap[t.id] || 0) / maxEngagement) * 100;
        const finalScore = Math.round((reportsScore * 0.70 + interactionScore * 0.30) * 10) / 10;
        return { name: t.nameAr, score: finalScore, hasActivity: (reportsMap[t.id] || 0) > 0 || (engagementMap[t.id] || 0) > 0 };
      })
      .filter((t) => t.hasActivity)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 3);

    if (rankedTracks.length > 0) {
      const topList = rankedTracks.map((t, i) => `${i + 1}. ${t.name} (${t.score}%)`).join(' — ');
      insights.push({
        type: 'success',
        icon: 'trophy',
        title_ar: 'أفضل ٣ مسارات أداءً (يومي)',
        description_ar: `${topList}\n٧٠٪ التقارير + ٣٠٪ التفاعل — منذ منتصف الليل بتوقيت مكة`,
      });
    }

    // Overdue warning per track
    const overdueByTrack = await this.prisma.withRetry(
      () => this.prisma.task.groupBy({
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
      }),
      'analytics.overdueWarning',
    );
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
    const tracksWithUpdates = await this.prisma.withRetry(
      () => this.prisma.dailyUpdate.groupBy({
        by: ['trackId'],
        where: { createdAt: { gte: sevenDaysAgo }, trackId: { not: null } },
      }),
      'analytics.tracksUpdates',
    );
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
    const [overdueByTrackFull, recentUpdatesByTrack, reportsByTrackAll, reportsLast30] = await this.prisma.withRetry(
      () => Promise.all([
        this.prisma.task.groupBy({
          by: ['trackId'],
          where: { ...taskWhere, dueDate: { lt: now }, status: { notIn: ['completed', 'cancelled'] }, trackId: { not: null } },
          _count: true,
        }),
        this.prisma.dailyUpdate.groupBy({
          by: ['trackId'],
          where: { createdAt: { gte: sevenDaysAgo }, trackId: { not: null } },
          _count: true,
        }),
        this.prisma.report.groupBy({ by: ['trackId'], _count: true }),
        this.prisma.report.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      ]),
      'analytics.trackPerformance',
    );
    const overdueMap = Object.fromEntries(overdueByTrackFull.map((o) => [o.trackId, o._count]));
    const recentUpdatesMap = Object.fromEntries(recentUpdatesByTrack.map((u) => [u.trackId, u._count]));
    const reportsByTrackMap = Object.fromEntries(reportsByTrackAll.map((r) => [r.trackId, r._count]));
    const expectedReports30 = trackCount * 30; // 1 report per track per day
    const dailyReportsRate = expectedReports30 > 0 ? Math.round((reportsLast30 / expectedReports30) * 100) : 0;

    // Task counts per track (for performance table)
    const trackTaskCounts = await this.prisma.withRetry(
      () => this.prisma.task.groupBy({ by: ['trackId'], where: { ...taskWhere, trackId: { not: null } }, _count: true }),
      'analytics.trackTaskCounts',
    );
    const trackTotalMap = Object.fromEntries(trackTaskCounts.map((t) => [t.trackId, t._count]));

    const trackPerformance = allTracks.map((t) => {
      const tTotal = trackTotalMap[t.id] || 0;
      const tCompleted = completedByTrackMap[t.id] || 0;
      const tReports = reportsByTrackMap[t.id] || 0;
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
        reports_count: tReports,
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
        daily_reports_rate: dailyReportsRate,
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
