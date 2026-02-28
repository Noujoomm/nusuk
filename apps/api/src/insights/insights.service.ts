import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  async getExecutiveSummary() {
    const [
      tracks, totalTasks, tasksByStatus, kpiStats,
      penaltyCount, reportCount, employeeCount,
    ] = await Promise.all([
      this.prisma.track.findMany({ where: { isActive: true }, select: { id: true, nameAr: true } }),
      this.prisma.task.count(),
      this.prisma.task.groupBy({ by: ['status'], _count: true }),
      this.prisma.kPIEntry.aggregate({ _avg: { actualValue: true }, _count: true }),
      this.prisma.penalty.count({ where: { isResolved: false } }),
      this.prisma.report.count(),
      this.prisma.employee.count(),
    ]);

    const statusMap = tasksByStatus.reduce((acc, r) => ({ ...acc, [r.status]: r._count }), {} as Record<string, number>);
    const completed = statusMap['completed'] || 0;
    const inProgress = statusMap['in_progress'] || 0;
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

    // Generate insights
    const alerts: Array<{ type: string; message: string; severity: string }> = [];
    const insights: string[] = [];

    // Completion analysis
    if (completionRate < 30) {
      alerts.push({ type: 'performance', message: 'نسبة الإنجاز الكلية أقل من 30% — يوصى بمراجعة خطة التنفيذ', severity: 'critical' });
    } else if (completionRate < 60) {
      alerts.push({ type: 'performance', message: 'نسبة الإنجاز دون المستهدف — يلزم تسريع وتيرة العمل', severity: 'high' });
    }

    // Penalty alerts
    if (penaltyCount > 0) {
      alerts.push({ type: 'penalty', message: `يوجد ${penaltyCount} مخالفة غير محلولة تحتاج معالجة فورية`, severity: penaltyCount > 5 ? 'critical' : 'medium' });
    }

    // KPI analysis
    const avgKPI = Math.round(kpiStats._avg?.actualValue || 0);
    if (avgKPI < 50) {
      alerts.push({ type: 'kpi', message: 'متوسط أداء مؤشرات KPI أقل من 50% — مطلوب خطة تصحيحية', severity: 'high' });
    }

    // Generate summary
    insights.push(`يشمل النظام ${tracks.length} مسار عمل و${totalTasks} مهمة`);
    insights.push(`${completed} مهمة مكتملة (${completionRate}%) و${inProgress} قيد التنفيذ`);
    insights.push(`${employeeCount} موظف مسجل في النظام`);
    if (kpiStats._count > 0) {
      insights.push(`${kpiStats._count} مؤشر أداء بمتوسط إنجاز ${avgKPI}%`);
    }
    insights.push(`${reportCount} تقرير مرفوع في النظام`);

    // Risk detection
    const risks: Array<{ area: string; level: string; description: string }> = [];
    if (completionRate < 50 && totalTasks > 10) {
      risks.push({ area: 'التنفيذ', level: 'high', description: 'تأخر ملحوظ في تنفيذ المهام قد يؤثر على الجدول الزمني' });
    }
    if (penaltyCount > 3) {
      risks.push({ area: 'الامتثال', level: 'high', description: 'تراكم المخالفات يشير لمشكلة هيكلية في الأداء' });
    }
    if (avgKPI < 60 && kpiStats._count > 0) {
      risks.push({ area: 'مؤشرات الأداء', level: 'medium', description: 'أداء المؤشرات دون المستوى المطلوب' });
    }

    return {
      summary: {
        tracksCount: tracks.length,
        totalTasks,
        completionRate,
        employeeCount,
        kpiCount: kpiStats._count,
        avgKPI,
        penaltyCount,
        reportCount,
      },
      insights,
      alerts,
      risks,
      generatedAt: new Date().toISOString(),
    };
  }

  async getTrackInsights(trackId: string) {
    const [track, taskStatuses, kpis, penalties, reports] = await Promise.all([
      this.prisma.track.findUnique({
        where: { id: trackId },
        include: { _count: { select: { tasks: true, employees: true, deliverables: true, kpis: true, penalties: true } } },
      }),
      this.prisma.task.groupBy({ where: { trackId }, by: ['status'], _count: true }),
      this.prisma.kPIEntry.findMany({ where: { trackId }, select: { status: true, actualValue: true, targetValue: true } }),
      this.prisma.penalty.findMany({ where: { trackId }, select: { isResolved: true, severity: true } }),
      this.prisma.report.count({ where: { trackId } }),
    ]);

    const statusMap = taskStatuses.reduce((acc: Record<string, number>, r) => ({ ...acc, [r.status]: r._count }), {} as Record<string, number>);
    const total = Object.values(statusMap).reduce((a: number, b: number) => a + b, 0);
    const completed = statusMap['completed'] || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const kpiAvg = kpis.length > 0
      ? Math.round(kpis.reduce((sum, k) => sum + (k.targetValue > 0 ? (k.actualValue / k.targetValue) * 100 : 0), 0) / kpis.length)
      : 0;

    const unresolvedPenalties = penalties.filter(p => !p.isResolved).length;
    const criticalPenalties = penalties.filter(p => p.severity === 'critical' || p.severity === 'high').length;

    const alerts: string[] = [];
    if (completionRate < 30) alerts.push('تأخر كبير في الإنجاز');
    if (unresolvedPenalties > 0) alerts.push(`${unresolvedPenalties} مخالفة غير محلولة`);
    if (kpiAvg < 50 && kpis.length > 0) alerts.push('أداء المؤشرات ضعيف');

    return {
      trackName: track?.nameAr,
      completionRate,
      kpiAvg,
      unresolvedPenalties,
      criticalPenalties,
      reportCount: reports,
      alerts,
      recommendation: completionRate < 50
        ? 'يوصى بعقد اجتماع عاجل لمراجعة الأداء ووضع خطة تسريع'
        : 'الأداء ضمن النطاق المقبول — استمرار في المتابعة الدورية',
    };
  }
}
