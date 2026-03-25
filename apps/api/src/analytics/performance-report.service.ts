import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// ─── Types ──────────────────────────────────────────
interface UserPerformance {
  id: string;
  name: string;
  role: string;
  assigned_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  in_progress_tasks: number;
  completion_rate: number;
  delay_rate: number;
  daily_updates_count: number;
  last_activity: string | null;
  last_update: string | null;
  score: number;
  rating: string;
  rating_label: string;
  note: string;
}

interface TrackReport {
  id: string;
  name: string;
  color: string;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  in_progress_tasks: number;
  not_started_tasks: number;
  completion_rate: number;
  overdue_rate: number;
  total_daily_updates: number;
  total_reports: number;
  employee_count: number;
  most_active_user: string | null;
  least_active_users: string[];
  best_performers: string[];
  weakest_performers: string[];
  users: UserPerformance[];
  observations: string[];
  recommendations: string[];
}

interface ExecutiveSummary {
  best_track: { name: string; rate: number } | null;
  weakest_track: { name: string; rate: number } | null;
  most_delayed_track: { name: string; overdue: number } | null;
  most_active_track: { name: string; updates: number } | null;
  total_tracks: number;
  total_tasks: number;
  total_completed: number;
  total_overdue: number;
  overall_completion_rate: number;
  risks: string[];
  recommendations: string[];
}

export interface FullPerformanceReport {
  generated_at: string;
  tracks: TrackReport[];
  executive_summary: ExecutiveSummary;
}

// ─── Rating System ──────────────────────────────────
function computeScore(u: {
  completion_rate: number;
  delay_rate: number;
  daily_updates_count: number;
  assigned_tasks: number;
  last_activity: string | null;
}): number {
  let score = 0;

  // Completion rate (0-40 points)
  score += Math.min(40, u.completion_rate * 0.4);

  // Low delay bonus (0-20 points): 0% delay = 20pts, 100% = 0pts
  score += Math.max(0, 20 - u.delay_rate * 0.2);

  // Update consistency (0-20 points)
  const updateRatio = u.assigned_tasks > 0
    ? Math.min(1, u.daily_updates_count / Math.max(1, u.assigned_tasks))
    : (u.daily_updates_count > 0 ? 1 : 0);
  score += updateRatio * 20;

  // Execution volume (0-10 points)
  score += Math.min(10, u.assigned_tasks * 1.5);

  // Recent activity bonus (0-10 points)
  if (u.last_activity) {
    const daysSince = Math.floor((Date.now() - new Date(u.last_activity).getTime()) / 86400000);
    if (daysSince <= 1) score += 10;
    else if (daysSince <= 3) score += 7;
    else if (daysSince <= 7) score += 4;
    else if (daysSince <= 14) score += 1;
  }

  return Math.round(Math.min(100, score));
}

function getRating(score: number): { rating: string; label: string } {
  if (score >= 85) return { rating: 'excellent', label: 'متميز' };
  if (score >= 70) return { rating: 'hardworking', label: 'مجتهد' };
  if (score >= 50) return { rating: 'good', label: 'جيد' };
  if (score >= 30) return { rating: 'below_expected', label: 'أقل من المتوقع' };
  return { rating: 'negligent', label: 'مقصر' };
}

function generateNote(u: UserPerformance): string {
  if (u.assigned_tasks === 0) return 'لا توجد مهام مسندة حالياً';
  if (u.rating === 'excellent') return `أداء متميز بنسبة إنجاز ${u.completion_rate}% مع التزام عالي بالتحديثات`;
  if (u.rating === 'hardworking') return `أداء جيد ومجتهد — يُنصح بتقليل المهام المتأخرة (${u.overdue_tasks} مهام)`;
  if (u.rating === 'good') return `أداء مقبول — يحتاج تحسين في نسبة الإنجاز أو المتابعة`;
  if (u.rating === 'below_expected') return `أداء أقل من المتوقع — ${u.overdue_tasks} مهام متأخرة ونسبة إنجاز ${u.completion_rate}% فقط`;
  return `أداء ضعيف — يحتاج متابعة مباشرة ودعم عاجل`;
}

