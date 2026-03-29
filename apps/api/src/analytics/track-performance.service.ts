import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const PRIORITY_WEIGHTS = { critical: 0.4, high: 0.3, medium: 0.2, low: 0.1 };
const SLA_DAYS = { critical: 1, high: 3, medium: 7, low: 14 };
const TARGET_DAYS = 5; // target average completion days

function r1(v: number): number { return Math.round(v * 10) / 10; }

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function timeScore(avgDays: number): number {
  if (avgDays <= TARGET_DAYS) return 100;
  if (avgDays <= TARGET_DAYS + 1) return 80;
  if (avgDays <= TARGET_DAYS + 2) return 60;
  if (avgDays <= TARGET_DAYS + 3) return 40;
  return 20;
}

export interface TrackMetrics {
  trackId: string;
  trackName: string;
  trackColor: string;
  totalTasks: number;
  completedTasks: number;
  delayedTasks: number;
  inProgressTasks: number;
  onHoldTasks: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  weightedCompletion: number;
  completionByPriority: Record<string, number>;
  avgCompletionDays: number;
  avgByPriority: Record<string, number>;
  onTimeRate: number;
  onTimeByPriority: Record<string, number>;
  slaScore: number;
  positiveTransitionRate: number;
  timeScore: number;
  performanceScore: number;
  performanceLabel: string;
}

@Injectable()
export class TrackPerformanceService {
  constructor(private prisma: PrismaService) {}

  async getTrackPerformance(trackId: string): Promise<TrackMetrics | null> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true, nameAr: true, color: true },
    });
    if (!track) return null;

    const tasks = await this.prisma.task.findMany({
      where: { trackId, isDeleted: false },
      select: {
        id: true, status: true, priority: true,
        startDate: true, dueDate: true, completionDate: true,
        createdAt: true,
      },
    });

    return this.computeMetrics(track.id, track.nameAr, track.color || '#6366f1', tasks);
  }

  async getAllTracksPerformance(): Promise<{ tracks: TrackMetrics[]; globalScore: number; globalLabel: string }> {
    const tracks = await this.prisma.track.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, color: true },
      orderBy: { sortOrder: 'asc' },
    });

    const results: TrackMetrics[] = [];
    for (const t of tracks) {
      const tasks = await this.prisma.task.findMany({
        where: { trackId: t.id, isDeleted: false },
        select: {
          id: true, status: true, priority: true,
          startDate: true, dueDate: true, completionDate: true,
          createdAt: true,
        },
      });
      results.push(this.computeMetrics(t.id, t.nameAr, t.color || '#6366f1', tasks));
    }

    // Sort by performance score descending
    results.sort((a, b) => b.performanceScore - a.performanceScore);

    const withTasks = results.filter((r) => r.totalTasks > 0);
    const globalScore = withTasks.length > 0
      ? Math.round(withTasks.reduce((s, r) => s + r.performanceScore, 0) / withTasks.length)
      : 0;
    const globalLabel = globalScore >= 80 ? 'ممتاز' : globalScore >= 60 ? 'جيد' : globalScore >= 40 ? 'يحتاج تحسين' : 'حرج';

    return { tracks: results, globalScore, globalLabel };
  }

  private computeMetrics(trackId: string, trackName: string, trackColor: string, tasks: any[]): TrackMetrics {
    const now = new Date();
    const total = tasks.length;

    // Status counts
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    tasks.forEach((t) => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    });

    const completed = byStatus['completed'] || 0;
    const delayed = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed' && t.status !== 'cancelled').length;
    const inProgress = byStatus['in_progress'] || 0;
    const onHold = byStatus['on_hold'] || 0;

    // Weighted completion by priority
    const completionByPriority: Record<string, number> = {};
    const priorities = ['critical', 'high', 'medium', 'low'];
    priorities.forEach((p) => {
      const pTotal = tasks.filter((t) => t.priority === p).length;
      const pDone = tasks.filter((t) => t.priority === p && t.status === 'completed').length;
      completionByPriority[p] = pTotal > 0 ? r1((pDone / pTotal) * 100) : 0;
    });

    const weightedCompletion = r1(
      priorities.reduce((s, p) => s + (completionByPriority[p] || 0) * (PRIORITY_WEIGHTS[p as keyof typeof PRIORITY_WEIGHTS] || 0), 0)
    );

    // Average completion time
    const completedTasks = tasks.filter((t) => t.status === 'completed' && t.startDate);
    const avgByPriority: Record<string, number> = {};
    let totalDays = 0;
    let totalCompleted = 0;

    priorities.forEach((p) => {
      const pTasks = completedTasks.filter((t) => t.priority === p && t.completionDate);
      if (pTasks.length > 0) {
        const days = pTasks.reduce((s, t) => s + daysBetween(new Date(t.startDate), new Date(t.completionDate)), 0);
        avgByPriority[p] = r1(days / pTasks.length);
        totalDays += days;
        totalCompleted += pTasks.length;
      } else {
        avgByPriority[p] = 0;
      }
    });

    const avgCompletionDays = totalCompleted > 0 ? r1(totalDays / totalCompleted) : 0;

    // On-time delivery by priority
    const onTimeByPriority: Record<string, number> = {};
    priorities.forEach((p) => {
      const pDone = tasks.filter((t) => t.priority === p && t.status === 'completed' && t.completionDate);
      if (pDone.length > 0) {
        const onTime = pDone.filter((t) => t.dueDate && new Date(t.completionDate) <= new Date(t.dueDate)).length;
        onTimeByPriority[p] = r1((onTime / pDone.length) * 100);
      } else {
        onTimeByPriority[p] = 0;
      }
    });

    const allCompleted = tasks.filter((t) => t.status === 'completed' && t.completionDate);
    const allOnTime = allCompleted.filter((t) => t.dueDate && new Date(t.completionDate) <= new Date(t.dueDate)).length;
    const onTimeRate = allCompleted.length > 0 ? r1((allOnTime / allCompleted.length) * 100) : 0;

    const slaScore = r1(
      priorities.reduce((s, p) => s + (onTimeByPriority[p] || 0) * (PRIORITY_WEIGHTS[p as keyof typeof PRIORITY_WEIGHTS] || 0), 0)
    );

    // Positive transition rate (simplified: completed / (completed + delayed))
    const transTotal = completed + delayed;
    const positiveTransitionRate = transTotal > 0 ? r1((completed / transTotal) * 100) : 0;

    const tScore = timeScore(avgCompletionDays);

    // Final performance score
    const performanceScore = Math.round(
      weightedCompletion * 0.4 +
      slaScore * 0.3 +
      positiveTransitionRate * 0.15 +
      tScore * 0.15
    );

    const performanceLabel = performanceScore >= 80 ? 'ممتاز' : performanceScore >= 60 ? 'جيد' : performanceScore >= 40 ? 'يحتاج تحسين' : 'حرج';

    return {
      trackId, trackName, trackColor,
      totalTasks: total, completedTasks: completed, delayedTasks: delayed,
      inProgressTasks: inProgress, onHoldTasks: onHold,
      byStatus, byPriority,
      weightedCompletion, completionByPriority,
      avgCompletionDays, avgByPriority,
      onTimeRate, onTimeByPriority, slaScore,
      positiveTransitionRate, timeScore: tScore,
      performanceScore, performanceLabel,
    };
  }
}
