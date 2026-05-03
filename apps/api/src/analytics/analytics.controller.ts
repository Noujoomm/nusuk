import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TrackPerformanceService } from './track-performance.service';
import { DailyTracksSnapshotService } from './daily-tracks-snapshot.service';
import { PrismaService } from '../common/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private analytics: AnalyticsService,
    private trackPerf: TrackPerformanceService,
    private dailyTracks: DailyTracksSnapshotService,
  ) {}

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager', 'pm', 'track_lead', 'employee', 'hr')
  async getDashboardAnalytics() {
    try {
      return await this.analytics.getDashboardAnalytics();
    } catch (error) {
      if (PrismaService.isTransientError(error)) {
        this.logger.warn('Dashboard analytics failed — database temporarily unavailable');
        throw new InternalServerErrorException('قاعدة البيانات غير متاحة مؤقتاً');
      }
      this.logger.error(`Dashboard analytics error: ${(error as any)?.message}`);
      throw new InternalServerErrorException('حدث خطأ أثناء تحميل البيانات');
    }
  }

  @Get('track-performance')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getAllTracksPerformance() {
    return this.trackPerf.getAllTracksPerformance();
  }

  @Get('track-performance/:trackId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getTrackPerformance(@Param('trackId') trackId: string) {
    return this.trackPerf.getTrackPerformance(trackId);
  }

  // ── Daily-tracks archive ─────────────────────────────────────────────

  /**
   * Past N days of the daily-tracks ranking, snapshotted at 00:00 Riyadh.
   * Today is intentionally excluded — it's still in flight and is served
   * by the live "Top 3 tracks" card via /analytics/dashboard.
   */
  @Get('daily-tracks/history')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager', 'pm', 'track_lead', 'employee', 'hr')
  getDailyTracksHistory(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.dailyTracks.getHistory(days);
  }

  /**
   * Admin-only: re-runs the snapshot for the last N Riyadh days. Idempotent
   * (upserts), so safe to call after a missed cron firing or to populate
   * history immediately after the feature ships.
   */
  @Post('daily-tracks/backfill')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  backfillDailyTracks(
    @Body() body: { days?: number },
  ) {
    const days = Math.max(1, Math.min(365, Math.floor(body?.days ?? 30)));
    return this.dailyTracks.backfill(days);
  }
}
