import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OpenAIService } from '../openai/openai.service';

export interface Insight {
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  rootCause: string;
  impact: string;
  recommendation: string;
}

export interface PerformanceSnapshot {
  achievement: { avg: number; latest: number; trend: string; entries: number };
  deviation: { avgTotal: number; hasCritical: boolean; highest: { name: string; value: number } };
  tasks: { total: number; completed: number; overdue: number; rate: number };
  tracks: { total: number; bestName: string; bestRate: number; worstName: string; worstRate: number };
}

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
  ) {}

  /** Collect current platform performance data */
  private async collectSnapshot(): Promise<PerformanceSnapshot> {
    const taskWhere = { isDeleted: false };
    const now = new Date();

    // Tasks
    const [totalTasks, completedTasks, overdueTasks] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.task.count({ where: { ...taskWhere, status: 'completed' } }),
      this.prisma.task.count({ where: { ...taskWhere, dueDate: { lt: now }, status: { notIn: ['completed', 'cancelled'] } } }),
    ]);

    // Tracks
    const tracks = await this.prisma.track.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true },
    });
    const trackStats = await Promise.all(tracks.map(async (t) => {
      const total = await this.prisma.task.count({ where: { ...taskWhere, trackId: t.id } });
      const done = await this.prisma.task.count({ where: { ...taskWhere, trackId: t.id, status: 'completed' } });
      return { name: t.nameAr, rate: total > 0 ? Math.round((done / total) * 100) : 0 };
    }));
    const sorted = trackStats.filter((t) => t.rate >= 0).sort((a, b) => b.rate - a.rate);
    const best = sorted[0] || { name: '—', rate: 0 };
    const worst = sorted[sorted.length - 1] || { name: '—', rate: 0 };

    // Achievement
    const achEntries = await this.prisma.distributionAchievement.findMany({ orderBy: { gregorianDate: 'desc' }, take: 30 });
    const achCalc = achEntries.map((e) => {
      const exp = e.cardsPerHour * e.duration * e.specialists;
      return exp > 0 ? Math.round((e.totalCards / exp) * 1000) / 10 : 0;
    });
    const achAvg = achCalc.length > 0 ? Math.round(achCalc.reduce((s, v) => s + v, 0) / achCalc.length * 10) / 10 : 0;
    const achLatest = achCalc[0] || 0;
    const achTrend = achCalc.length >= 3
      ? (achCalc[0] > achCalc[2] ? 'improving' : achCalc[0] < achCalc[2] ? 'declining' : 'stable')
      : 'insufficient_data';

    // Deviation
    const devEntries = await this.prisma.distributionDeviation.findMany({ orderBy: { gregorianDate: 'desc' }, take: 30 });
    let devAvg = 0;
    let hasCritical = false;
    let highest = { name: 'N/A', value: 0 };
    if (devEntries.length > 0) {
      const latest = devEntries[0];
      const deviations = [
        { name: 'المنصة↔المصنع', value: latest.factoryValue > 0 ? Math.round(Math.abs(latest.platformValue - latest.factoryValue) / latest.factoryValue * 1000) / 10 : 0 },
        { name: 'المنصة↔التوزيع', value: latest.distributionValue > 0 ? Math.round(Math.abs(latest.platformValue - latest.distributionValue) / latest.distributionValue * 1000) / 10 : 0 },
      ];
      devAvg = Math.round(deviations.reduce((s, d) => s + d.value, 0) / deviations.length * 10) / 10;
      hasCritical = deviations.some((d) => d.value >= 30);
      highest = deviations.sort((a, b) => b.value - a.value)[0] || highest;
    }

    return {
      achievement: { avg: achAvg, latest: achLatest, trend: achTrend, entries: achEntries.length },
      deviation: { avgTotal: devAvg, hasCritical, highest },
      tasks: { total: totalTasks, completed: completedTasks, overdue: overdueTasks, rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0 },
      tracks: { total: tracks.length, bestName: best.name, bestRate: best.rate, worstName: worst.name, worstRate: worst.rate },
    };
  }

  /** Generate AI insights from platform data */
  async generateInsights(): Promise<{ snapshot: PerformanceSnapshot; insights: Insight[]; summary: string }> {
    const snapshot = await this.collectSnapshot();

    // Generate rule-based insights first (no API needed)
    const insights: Insight[] = [];

    // Achievement insights
    if (snapshot.achievement.latest < 85) {
      insights.push({
        title: 'أداء الإنجاز أقل من الحد المقبول',
        severity: 'critical',
        category: 'achievement',
        rootCause: `نسبة الإنجاز الأخيرة ${snapshot.achievement.latest}% وهي أقل من 85%`,
        impact: 'عدم تحقيق الأهداف التشغيلية وتراكم المهام المتأخرة',
        recommendation: 'مراجعة توزيع المهام وزيادة عدد الأخصائيين أو ساعات العمل',
      });
    } else if (snapshot.achievement.latest >= 100) {
      insights.push({
        title: 'أداء يتجاوز الهدف',
        severity: 'low',
        category: 'achievement',
        rootCause: `نسبة الإنجاز ${snapshot.achievement.latest}% تتجاوز الهدف`,
        impact: 'كفاءة تشغيلية عالية — فرصة لتوسيع نطاق العمل',
        recommendation: 'يمكن زيادة حجم العمل أو تقليل الموارد مع الحفاظ على الجودة',
      });
    }

    if (snapshot.achievement.trend === 'declining') {
      insights.push({
        title: 'اتجاه هبوطي في الأداء',
        severity: 'high',
        category: 'achievement',
        rootCause: 'نسبة الإنجاز تتراجع مقارنة بالأيام السابقة',
        impact: 'قد يؤدي الاستمرار إلى عدم تحقيق الأهداف الأسبوعية',
        recommendation: 'تحليل أسباب التراجع واتخاذ إجراء تصحيحي فوري',
      });
    }

    // Deviation insights
    if (snapshot.deviation.hasCritical) {
      insights.push({
        title: 'انحراف حرج في العمليات',
        severity: 'critical',
        category: 'deviation',
        rootCause: `أعلى انحراف: ${snapshot.deviation.highest.name} بنسبة ${snapshot.deviation.highest.value}%`,
        impact: 'عدم تطابق بين الجهات التشغيلية يؤثر على دقة البيانات',
        recommendation: 'مراجعة عاجلة للتنسيق بين المنصة والمصنع والتوزيع',
      });
    }

    // Task insights
    if (snapshot.tasks.overdue > 5) {
      insights.push({
        title: 'تراكم مهام متأخرة',
        severity: snapshot.tasks.overdue > 10 ? 'critical' : 'high',
        category: 'tasks',
        rootCause: `${snapshot.tasks.overdue} مهمة متأخرة من إجمالي ${snapshot.tasks.total}`,
        impact: 'تأخر في تسليم المخرجات وزيادة الضغط على الفريق',
        recommendation: 'إعادة ترتيب الأولويات وتوزيع المهام المتأخرة',
      });
    }

    if (snapshot.tasks.rate < 50 && snapshot.tasks.total > 10) {
      insights.push({
        title: 'نسبة إنجاز المهام منخفضة',
        severity: 'high',
        category: 'tasks',
        rootCause: `${snapshot.tasks.rate}% فقط من المهام مكتملة`,
        impact: 'بطء في تقدم المشروع وتأثير على الجدول الزمني',
        recommendation: 'مراجعة خطة العمل وتحديد العوائق',
      });
    }

    // Track comparison
    if (snapshot.tracks.worstRate < 30 && snapshot.tracks.total > 1) {
      insights.push({
        title: `مسار "${snapshot.tracks.worstName}" يحتاج تدخل`,
        severity: 'high',
        category: 'tracks',
        rootCause: `نسبة الإنجاز ${snapshot.tracks.worstRate}% فقط`,
        impact: 'تأخر المسار يؤثر على الأداء العام للمشروع',
        recommendation: 'تخصيص موارد إضافية أو مراجعة خطة المسار',
      });
    }

    // Sort by severity
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    insights.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

    // Generate AI summary if OpenAI is available
    let summary = '';
    if (this.openai.isAvailable && insights.length > 0) {
      try {
        summary = await this.openai.chat([
          { role: 'system', content: 'أنت محلل أعمال محترف. اكتب ملخصاً تنفيذياً مختصراً (3-5 جمل) بالعربية بناءً على البيانات التالية. كن مباشراً ومحدداً.' },
          { role: 'user', content: JSON.stringify({ snapshot, insightCount: insights.length, topIssues: insights.slice(0, 3).map((i) => i.title) }) },
        ], { maxTokens: 500 });
      } catch (e) {
        this.logger.warn('AI summary generation failed, using fallback');
        summary = `تم رصد ${insights.length} ملاحظة. نسبة إنجاز المهام ${snapshot.tasks.rate}%. ${insights.filter((i) => i.severity === 'critical').length > 0 ? 'يوجد تنبيهات حرجة تحتاج متابعة.' : 'الوضع مستقر.'}`;
      }
    } else {
      summary = `تم رصد ${insights.length} ملاحظة تشغيلية. نسبة إنجاز المهام ${snapshot.tasks.rate}%.`;
    }

    return { snapshot, insights, summary };
  }

  /** Answer a natural language question about platform data */
  async askQuestion(question: string): Promise<{ answer: string; dataUsed: string }> {
    if (!this.openai.isAvailable) {
      return { answer: 'ميزة الذكاء الاصطناعي غير مفعلة. يرجى إعداد OPENAI_API_KEY.', dataUsed: '' };
    }

    const snapshot = await this.collectSnapshot();

    const answer = await this.openai.chat([
      {
        role: 'system',
        content: `أنت مساعد ذكي لمنصة "رؤية" لإدارة المشاريع. أجب بالعربية بشكل مختصر ومباشر بناءً على البيانات المتاحة فقط. لا تخترع أرقاماً.

البيانات المتاحة:
- المهام: ${snapshot.tasks.total} إجمالي، ${snapshot.tasks.completed} مكتمل، ${snapshot.tasks.overdue} متأخر، نسبة الإنجاز ${snapshot.tasks.rate}%
- المسارات: ${snapshot.tracks.total} مسار، أفضل: ${snapshot.tracks.bestName} (${snapshot.tracks.bestRate}%)، أضعف: ${snapshot.tracks.worstName} (${snapshot.tracks.worstRate}%)
- الإنجاز التشغيلي: متوسط ${snapshot.achievement.avg}%، أحدث ${snapshot.achievement.latest}%، الاتجاه: ${snapshot.achievement.trend}
- الانحراف: متوسط ${snapshot.deviation.avgTotal}%، حرج: ${snapshot.deviation.hasCritical ? 'نعم' : 'لا'}`,
      },
      { role: 'user', content: question },
    ], { maxTokens: 500 });

    return { answer, dataUsed: 'tasks, tracks, achievement, deviation' };
  }

  /** What-if scenario simulation */
  async simulate(params: { companies: number; employees: number; hours: number; cardsPerHour: number }): Promise<{
    expectedCapacity: number; achievementPct: number; status: string; recommendation: string;
  }> {
    const expected = params.cardsPerHour * params.hours * params.employees;
    // Use historical average cards as baseline
    const achEntries = await this.prisma.distributionAchievement.findMany({ orderBy: { gregorianDate: 'desc' }, take: 10 });
    const avgCards = achEntries.length > 0 ? Math.round(achEntries.reduce((s, e) => s + e.totalCards, 0) / achEntries.length) : 0;

    const achievementPct = expected > 0 ? Math.round((avgCards / expected) * 1000) / 10 : 0;
    const status = achievementPct >= 100 ? 'excellent' : achievementPct >= 85 ? 'warning' : 'critical';

    let recommendation = '';
    if (achievementPct >= 100) recommendation = 'هذا السيناريو يحقق الهدف بالكامل';
    else if (achievementPct >= 85) recommendation = `يحتاج زيادة الإنتاجية بـ ${Math.round(expected - avgCards)} بطاقة للوصول إلى 100%`;
    else recommendation = `أداء متوقع ضعيف. يُنصح بزيادة الأخصائيين أو ساعات العمل`;

    return { expectedCapacity: expected, achievementPct, status, recommendation };
  }

  /** Smart alerts — auto-detected issues with context */
  async getSmartAlerts() {
    const { insights } = await this.generateInsights();
    return {
      alerts: insights.filter((i) => i.severity === 'critical' || i.severity === 'high'),
      total: insights.length,
      critical: insights.filter((i) => i.severity === 'critical').length,
      high: insights.filter((i) => i.severity === 'high').length,
    };
  }

  /** Lightweight predictions based on recent trends */
  async getPredictions() {
    const achEntries = await this.prisma.distributionAchievement.findMany({
      orderBy: { gregorianDate: 'desc' }, take: 14,
    });

    if (achEntries.length < 3) {
      return { predictions: [], message: 'بيانات غير كافية للتنبؤ (يحتاج 3 أيام على الأقل)' };
    }

    // Simple moving average prediction
    const values = achEntries.map((e) => {
      const exp = e.cardsPerHour * e.duration * e.specialists;
      return exp > 0 ? Math.round((e.totalCards / exp) * 1000) / 10 : 0;
    }).reverse(); // oldest first

    const last3Avg = Math.round(values.slice(-3).reduce((s, v) => s + v, 0) / 3 * 10) / 10;
    const last7Avg = values.length >= 7
      ? Math.round(values.slice(-7).reduce((s, v) => s + v, 0) / 7 * 10) / 10
      : last3Avg;

    const trend = last3Avg > last7Avg ? 'improving' : last3Avg < last7Avg ? 'declining' : 'stable';
    const delta = Math.round((last3Avg - last7Avg) * 10) / 10;

    const predictions: Array<{ day: number; label: string; predictedAchievement: number; confidence: string }> = [];
    for (let day = 1; day <= 7; day++) {
      // Linear extrapolation from trend
      const predicted = Math.round((last3Avg + delta * day * 0.3) * 10) / 10;
      predictions.push({
        day,
        label: `اليوم +${day}`,
        predictedAchievement: Math.max(0, predicted),
        confidence: day <= 3 ? 'high' : day <= 5 ? 'medium' : 'low',
      });
    }

    const risk = predictions.some((p) => p.predictedAchievement < 85);

    return {
      predictions,
      trend,
      last3Avg,
      last7Avg,
      delta,
      risk,
      riskMessage: risk
        ? `⚠️ توقع انخفاض الأداء تحت 85% خلال ${predictions.findIndex((p) => p.predictedAchievement < 85) + 1} أيام`
        : '✅ الأداء المتوقع ضمن النطاق المقبول',
    };
  }

  /** Executive summary — CEO view */
  async getExecutiveSummary() {
    const [{ snapshot, insights, summary }, predictions] = await Promise.all([
      this.generateInsights(),
      this.getPredictions(),
    ]);

    // Performance score (0-100)
    let score = 50;
    score += (snapshot.tasks.rate - 50) * 0.3; // task completion weight
    if (snapshot.achievement.latest >= 100) score += 15;
    else if (snapshot.achievement.latest >= 85) score += 5;
    else score -= 15;
    if (snapshot.deviation.hasCritical) score -= 20;
    if (snapshot.tasks.overdue > 10) score -= 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const scoreLabel = score >= 80 ? 'ممتاز' : score >= 60 ? 'جيد' : score >= 40 ? 'يحتاج تحسين' : 'حرج';

    return {
      score,
      scoreLabel,
      summary,
      topIssues: insights.filter((i) => i.severity === 'critical' || i.severity === 'high').slice(0, 5),
      topRecommendations: insights.map((i) => i.recommendation).slice(0, 5),
      snapshot,
      predictions: predictions.predictions?.slice(0, 3) || [],
      riskMessage: (predictions as any).riskMessage || '',
    };
  }
}
