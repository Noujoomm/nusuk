import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    const dbHealthy = await this.prisma.isHealthy();
    const status = dbHealthy ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'unreachable',
    };
  }
}
