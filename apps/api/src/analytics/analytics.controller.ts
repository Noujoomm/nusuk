import { Controller, Get, UseGuards, Logger, InternalServerErrorException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../common/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private analytics: AnalyticsService) {}

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async getDashboardAnalytics() {
    try {
      return await this.analytics.getDashboardAnalytics();
    } catch (error) {
      if (PrismaService.isTransientError(error)) {
        this.logger.warn('Dashboard analytics failed — database temporarily unavailable');
        throw new InternalServerErrorException('قاعدة البيانات غير متاحة مؤقتاً — يرجى المحاولة بعد قليل');
      }
      this.logger.error(`Dashboard analytics error: ${(error as any)?.message}`);
      throw new InternalServerErrorException('حدث خطأ أثناء تحميل البيانات');
    }
  }
}
