import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// ─── Weight Tables ─────────────────────────────────
const SOURCE_WEIGHT: Record<string, number> = { agreement: 7, agent: 4, additional: 1 };
const PRIORITY_WEIGHT: Record<string, number> = { critical: 5, high: 5, medium: 3, low: 1 };

function importance(source: string, priority: string): number {
  return (SOURCE_WEIGHT[source] || 1) * (PRIORITY_WEIGHT[priority] || 1);
}

function timingFactor(dueDate: Date | null, completionDate: Date | null): number {
  if (!dueDate || !completionDate) return 0.95;
  const diff = Math.round((dueDate.getTime() - completionDate.getTime()) / 86400000);
  if (diff >= 3) return 1.00;
  if (diff >= 0) return 0.95;
  if (diff >= -1) return 0.90;
  if (diff >= -2) return 0.85;
  if (diff >= -3) return 0.80;
  if (diff >= -7) return 0.70;
  if (diff >= -14) return 0.55;
  return 0.40;
}

function approvalFactor(status: string): number {
  switch (status) {
    case 'approved': return 1.00;
    case 'approved_with_notes': return 0.85;
    case 'resubmit': return 0.95;
    case 'pending': return 0.95; // ≤5 days default
    default: return 0.95;
  }
}

function statusFactor(status: string, progress: number, startDate: Date | null): number {
  if (status === 'completed') return 1.00;
  if (status === 'in_progress' || status === 'under_review') return Math.max(0, Math.min(1, progress / 100));
  if (status === 'new' || status === 'pending') {
    if (startDate && new Date(startDate) <= new Date()) return 0.00; // past start date
    return -1; // future → exclude
  }
  return -1; // exclude
}

export interface TaskScore {
  id: string;
  title: string;
  importance: number;
  statusF: number;
  timingF: number;
  approvalF: number;
  bonus: number;
  quality: number;
  points: number;
  maxPoints: number;
  excluded: boolean;
  excludeReason?: string;
}

export interface TrackProductivity {
  trackId: string;
  trackName: string;
  trackColor: string;
  productivity: number;
  totalEligible: number;
  totalExcluded: number;
  totalBlocked: number;
  tasks: TaskScore[];
  // Diagnostics (16 indicators)
  onTimeRate: number;
  firstApprovalRate: number;
  agreementCompletionRate: number;
  excellenceRate: number;
  totalTasks: number;
  highConcentration: number;
  backlogSize: number;
  pendingReviewAge: number;
  overdueCount: number;
  resubmitRate: number;
  blockedCount: number;
  blockedReasons: string[];
  // Predictive
  velocityTrend: string;
  burnWeeks: number;
  atRiskTasks: Array<{ id: string; title: string; importance: number; progress: number; dueDate: string }>;
  // Quadrant
  quadrant: string;
  quadrantAction: string;
}

@Injectable()
export class ProductivityService {
  constructor(private prisma: PrismaService) {}

