import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import {
  addDaysRiyadh,
  riyadhDateBoundaries,
  riyadhDateString,
} from './utils/riyadh-time.util';

/**
 * Per-day archive of the "Top tracks (daily)" ranking that the dashboard
 * shows live. Captured at 00:00 Asia/Riyadh by an idempotent upsert so a
 * re-run of the same date never creates duplicates.
 *
 * Formula MUST match the live card in analytics.service.ts:
 *   reportsScore      = (track.reportsCount      / max(1, allMaxReports))      × 100
 *   interactionsScore = (track.interactionsCount / max(1, allMaxInteractions)) × 100
 *   finalScore        = round((reportsScore × 0.70 + interactionsScore × 0.30) × 10) / 10
 *
 * If you change the formula in either place, change it in both — the
 * archive is the source of truth for what the user actually saw that day.
 */
@Injectable()
export class DailyTracksSnapshotService {
  private readonly logger = new Logger(DailyTracksSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron — fires at 00:00 Asia/Riyadh every day. Snapshots YESTERDAY (the
   * Riyadh calendar day that just ended). Errors are logged and swallowed
   * so a transient DB blip doesn't crash the scheduler — the missed day
   * can be replayed via {@link backfill} from the admin endpoint.
   */
  @Cron('0 0 * * *', {
    name: 'snapshotDailyTrackPerformance',
    timeZone: 'Asia/Riyadh',
  })
  async cronSnapshotYesterday() {
    const now = new Date();
    const yesterday = addDaysRiyadh(riyadhDateString(now), -1);
    try {
      const summary = await this.snapshotForRiyadhDate(yesterday);
      this.logger.log(
        `[daily-tracks-snapshot] cron ok date=${yesterday} ` +
          `tracks=${summary.tracksWritten} ranked=${summary.tracksRanked}`,
      );
    } catch (e: any) {
      this.logger.error(
        `[daily-tracks-snapshot] cron failed for date=${yesterday}: ${
          e?.message ?? e
        }`,
      );
    }
  }

  /**
   * Snapshot a single Riyadh calendar date ("YYYY-MM-DD"). Idempotent —
   * re-running for the same date overwrites the previous row.
   *
   * Returns a small summary the caller can log / surface to admin UI.
   */
  async snapshotForRiyadhDate(yyyyMmDd: string): Promise<{
    date: string;
    tracksWritten: number;
    tracksRanked: number;
  }> {
    const { start, end, date } = riyadhDateBoundaries(yyyyMmDd);

    const [tracks, reportsByTrack, engagementByTrack] = await Promise.all([
      this.prisma.track.findMany({ select: { id: true } }),
      this.prisma.report.groupBy({
        by: ['trackId'],
        where: { createdAt: { gte: start, lt: end } },
        _count: true,
      }),
      this.prisma.dailyUpdate.groupBy({
        by: ['trackId'],
        where: {
          trackId: { not: null },
          createdAt: { gte: start, lt: end },
        },
        _count: true,
      }),
    ]);

    const reportsMap = Object.fromEntries(
      reportsByTrack.map((r) => [r.trackId, r._count as unknown as number]),
    );
    const engagementMap = Object.fromEntries(
      engagementByTrack.map((u) => [
        u.trackId as string,
        u._count as unknown as number,
      ]),
    );

    const maxReports = Math.max(
      1,
      ...(Object.values(reportsMap) as number[]),
    );
    const maxEngagement = Math.max(
      1,
      ...(Object.values(engagementMap) as number[]),
    );

    // Compute scores per track + rank tracks that had any activity. Ties
    // break alphabetically by trackId so the ranking is deterministic.
    const scored = tracks
      .map((t) => {
        const r = reportsMap[t.id] ?? 0;
        const e = engagementMap[t.id] ?? 0;
        const reportsScore = (r / maxReports) * 100;
        const interactionsScore = (e / maxEngagement) * 100;
        const finalScore =
          Math.round((reportsScore * 0.7 + interactionsScore * 0.3) * 10) /
          10;
        return {
          trackId: t.id,
          reportsCount: r,
          interactionsCount: e,
          reportsScore: round1(reportsScore),
          interactionsScore: round1(interactionsScore),
          finalScore,
          hasActivity: r > 0 || e > 0,
        };
      })
      .sort((a, b) => {
        if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        return a.trackId.localeCompare(b.trackId);
      });

    let nextRank = 1;
    const rows = scored.map((s) => ({
      ...s,
      rank: s.hasActivity ? nextRank++ : null,
    }));

    // Upsert sequentially — small N (one row per active track) and we want
    // a consistent on-conflict story per row rather than batching tricks.
    for (const row of rows) {
      await this.prisma.dailyTrackPerformance.upsert({
        where: { trackId_date: { trackId: row.trackId, date } },
        create: {
          trackId: row.trackId,
          date,
          reportsCount: row.reportsCount,
          interactionsCount: row.interactionsCount,
          reportsScore: row.reportsScore,
          interactionsScore: row.interactionsScore,
          finalScore: row.finalScore,
          rank: row.rank,
        },
        update: {
          reportsCount: row.reportsCount,
          interactionsCount: row.interactionsCount,
          reportsScore: row.reportsScore,
          interactionsScore: row.interactionsScore,
          finalScore: row.finalScore,
          rank: row.rank,
          capturedAt: new Date(),
        },
      });
    }

    return {
      date: yyyyMmDd,
      tracksWritten: rows.length,
      tracksRanked: rows.filter((r) => r.rank !== null).length,
    };
  }

  /**
   * Re-runs {@link snapshotForRiyadhDate} for the last N Riyadh days,
   * ending YESTERDAY (today is still partial and is captured by the live
   * card). Idempotent — safe to run again to fix gaps.
   */
  async backfill(daysBack: number): Promise<{
    runs: Array<{ date: string; tracksWritten: number; tracksRanked: number }>;
  }> {
    const safe = Math.max(1, Math.min(365, Math.floor(daysBack)));
    const today = riyadhDateString(new Date());
    const runs: Array<{
      date: string;
      tracksWritten: number;
      tracksRanked: number;
    }> = [];
    for (let i = 1; i <= safe; i++) {
      const date = addDaysRiyadh(today, -i);
      try {
        runs.push(await this.snapshotForRiyadhDate(date));
      } catch (e: any) {
        this.logger.error(
          `[daily-tracks-snapshot] backfill failed for date=${date}: ${
            e?.message ?? e
          }`,
        );
      }
    }
    return { runs };
  }

  /**
   * Read API for the dashboard's history view. Returns the most recent
   * `daysBack` Riyadh-calendar days of snapshots, joined with track
   * metadata so the UI doesn't need a second round-trip.
   */
  async getHistory(daysBack: number) {
    const safe = Math.max(1, Math.min(365, Math.floor(daysBack)));
    const today = riyadhDateString(new Date());
    // Lower bound: today − daysBack (exclusive of today, since today is live).
    const sinceDateStr = addDaysRiyadh(today, -safe);
    const since = riyadhDateBoundaries(sinceDateStr).date;

    const rows = await this.prisma.dailyTrackPerformance.findMany({
      where: { date: { gte: since } },
      orderBy: [{ date: 'desc' }, { rank: 'asc' }],
      include: {
        track: { select: { id: true, nameAr: true, color: true } },
      },
    });

    // Group by date so the UI can render one row per day.
    const byDate = new Map<
      string,
      Array<{
        rank: number | null;
        trackId: string;
        trackName: string;
        color: string;
        reportsCount: number;
        interactionsCount: number;
        reportsScore: number;
        interactionsScore: number;
        finalScore: number;
      }>
    >();
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const list = byDate.get(key) ?? [];
      list.push({
        rank: r.rank,
        trackId: r.trackId,
        trackName: r.track?.nameAr ?? 'مسار محذوف',
        color: r.track?.color ?? '#10B981',
        reportsCount: r.reportsCount,
        interactionsCount: r.interactionsCount,
        reportsScore: r.reportsScore,
        interactionsScore: r.interactionsScore,
        finalScore: r.finalScore,
      });
      byDate.set(key, list);
    }

    return {
      timezone: 'Asia/Riyadh',
      weights: { reports: 0.7, interactions: 0.3 },
      days: Array.from(byDate.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, tracks]) => ({ date, tracks })),
    };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
