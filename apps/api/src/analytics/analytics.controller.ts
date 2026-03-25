import { Controller, Get, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PerformanceReportService } from './performance-report.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private analytics: AnalyticsService,
    private performanceReport: PerformanceReportService,
  ) {}

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getDashboardAnalytics() {
    return this.analytics.getDashboardAnalytics();
  }

  @Get('performance-report')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getPerformanceReport() {
    return this.performanceReport.generateReport();
  }
}
