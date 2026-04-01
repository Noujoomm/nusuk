import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  TaskForScoring, TaskScore, AtRiskTask, WeeklySnapshot,
  TrackProductivity, ProjectProductivity,
  SOURCE_WEIGHTS, PRIORITY_WEIGHTS, TIMELINESS_BRACKETS,
  ACCEPTANCE_FACTORS, PENDING_GRACE_DAYS, PENDING_WITHIN_GRACE, PENDING_OVER_GRACE,
  EXCELLENCE_EARLY_DELIVERY, EXCELLENCE_ZERO_DEFECTS,
  AT_RISK_MIN_IMPORTANCE, AT_RISK_DAYS_WINDOW, AT_RISK_MAX_PROGRESS,
  RED_FLAG_THRESHOLD, GREEN_FLAG_THRESHOLD, TRACK_WEIGHT_FLOOR,
} from './productivity.types';

@Injectable()
export class ProductivityService {
  private readonly logger = new Logger(ProductivityService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Core: Score a single task ─────────────────────────────

  calculateTaskScore(task: TaskForScoring, today: Date): TaskScore {
    const result: TaskScore = {
      taskId: task.id, taskName: task.name, trackId: task.trackId,
      sourceWeight: 0, priorityWeight: 0, importanceScore: 0,
      statusFactor: 0, timelinessFactor: 1, acceptanceFactor: 1,
      excellenceBonus: 0, executionQuality: 0,
      score: 0, maxScore: 0, productivityPercent: 0,
      timelinessDays: null, isExcluded: false, resubmitCount: task.resubmitCount,
    };

    // ── Exclusions ──
    if (task.isBlocked) {
      result.isExcluded = true;
      result.exclusionReason = task.blockerReason || 'محظورة';
      return result;
    }

    const isNew = task.status === 'new' || task.status === 'pending';
    if (isNew && task.plannedStartDate && today < task.plannedStartDate) {
      result.isExcluded = true;
      result.exclusionReason = 'لم يحِن تاريخ البدء';
      return result;
    }

    // ── Importance ──
    result.sourceWeight = SOURCE_WEIGHTS[task.source] ?? 1;
    result.priorityWeight = PRIORITY_WEIGHTS[task.priority] ?? 1;
    result.importanceScore = result.sourceWeight * result.priorityWeight;
    result.maxScore = result.importanceScore; // importance × 1.00 max quality

    // ── Status Factor ──
    const isCompleted = task.status === 'completed';
    const isInProgress = task.status === 'in_progress' || task.status === 'under_review';

    if (isCompleted) {
      result.statusFactor = 1.0;
    } else if (isInProgress) {
      result.statusFactor = Math.max(0, Math.min(1, task.progressPercent / 100));
    } else {
      // NEW/PENDING that passed planned start → counts as 0
      result.statusFactor = 0.0;
    }

    // ── Timeliness Factor (only for completed tasks) ──
    if (isCompleted && task.actualDeliveryDate && task.plannedDeliveryDate) {
      const daysLate = Math.floor(
        (task.actualDeliveryDate.getTime() - task.plannedDeliveryDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      result.timelinessDays = daysLate;

      for (const bracket of TIMELINESS_BRACKETS) {
        if (daysLate <= bracket.maxDaysLate) {
          result.timelinessFactor = bracket.factor;
          break;
        }
      }
    } else if (!isCompleted) {
      // Not completed → timeliness not applicable, use 1.0 (status factor handles it)
      result.timelinessFactor = 1.0;
    }

    // ── Acceptance Factor ──
    const status = task.approvalStatus;
    if (status === 'approved' || status === 'approved_with_notes' || status === 'resubmit') {
      result.acceptanceFactor = ACCEPTANCE_FACTORS[status] ?? 1.0;
    } else {
      // pending
      result.acceptanceFactor = task.pendingDays <= PENDING_GRACE_DAYS
        ? PENDING_WITHIN_GRACE
        : PENDING_OVER_GRACE;
    }

    // ── Excellence Bonus ──
    let bonus = 0;
    if (isCompleted && result.timelinessDays !== null && result.timelinessDays <= -3) {
      bonus += EXCELLENCE_EARLY_DELIVERY;
    }
    if (task.approvalStatus === 'approved' && task.resubmitCount === 0) {
      bonus += EXCELLENCE_ZERO_DEFECTS;
    }
    result.excellenceBonus = bonus;

    // ── Execution Quality ──
    const rawQuality = result.statusFactor * result.timelinessFactor * result.acceptanceFactor + bonus;
    result.executionQuality = Math.min(rawQuality, 1.00);

    // ── Final Score ──
    result.score = result.importanceScore * result.executionQuality;
    result.productivityPercent = result.maxScore > 0
      ? Math.round((result.score / result.maxScore) * 1000) / 10
      : 0;

    return result;
  }

  // ─── Map Prisma task to scoring input ──────────────────────

  private mapTaskToScoring(t: any): TaskForScoring {
    const today = new Date();
    let pendingDays = 0;
    if (t.approvalStatus === 'pending' && t.completionDate) {
      pendingDays = Math.floor((today.getTime() - new Date(t.completionDate).getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      id: t.id,
      name: t.titleAr || t.title,
      trackId: t.trackId || '',
      source: t.taskSource || 'additional',
      priority: t.priority || 'medium',
      status: t.status || 'new',
      progressPercent: t.progress || 0,
      plannedStartDate: t.startDate ? new Date(t.startDate) : null,
      plannedDeliveryDate: t.dueDate ? new Date(t.dueDate) : null,
      actualDeliveryDate: t.completionDate ? new Date(t.completionDate) : null,
      approvalStatus: t.approvalStatus || 'pending',
      approvalDate: t.completionDate ? new Date(t.completionDate) : null,
      pendingDays: Math.max(0, pendingDays),
      resubmitCount: t.resubmitCount || 0,
      isBlocked: t.isBlocked || false,
      blockerReason: t.blockReason || null,
    };
  }

  // ─── Build track productivity from scored tasks ────────────

  private buildTrackProductivity(
    track: any,
    scores: TaskScore[],
    allTasks: TaskForScoring[],
    snapshots: WeeklySnapshot[],
    trackWeightPercent: number,
  ): TrackProductivity {
    const eligible = scores.filter((s) => !s.isExcluded);
    const excluded = scores.filter((s) => s.isExcluded);
    const totalScore = eligible.reduce((sum, s) => sum + s.score, 0);
    const maxPossible = eligible.reduce((sum, s) => sum + s.maxScore, 0);
    const productivity = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 1000) / 10 : 0;

    const completed = allTasks.filter((t) => t.status === 'completed' && !t.isBlocked);
    const today = new Date();

    // On-time delivery
    const completedWithDates = completed.filter((t) => t.actualDeliveryDate && t.plannedDeliveryDate);
    const onTime = completedWithDates.filter((t) => t.actualDeliveryDate! <= t.plannedDeliveryDate!);
    const onTimeRate = completedWithDates.length > 0
      ? Math.round((onTime.length / completedWithDates.length) * 1000) / 10 : 0;

    // First acceptance rate
    const approvedTasks = completed.filter((t) => t.approvalStatus === 'approved' || t.approvalStatus === 'approved_with_notes');
    const firstAcceptance = approvedTasks.filter((t) => t.resubmitCount === 0 && t.approvalStatus === 'approved');
    const firstAcceptanceRate = approvedTasks.length > 0
      ? Math.round((firstAcceptance.length / approvedTasks.length) * 1000) / 10 : 0;

    // Agreement completion rate
    const agreementTasks = allTasks.filter((t) => t.source === 'agreement' && !t.isBlocked);
    const agreementCompleted = agreementTasks.filter((t) => t.status === 'completed');
    const agreementRate = agreementTasks.length > 0
      ? Math.round((agreementCompleted.length / agreementTasks.length) * 1000) / 10 : 0;

    // Excellence rate (tasks that scored 1.00 quality)
    const excellentTasks = eligible.filter((s) => s.executionQuality >= 1.0);
    const excellenceRate = eligible.length > 0
      ? Math.round((excellentTasks.length / eligible.length) * 1000) / 10 : 0;

    // High priority concentration
    const highPri = allTasks.filter((t) => (t.priority === 'high' || t.priority === 'critical') && !t.isBlocked);
    const highPriConc = allTasks.length > 0
      ? Math.round((highPri.length / allTasks.length) * 1000) / 10 : 0;

    // Backlog
    const backlog = allTasks.filter((t) =>
      !t.isBlocked && t.status !== 'completed' && t.status !== 'cancelled' &&
      (!t.plannedStartDate || today >= t.plannedStartDate),
    );

    // Pending review age (tasks pending > 5 days)
    const pendingOld = allTasks.filter((t) => t.approvalStatus === 'pending' && t.pendingDays > PENDING_GRACE_DAYS);

    // Overdue
    const overdue = allTasks.filter((t) =>
      !t.isBlocked && t.status !== 'completed' && t.status !== 'cancelled' &&
      t.plannedDeliveryDate && today > t.plannedDeliveryDate,
    );

    // Resubmit rate (diagnostic only)
    const resubmitted = allTasks.filter((t) => t.resubmitCount > 0);
    const resubmitRate = allTasks.length > 0
      ? Math.round((resubmitted.length / allTasks.length) * 1000) / 10 : 0;

    // Blockers
    const blockers = allTasks.filter((t) => t.isBlocked);

    // Claim readiness (agreement items with all tasks completed)
    const claimReadiness = agreementTasks.length > 0 ? agreementRate : 0;

    // Velocity
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thisWeekScores = eligible.filter((s) => {
      const t = allTasks.find((at) => at.id === s.taskId);
      return t?.actualDeliveryDate && t.actualDeliveryDate >= sevenDaysAgo;
    });
    const lastWeekScores = eligible.filter((s) => {
      const t = allTasks.find((at) => at.id === s.taskId);
      return t?.actualDeliveryDate && t.actualDeliveryDate >= fourteenDaysAgo && t.actualDeliveryDate < sevenDaysAgo;
    });
    const velocityThisWeek = thisWeekScores.reduce((sum, s) => sum + s.score, 0);
    const velocityLastWeek = lastWeekScores.reduce((sum, s) => sum + s.score, 0);
    const velocityTrend = velocityLastWeek > 0 ? velocityThisWeek / velocityLastWeek : velocityThisWeek > 0 ? 2.0 : 1.0;

    // Burn rate
    const remainingPoints = eligible.filter((s) => s.executionQuality < 1.0).reduce((sum, s) => sum + (s.maxScore - s.score), 0);
    const avgWeeklyBurn = (velocityThisWeek + velocityLastWeek) / 2;
    const burnRateWeeks = avgWeeklyBurn > 0 ? Math.round((remainingPoints / avgWeeklyBurn) * 10) / 10 : null;

    // At-risk tasks
    const atRisk: AtRiskTask[] = [];
    for (const t of allTasks) {
      if (t.isBlocked || t.status === 'completed' || t.status === 'cancelled') continue;
      const imp = (SOURCE_WEIGHTS[t.source] ?? 1) * (PRIORITY_WEIGHTS[t.priority] ?? 1);
      if (imp < AT_RISK_MIN_IMPORTANCE) continue;
      if (!t.plannedDeliveryDate) continue;
      const daysUntil = Math.floor((t.plannedDeliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil > AT_RISK_DAYS_WINDOW) continue;
      if (t.progressPercent >= AT_RISK_MAX_PROGRESS) continue;
      atRisk.push({
        taskId: t.id,
        taskName: t.name,
        importanceScore: imp,
        daysUntilDeadline: daysUntil,
        currentProgress: t.progressPercent,
        riskLevel: daysUntil <= 2 ? 'CRITICAL' : 'HIGH',
      });
    }
    atRisk.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline);

    return {
      trackId: track.id,
      trackName: track.name,
      trackNameAr: track.nameAr,
      productivityPercent: productivity,
      totalScore, maxPossibleScore: maxPossible,
      taskCount: eligible.length, excludedCount: excluded.length,
      trackWeightPercent,
      onTimeDeliveryRate: onTimeRate,
      firstAcceptanceRate,
      agreementCompletionRate: agreementRate,
      excellenceRate,
      totalTaskCount: allTasks.length,
      highPriorityConcentration: highPriConc,
      backlogDepth: backlog.length,
      pendingReviewAge: pendingOld.length,
      overdueCount: overdue.length,
      resubmitRate,
      blockerCount: blockers.length,
      claimReadiness,
      velocityThisWeek, velocityLastWeek, velocityTrend,
      burnRateWeeksRemaining: burnRateWeeks,
      atRiskTasks: atRisk,
      weeklySnapshots: snapshots,
      taskScores: scores,
    };
  }

  // ─── Get project-wide productivity ─────────────────────────

  async getProjectProductivity(): Promise<ProjectProductivity> {
    const today = new Date();

    const [tasks, tracks, dbSnapshots] = await Promise.all([
      this.prisma.task.findMany({
        where: { isDeleted: false, trackId: { not: null } },
        include: { track: { select: { id: true, name: true, nameAr: true, contractValue: true } } },
      }),
      this.prisma.track.findMany({
        where: { isActive: true },
        select: { id: true, name: true, nameAr: true, contractValue: true },
      }),
      this.prisma.productivitySnapshot.findMany({
        orderBy: { snapshotDate: 'asc' },
        take: 200,
      }),
    ]);

    // Calculate track weights (NO contractValue in response)
    const trackWeights = new Map<string, number>();
    let totalWeight = 0;
    for (const tr of tracks) {
      const w = Math.max(tr.contractValue ?? 0, TRACK_WEIGHT_FLOOR);
      trackWeights.set(tr.id, w);
      totalWeight += w;
    }

    // Group tasks by track
    const tasksByTrack = new Map<string, any[]>();
    for (const t of tasks) {
      if (!t.trackId) continue;
      if (!tasksByTrack.has(t.trackId)) tasksByTrack.set(t.trackId, []);
      tasksByTrack.get(t.trackId)!.push(t);
    }

    // Group snapshots by track
    const snapshotsByTrack = new Map<string, WeeklySnapshot[]>();
    for (const s of dbSnapshots) {
      if (!snapshotsByTrack.has(s.trackId)) snapshotsByTrack.set(s.trackId, []);
      snapshotsByTrack.get(s.trackId)!.push({
        snapshotDate: s.snapshotDate,
        weekLabel: s.snapshotDate.toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' }),
        productivityPercent: s.productivityPercent,
        velocityPoints: s.velocityPoints,
        completedTaskCount: s.completedTaskCount,
      });
    }

    // Score each track
    const trackProductivities: TrackProductivity[] = [];
    let totalAtRisk = 0, totalBlocked = 0, totalOverdue = 0;

    for (const track of tracks) {
      const rawTasks = tasksByTrack.get(track.id) || [];
      const scoringTasks = rawTasks.map((t) => this.mapTaskToScoring(t));
      const scores = scoringTasks.map((t) => this.calculateTaskScore(t, today));
      const weightPct = totalWeight > 0
        ? Math.round((trackWeights.get(track.id)! / totalWeight) * 1000) / 10 : 0;
      const snapshots = snapshotsByTrack.get(track.id) || [];

      const tp = this.buildTrackProductivity(track, scores, scoringTasks, snapshots, weightPct);
      trackProductivities.push(tp);

      totalAtRisk += tp.atRiskTasks.length;
      totalBlocked += tp.blockerCount;
      totalOverdue += tp.overdueCount;
    }

    // Weighted project productivity
    let weightedSum = 0, weightSum = 0;
    for (const tp of trackProductivities) {
      const w = trackWeights.get(tp.trackId) || TRACK_WEIGHT_FLOOR;
      weightedSum += tp.productivityPercent * w;
      weightSum += w;
    }
    const overallProd = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : 0;

    // Sort descending
    trackProductivities.sort((a, b) => b.productivityPercent - a.productivityPercent);

    // Flags
    const redFlags = trackProductivities
      .filter((t) => t.productivityPercent < RED_FLAG_THRESHOLD || t.atRiskTasks.some((r) => r.importanceScore >= 20))
      .map((t) => t.trackNameAr);
    const greenFlags = trackProductivities
      .filter((t) => t.productivityPercent >= GREEN_FLAG_THRESHOLD)
      .map((t) => t.trackNameAr);

    // Aggregate project snapshots
    const projectSnapshots = this.aggregateProjectSnapshots(dbSnapshots, tracks, trackWeights, totalWeight);

    return {
      overallProductivityPercent: overallProd,
      trackProductivities,
      projectWeeklySnapshots: projectSnapshots,
      redFlagTracks: redFlags,
      greenFlagTracks: greenFlags,
      totalAtRiskTasks: totalAtRisk,
      totalBlockedTasks: totalBlocked,
      totalOverdueTasks: totalOverdue,
      calculatedAt: today,
    };
  }

  // ─── Get single track productivity ─────────────────────────

  async getTrackProductivity(trackId: string): Promise<TrackProductivity> {
    const today = new Date();
    const [track, rawTasks, dbSnapshots, allTracks] = await Promise.all([
      this.prisma.track.findUnique({ where: { id: trackId }, select: { id: true, name: true, nameAr: true, contractValue: true } }),
      this.prisma.task.findMany({ where: { isDeleted: false, trackId } }),
      this.prisma.productivitySnapshot.findMany({ where: { trackId }, orderBy: { snapshotDate: 'asc' }, take: 52 }),
      this.prisma.track.findMany({ where: { isActive: true }, select: { id: true, contractValue: true } }),
    ]);

    if (!track) throw new Error('المسار غير موجود');

    let totalWeight = 0;
    let thisWeight = 0;
    for (const t of allTracks) {
      const w = Math.max(t.contractValue ?? 0, TRACK_WEIGHT_FLOOR);
      totalWeight += w;
      if (t.id === trackId) thisWeight = w;
    }
    const weightPct = totalWeight > 0 ? Math.round((thisWeight / totalWeight) * 1000) / 10 : 0;

    const scoringTasks = rawTasks.map((t) => this.mapTaskToScoring(t));
    const scores = scoringTasks.map((t) => this.calculateTaskScore(t, today));
    const snapshots: WeeklySnapshot[] = dbSnapshots.map((s) => ({
      snapshotDate: s.snapshotDate,
      weekLabel: s.snapshotDate.toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' }),
      productivityPercent: s.productivityPercent,
      velocityPoints: s.velocityPoints,
      completedTaskCount: s.completedTaskCount,
    }));

    return this.buildTrackProductivity(track, scores, scoringTasks, snapshots, weightPct);
  }

  // ─── Weekly snapshot cron ──────────────────────────────────

  async saveWeeklySnapshot(): Promise<void> {
    this.logger.log('Saving weekly productivity snapshots...');
    const project = await this.getProjectProductivity();

    const creates = project.trackProductivities.map((tp) => ({
      trackId: tp.trackId,
      productivityPercent: tp.productivityPercent,
      velocityPoints: tp.velocityThisWeek,
      completedTaskCount: tp.taskScores.filter((s) => !s.isExcluded && s.statusFactor >= 1.0).length,
      totalScore: tp.totalScore,
      maxPossibleScore: tp.maxPossibleScore,
    }));

    await this.prisma.productivitySnapshot.createMany({ data: creates });
    this.logger.log(`Saved ${creates.length} productivity snapshots.`);
  }

  // ─── Helper: aggregate project-level snapshots ─────────────

  private aggregateProjectSnapshots(
    dbSnapshots: any[],
    tracks: any[],
    trackWeights: Map<string, number>,
    totalWeight: number,
  ): WeeklySnapshot[] {
    const byDate = new Map<string, Map<string, number>>();
    for (const s of dbSnapshots) {
      const key = s.snapshotDate.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, new Map());
      byDate.get(key)!.set(s.trackId, s.productivityPercent);
    }

    const results: WeeklySnapshot[] = [];
    for (const [dateKey, trackValues] of byDate) {
      let weightedSum = 0, weightSum = 0, velocity = 0, completed = 0;
      for (const [tid, prod] of trackValues) {
        const w = trackWeights.get(tid) || TRACK_WEIGHT_FLOOR;
        weightedSum += prod * w;
        weightSum += w;
      }
      // Find matching raw snapshots for velocity/completed
      for (const s of dbSnapshots) {
        if (s.snapshotDate.toISOString().slice(0, 10) === dateKey) {
          velocity += s.velocityPoints;
          completed += s.completedTaskCount;
        }
      }

      results.push({
        snapshotDate: new Date(dateKey),
        weekLabel: new Date(dateKey).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' }),
        productivityPercent: weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : 0,
        velocityPoints: velocity,
        completedTaskCount: completed,
      });
    }

    return results.sort((a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime());
  }
}
