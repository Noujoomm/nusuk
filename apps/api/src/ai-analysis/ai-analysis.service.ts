import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OpenAIService } from '../openai/openai.service';

@Injectable()
export class AIAnalysisService {
  private readonly logger = new Logger(AIAnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
  ) {}

  async analyzeTrack(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        tasks: {
          select: {
            title: true,
            titleAr: true,
            status: true,
            priority: true,
            progress: true,
            dueDate: true,
          },
          take: 100,
          orderBy: { updatedAt: 'desc' },
        },
        kpiEntries: {
          select: {
            name: true,
            nameAr: true,
            targetValue: true,
            actualValue: true,
            status: true,
            unit: true,
          },
        },
        penalties: {
          select: {
            violation: true,
            violationAr: true,
            severity: true,
            isResolved: true,
            impactScore: true,
          },
        },
        employees: {
          select: {
            fullName: true,
            fullNameAr: true,
            position: true,
            positionAr: true,
          },
        },
        kpis: {
          select: { name: true, nameAr: true },
        },
        deliverables: {
          select: { name: true, nameAr: true, outputs: true },
        },
        scopes: {
          select: { title: true, titleAr: true, description: true },
        },
      },
    });

    if (!track) throw new NotFoundException('المسار غير موجود');

    const now = new Date();
    const overdueTasks = track.tasks.filter(
      (t) => t.dueDate && t.dueDate < now && !['completed', 'cancelled'].includes(t.status),
    );

    const trackData = {
      name: track.nameAr || track.name,
      tasksCount: track.tasks.length,
      tasksByStatus: this.groupByField(track.tasks, 'status'),
      overdueTasksCount: overdueTasks.length,
      kpiEntries: track.kpiEntries.map((k) => ({
        name: k.nameAr || k.name,
        target: k.targetValue,
        actual: k.actualValue,
        status: k.status,
        achievement: k.targetValue > 0 ? ((k.actualValue / k.targetValue) * 100).toFixed(1) : '0',
      })),
      penalties: {
        total: track.penalties.length,
        unresolved: track.penalties.filter((p) => !p.isResolved).length,
        bySeverity: this.groupByField(track.penalties, 'severity'),
      },
      employeesCount: track.employees.length,
      deliverables: track.deliverables.map((d) => d.nameAr || d.name),
      scopes: track.scopes.map((s) => s.titleAr || s.title),
    };

    const prompt = `أنت محلل بيانات متخصص في إدارة المشاريع. قم بتحليل أداء المسار التالي وتقديم تقرير تحليلي مفصل بالعربية.

بيانات المسار "${trackData.name}":
${JSON.stringify(trackData, null, 2)}

يجب أن يتضمن التحليل:
1. تقييم عام لأداء المسار (ممتاز/جيد/متوسط/ضعيف) مع التبرير
2. تحليل حالة السجلات والمهام
3. تحليل مؤشرات الأداء ونسب الإنجاز
4. تحديد المخاطر الرئيسية
5. المخالفات وتأثيرها
6. نقاط القوة والضعف
7. توصيات محددة وقابلة للتنفيذ
8. أولويات العمل المقترحة`;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content:
          'أنت محلل بيانات خبير في إدارة المشاريع. تقدم تحليلات دقيقة وموضوعية باللغة العربية. تركز على النقاط العملية والتوصيات القابلة للتنفيذ.',
      },
      { role: 'user', content: prompt },
    ];

    const analysis = await this.openai.chat(messages, { temperature: 0.3 });

    return {
      analysis,
      trackId,
      trackName: trackData.name,
      generatedAt: new Date().toISOString(),
    };
  }

  async analyzeKPIs(trackId?: string) {
    const where: any = {};
    if (trackId) where.trackId = trackId;

    const kpiEntries = await this.prisma.kPIEntry.findMany({
      where,
      include: { track: { select: { nameAr: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (kpiEntries.length === 0) {
      return {
        analysis: 'لا توجد مؤشرات أداء مسجلة للتحليل.',
        generatedAt: new Date().toISOString(),
      };
    }

    const kpiData = kpiEntries.map((k) => ({
      name: k.nameAr || k.name,
      track: k.track?.nameAr || k.track?.name || 'غير محدد',
      target: k.targetValue,
      actual: k.actualValue,
      unit: k.unit,
      status: k.status,
      gap: k.targetValue - k.actualValue,
      achievementRate:
        k.targetValue > 0 ? ((k.actualValue / k.targetValue) * 100).toFixed(1) : '0',
    }));

    const summary = {
      total: kpiData.length,
      achieved: kpiData.filter((k) => +k.achievementRate >= 100).length,
      onTrack: kpiData.filter(
        (k) => +k.achievementRate >= 70 && +k.achievementRate < 100,
      ).length,
      atRisk: kpiData.filter(
        (k) => +k.achievementRate >= 40 && +k.achievementRate < 70,
      ).length,
      behind: kpiData.filter((k) => +k.achievementRate < 40).length,
      avgAchievement: (
        kpiData.reduce((sum, k) => sum + +k.achievementRate, 0) / kpiData.length
      ).toFixed(1),
    };

    const prompt = `أنت محلل بيانات متخصص في مؤشرات الأداء الرئيسية (KPIs). قم بتحليل مؤشرات الأداء التالية وتقديم تقرير تحليلي مفصل بالعربية.

ملخص عام:
- إجمالي المؤشرات: ${summary.total}
- محققة: ${summary.achieved}
- على المسار: ${summary.onTrack}
- معرضة للخطر: ${summary.atRisk}
- متأخرة: ${summary.behind}
- متوسط نسبة الإنجاز: ${summary.avgAchievement}%

تفاصيل المؤشرات:
${JSON.stringify(kpiData, null, 2)}

يجب أن يتضمن التحليل:
1. ملخص عام لحالة مؤشرات الأداء
2. أفضل المؤشرات أداءً وأسوأها
3. تحليل الفجوات بين الأهداف والفعلي
4. الاتجاهات والأنماط الملاحظة
5. تحليل حسب المسارات (إن وجد)
6. توصيات محددة لتحسين كل مؤشر متأخر
7. أولويات التحسين`;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content:
          'أنت محلل بيانات خبير في مؤشرات الأداء الرئيسية. تقدم تحليلات دقيقة باللغة العربية مع تركيز على التوصيات العملية.',
      },
      { role: 'user', content: prompt },
    ];

    const analysis = await this.openai.chat(messages, { temperature: 0.3 });

    return {
      analysis,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  private groupByField(items: any[], field: string): Record<string, number> {
    return items.reduce((acc, item) => {
      const key = item[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