// ─── Service ────────────────────────────────────────
@Injectable()
export class PerformanceReportService {
  constructor(private prisma: PrismaService) {}

  async generateReport(): Promise<FullPerformanceReport> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const taskWhere = { isDeleted: false };

    // ─── Load all tracks ────────────────────────
    const tracks = await this.prisma.track.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, name: true, color: true },
      orderBy: { sortOrder: 'asc' },
    });

    const trackReports: TrackReport[] = [];

    for (const track of tracks) {
      // ─── Track-level task aggregation ────────
      const [
        totalTasks,
        completedTasks,
        overdueTasks,
        inProgressTasks,
        notStartedTasks,
        totalUpdates,
        totalReports,
        employees,
      ] = await Promise.all([
        this.prisma.task.count({ where: { ...taskWhere, trackId: track.id } }),
        this.prisma.task.count({ where: { ...taskWhere, trackId: track.id, status: 'completed' } }),
        this.prisma.task.count({
          where: { ...taskWhere, trackId: track.id, dueDate: { lt: now }, status: { notIn: ['completed', 'cancelled'] } },
        }),
        this.prisma.task.count({ where: { ...taskWhere, trackId: track.id, status: 'in_progress' } }),
        this.prisma.task.count({ where: { ...taskWhere, trackId: track.id, status: { in: ['new', 'pending'] } } }),
        this.prisma.dailyUpdate.count({ where: { trackId: track.id, isDeleted: false } }),
        this.prisma.report.count({ where: { trackId: track.id } }),
        this.prisma.employee.findMany({
          where: { trackId: track.id, isDeleted: false, status: 'active' },
          select: { id: true, fullNameAr: true, fullName: true },
        }),
      ]);

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const overdueRate = totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0;

      // ─── Per-user analysis ──────────────────
      // Get all users associated with this track (via assignments, permissions, or employee records)
      const [assignmentUsers, permissionUsers] = await Promise.all([
        this.prisma.taskAssignment.findMany({
          where: { task: { trackId: track.id, isDeleted: false } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.trackPermission.findMany({
          where: { trackId: track.id },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);

      // Also include users who created tasks on this track
      const taskCreators = await this.prisma.task.findMany({
        where: { trackId: track.id, isDeleted: false },
        select: { createdById: true },
        distinct: ['createdById'],
      });

      const allUserIds = new Set<string>();
      assignmentUsers.forEach((a) => allUserIds.add(a.userId));
      permissionUsers.forEach((p) => allUserIds.add(p.userId));
      taskCreators.forEach((t) => allUserIds.add(t.createdById));

      const users = allUserIds.size > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: [...allUserIds] }, isActive: true },
            select: { id: true, name: true, nameAr: true, role: true },
          })
        : [];

      const userPerformances: UserPerformance[] = [];

      for (const u of users) {
        // Tasks assigned to this user on this track
        const [assigned, completed, overdue, inProgress] = await Promise.all([
          this.prisma.task.count({
            where: {
              ...taskWhere, trackId: track.id,
              OR: [
                { assigneeUserId: u.id },
                { assignments: { some: { userId: u.id } } },
                { createdById: u.id },
              ],
            },
          }),
          this.prisma.task.count({
            where: {
              ...taskWhere, trackId: track.id, status: 'completed',
              OR: [
                { assigneeUserId: u.id },
                { assignments: { some: { userId: u.id } } },
              ],
            },
          }),
          this.prisma.task.count({
            where: {
              ...taskWhere, trackId: track.id,
              dueDate: { lt: now }, status: { notIn: ['completed', 'cancelled'] },
              OR: [
                { assigneeUserId: u.id },
                { assignments: { some: { userId: u.id } } },
              ],
            },
          }),
          this.prisma.task.count({
            where: {
              ...taskWhere, trackId: track.id, status: 'in_progress',
              OR: [
                { assigneeUserId: u.id },
                { assignments: { some: { userId: u.id } } },
              ],
            },
          }),
        ]);

        // Daily updates by this user for this track
        const updatesCount = await this.prisma.dailyUpdate.count({
          where: { trackId: track.id, authorId: u.id, isDeleted: false },
        });

        // Last activity (audit log)
        const lastAudit = await this.prisma.auditLog.findFirst({
          where: { actorId: u.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        // Last daily update
        const lastUpdate = await this.prisma.dailyUpdate.findFirst({
          where: { trackId: track.id, authorId: u.id, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        const cRate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
        const dRate = assigned > 0 ? Math.round((overdue / assigned) * 100) : 0;

        const score = computeScore({
          completion_rate: cRate,
          delay_rate: dRate,
          daily_updates_count: updatesCount,
          assigned_tasks: assigned,
          last_activity: lastAudit?.createdAt?.toISOString() || null,
        });

        const { rating, label } = getRating(score);

        const perf: UserPerformance = {
          id: u.id,
          name: u.nameAr || u.name,
          role: u.role,
          assigned_tasks: assigned,
          completed_tasks: completed,
          overdue_tasks: overdue,
          in_progress_tasks: inProgress,
          completion_rate: cRate,
          delay_rate: dRate,
          daily_updates_count: updatesCount,
          last_activity: lastAudit?.createdAt?.toISOString() || null,
          last_update: lastUpdate?.createdAt?.toISOString() || null,
          score,
          rating,
          rating_label: label,
          note: '',
        };
        perf.note = generateNote(perf);
        userPerformances.push(perf);
      }

      // Sort by score descending
      userPerformances.sort((a, b) => b.score - a.score);

      // Most active user (by updates)
      const mostActive = userPerformances.length > 0
        ? userPerformances.reduce((best, u) => u.daily_updates_count > best.daily_updates_count ? u : best).name
        : null;

      // Classify
      const bestPerformers = userPerformances.filter((u) => u.rating === 'excellent' || u.rating === 'hardworking').map((u) => u.name);
      const weakestPerformers = userPerformances.filter((u) => u.rating === 'negligent' || u.rating === 'below_expected').map((u) => u.name);
      const leastActive = userPerformances
        .filter((u) => !u.last_activity || (Date.now() - new Date(u.last_activity).getTime()) > 7 * 86400000)
        .map((u) => u.name);

      // Observations
      const observations: string[] = [];
      if (completionRate >= 80) observations.push(`نسبة إنجاز عالية (${completionRate}%) — أداء ممتاز`);
      else if (completionRate < 40) observations.push(`نسبة إنجاز منخفضة (${completionRate}%) — يحتاج تدخل`);
      if (overdueTasks > 3) observations.push(`يوجد ${overdueTasks} مهام متأخرة تحتاج متابعة عاجلة`);
      if (weakestPerformers.length > 0) observations.push(`يوجد ${weakestPerformers.length} مستخدمين بأداء ضعيف`);
      if (totalUpdates === 0) observations.push('لا توجد تحديثات يومية — ضعف في المتابعة');
      if (leastActive.length > 0) observations.push(`${leastActive.length} مستخدمين بدون نشاط خلال ٧ أيام`);

      // Recommendations
      const recommendations: string[] = [];
      if (overdueTasks > 0) recommendations.push('مراجعة المهام المتأخرة وإعادة توزيع الأولويات');
      if (weakestPerformers.length > 0) recommendations.push(`متابعة أداء: ${weakestPerformers.slice(0, 3).join('، ')}`);
      if (totalUpdates < 5) recommendations.push('تفعيل التحديثات اليومية لتحسين الشفافية');
      if (completionRate < 50) recommendations.push('عقد اجتماع طوارئ لمراجعة خطة العمل');

      trackReports.push({
        id: track.id,
        name: track.nameAr || track.name,
        color: track.color || '#6366f1',
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        overdue_tasks: overdueTasks,
        in_progress_tasks: inProgressTasks,
        not_started_tasks: notStartedTasks,
        completion_rate: completionRate,
        overdue_rate: overdueRate,
        total_daily_updates: totalUpdates,
        total_reports: totalReports,
        employee_count: employees.length,
        most_active_user: mostActive,
        least_active_users: leastActive.slice(0, 5),
        best_performers: bestPerformers.slice(0, 5),
        weakest_performers: weakestPerformers.slice(0, 5),
        users: userPerformances,
        observations,
        recommendations,
      });
    }

    // ─── Executive Summary ──────────────────────
    const allTasks = trackReports.reduce((s, t) => s + t.total_tasks, 0);
    const allCompleted = trackReports.reduce((s, t) => s + t.completed_tasks, 0);
    const allOverdue = trackReports.reduce((s, t) => s + t.overdue_tasks, 0);

    const sorted = [...trackReports].filter((t) => t.total_tasks > 0);
    const bestTrack = sorted.sort((a, b) => b.completion_rate - a.completion_rate)[0] || null;
    const weakestTrack = sorted.sort((a, b) => a.completion_rate - b.completion_rate)[0] || null;
    const mostDelayed = [...trackReports].sort((a, b) => b.overdue_tasks - a.overdue_tasks)[0] || null;
    const mostActiveTrack = [...trackReports].sort((a, b) => b.total_daily_updates - a.total_daily_updates)[0] || null;

    const risks: string[] = [];
    if (allOverdue > 5) risks.push(`إجمالي ${allOverdue} مهمة متأخرة عبر المنصة`);
    trackReports.filter((t) => t.completion_rate < 30 && t.total_tasks > 0).forEach((t) => {
      risks.push(`مسار "${t.name}" بنسبة إنجاز ${t.completion_rate}% فقط`);
    });
    trackReports.filter((t) => t.total_daily_updates === 0 && t.total_tasks > 0).forEach((t) => {
      risks.push(`مسار "${t.name}" بدون أي تحديثات يومية`);
    });

    const execRecommendations: string[] = [];
    if (mostDelayed && mostDelayed.overdue_tasks > 3) {
      execRecommendations.push(`أولوية عاجلة: مراجعة مسار "${mostDelayed.name}" — ${mostDelayed.overdue_tasks} مهام متأخرة`);
    }
    if (weakestTrack && weakestTrack.completion_rate < 40) {
      execRecommendations.push(`إعادة تقييم خطة عمل مسار "${weakestTrack.name}"`);
    }
    execRecommendations.push('تفعيل التحديثات اليومية الإلزامية لجميع المسارات');
    execRecommendations.push('اجتماع أسبوعي لمراجعة مؤشرات الأداء');

    return {
      generated_at: now.toISOString(),
      tracks: trackReports,
      executive_summary: {
        best_track: bestTrack ? { name: bestTrack.name, rate: bestTrack.completion_rate } : null,
        weakest_track: weakestTrack ? { name: weakestTrack.name, rate: weakestTrack.completion_rate } : null,
        most_delayed_track: mostDelayed && mostDelayed.overdue_tasks > 0 ? { name: mostDelayed.name, overdue: mostDelayed.overdue_tasks } : null,
        most_active_track: mostActiveTrack && mostActiveTrack.total_daily_updates > 0 ? { name: mostActiveTrack.name, updates: mostActiveTrack.total_daily_updates } : null,
        total_tracks: tracks.length,
        total_tasks: allTasks,
        total_completed: allCompleted,
        total_overdue: allOverdue,
        overall_completion_rate: allTasks > 0 ? Math.round((allCompleted / allTasks) * 100) : 0,
        risks,
        recommendations: execRecommendations,
      },
    };
  }
}