  async getTrackProductivity(trackId: string): Promise<TrackProductivity | null> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true, nameAr: true, color: true },
    });
    if (!track) return null;

    const tasks = await this.prisma.task.findMany({
      where: { trackId, isDeleted: false },
      select: {
        id: true, title: true, titleAr: true, status: true, priority: true,
        progress: true, startDate: true, dueDate: true, completionDate: true,
        taskSource: true, approvalStatus: true, isBlocked: true, blockReason: true,
        resubmitCount: true, createdAt: true,
      },
    });

    return this.compute(track.id, track.nameAr, track.color || '#6366f1', tasks);
  }

  async getAllTracksProductivity() {
    const tracks = await this.prisma.track.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, color: true },
      orderBy: { sortOrder: 'asc' },
    });

    const results: TrackProductivity[] = [];
    for (const t of tracks) {
      const tasks = await this.prisma.task.findMany({
        where: { trackId: t.id, isDeleted: false },
        select: {
          id: true, title: true, titleAr: true, status: true, priority: true,
          progress: true, startDate: true, dueDate: true, completionDate: true,
          taskSource: true, approvalStatus: true, isBlocked: true, blockReason: true,
          resubmitCount: true, createdAt: true,
        },
      });
      results.push(this.compute(t.id, t.nameAr, t.color || '#6366f1', tasks));
    }

    results.sort((a, b) => b.productivity - a.productivity);

    // Project-level
    const totalWeight = results.length || 1;
    const projectProductivity = Math.round(results.reduce((s, r) => s + r.productivity, 0) / totalWeight * 10) / 10;

    return {
      projectProductivity,
      greenTracks: results.filter((r) => r.productivity >= 75).length,
      redTracks: results.filter((r) => r.productivity < 60).length,
      totalAtRisk: results.reduce((s, r) => s + r.atRiskTasks.length, 0),
      tracks: results,
    };
  }

  private compute(trackId: string, trackName: string, trackColor: string, rawTasks: any[]): TrackProductivity {
    const now = new Date();
    const scored: TaskScore[] = [];
    let sumPoints = 0, sumMax = 0;
    let blocked = 0, excluded = 0;
    const blockedReasons: string[] = [];

    for (const t of rawTasks) {
      const title = t.titleAr || t.title;

      // Blocked → exclude completely
      if (t.isBlocked) {
        blocked++;
        if (t.blockReason) blockedReasons.push(`${title}: ${t.blockReason}`);
        scored.push({ id: t.id, title, importance: 0, statusF: 0, timingF: 0, approvalF: 0, bonus: 0, quality: 0, points: 0, maxPoints: 0, excluded: true, excludeReason: 'محظورة' });
        continue;
      }

      const imp = importance(t.taskSource || 'additional', t.priority || 'medium');
      const sF = statusFactor(t.status, t.progress, t.startDate);

      // Future task → exclude
      if (sF === -1) {
        excluded++;
        scored.push({ id: t.id, title, importance: imp, statusF: 0, timingF: 0, approvalF: 0, bonus: 0, quality: 0, points: 0, maxPoints: imp, excluded: true, excludeReason: 'مستقبلية' });
        continue;
      }

      // Cancelled → exclude
      if (t.status === 'cancelled') {
        excluded++;
        scored.push({ id: t.id, title, importance: imp, statusF: 0, timingF: 0, approvalF: 0, bonus: 0, quality: 0, points: 0, maxPoints: imp, excluded: true, excludeReason: 'ملغاة' });
        continue;
      }

      const tF = t.status === 'completed' ? timingFactor(t.dueDate, t.completionDate) : 1;
      const aF = approvalFactor(t.approvalStatus || 'pending');

      // Bonus
      let bonus = 0;
      if (t.status === 'completed') {
        const early = t.dueDate && t.completionDate && (new Date(t.dueDate).getTime() - new Date(t.completionDate).getTime()) / 86400000 >= 3;
        if (early) bonus += 0.05;
        if (t.approvalStatus === 'approved' && (t.resubmitCount || 0) === 0) bonus += 0.05;
      }

      const quality = Math.min(1.00, sF * tF * aF + bonus);
      const points = Math.round(imp * quality * 100) / 100;

      scored.push({ id: t.id, title, importance: imp, statusF: sF, timingF: tF, approvalF: aF, bonus, quality, points, maxPoints: imp, excluded: false });
      sumPoints += points;
      sumMax += imp;
    }

    const productivity = sumMax > 0 ? Math.round((sumPoints / sumMax) * 1000) / 10 : 0;

    // ── Diagnostics ──
    const eligible = scored.filter((s) => !s.excluded);
    const completed = eligible.filter((s) => rawTasks.find((t: any) => t.id === s.id)?.status === 'completed');

    const onTimeCount = completed.filter((s) => s.timingF >= 0.95).length;
    const onTimeRate = completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 0;

    const firstApproval = completed.filter((s) => {
      const t = rawTasks.find((rt: any) => rt.id === s.id);
      return t?.approvalStatus === 'approved' && (t?.resubmitCount || 0) === 0;
    }).length;
    const firstApprovalRate = completed.length > 0 ? Math.round((firstApproval / completed.length) * 100) : 0;

    const agreementTasks = eligible.filter((s) => rawTasks.find((t: any) => t.id === s.id)?.taskSource === 'agreement');
    const agreementDone = agreementTasks.filter((s) => rawTasks.find((t: any) => t.id === s.id)?.status === 'completed').length;
    const agreementCompletionRate = agreementTasks.length > 0 ? Math.round((agreementDone / agreementTasks.length) * 100) : 0;

    const excellenceCount = completed.filter((s) => s.quality >= 1.00).length;
    const excellenceRate = completed.length > 0 ? Math.round((excellenceCount / completed.length) * 100) : 0;

    const highPri = eligible.filter((s) => {
      const t = rawTasks.find((rt: any) => rt.id === s.id);
      return t?.priority === 'critical' || t?.priority === 'high';
    });
    const highConcentration = eligible.length > 0 ? Math.round((highPri.length / eligible.length) * 100) : 0;

    const backlog = eligible.filter((s) => {
      const t = rawTasks.find((rt: any) => rt.id === s.id);
      return t?.status !== 'completed' && t?.status !== 'cancelled';
    });

    const overdue = rawTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed' && t.status !== 'cancelled' && !t.isBlocked);
    const resubmits = rawTasks.filter((t: any) => (t.resubmitCount || 0) > 0);

    // ── At-risk tasks ──
    const sevenDays = new Date(now.getTime() + 7 * 86400000);
    const atRisk = rawTasks.filter((t: any) =>
      importance(t.taskSource || 'additional', t.priority || 'medium') >= 20 &&
      t.dueDate && new Date(t.dueDate) <= sevenDays &&
      t.status !== 'completed' && t.progress < 80 && !t.isBlocked
    ).map((t: any) => ({
      id: t.id, title: t.titleAr || t.title,
      importance: importance(t.taskSource || 'additional', t.priority || 'medium'),
      progress: t.progress, dueDate: t.dueDate?.toISOString?.() || String(t.dueDate),
    }));

    // ── Velocity (simplified) ──
    const velocityTrend = productivity >= 75 ? 'تسارع' : productivity >= 50 ? 'تباطؤ' : 'انهيار';

    // ── Burn rate ──
    const remainingPoints = eligible.filter((s) => !completed.includes(s)).reduce((s, t) => s + t.maxPoints, 0);
    const weeklyRate = sumPoints > 0 ? sumPoints / 2 : 1; // assume 2 weeks of data
    const burnWeeks = weeklyRate > 0 ? Math.round((remainingPoints / weeklyRate) * 10) / 10 : 99;

    // ── Quadrant ──
    const trackWeightHigh = true; // simplified — all tracks treated as important
    const execHigh = productivity >= 75;
    let quadrant: string, quadrantAction: string;
    if (trackWeightHigh && execHigh) { quadrant = '⭐ منجز ومحوري'; quadrantAction = 'استمر — يمكن الاستفادة من خبرته لدعم المسارات الأخرى'; }
    else if (trackWeightHigh && !execHigh) { quadrant = '🔴 أزمة'; quadrantAction = 'تدخل فوري — تحديد السبب الرئيسي واتخاذ قرار'; }
    else if (!trackWeightHigh && execHigh) { quadrant = '🟡 طاقة محسنة'; quadrantAction = 'إعادة تخصيص جزء من الطاقة لمسار أضعف'; }
    else { quadrant = '⚪ مراقبة'; quadrantAction = 'أولوية منخفضة — لا يستهلك وقت التقرير'; }

    return {
      trackId, trackName, trackColor, productivity,
      totalEligible: eligible.length, totalExcluded: excluded, totalBlocked: blocked,
      tasks: scored,
      onTimeRate, firstApprovalRate, agreementCompletionRate, excellenceRate,
      totalTasks: rawTasks.length, highConcentration, backlogSize: backlog.length,
      pendingReviewAge: 0, overdueCount: overdue.length,
      resubmitRate: eligible.length > 0 ? Math.round((resubmits.length / eligible.length) * 100) : 0,
      blockedCount: blocked, blockedReasons,
      velocityTrend, burnWeeks, atRiskTasks: atRisk,
      quadrant, quadrantAction,
    };
  }
}
