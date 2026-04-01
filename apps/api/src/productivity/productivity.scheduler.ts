import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProductivityService } from './productivity.service';

@Injectable()
export class ProductivityScheduler {
  private readonly logger = new Logger(ProductivityScheduler.name);

  constructor(private readonly productivity: ProductivityService) {}

  @Cron('59 20 * * 0') // Every Sunday at 20:59 UTC (23:59 Saudi time)
  async takeWeeklySnapshot() {
    try {
      this.logger.log('Taking weekly productivity snapshot...');
      await this.productivity.saveWeeklySnapshot();
      this.logger.log('Weekly snapshot completed.');
    } catch (error) {
      this.logger.error(`Weekly snapshot failed: ${(error as any)?.message}`);
    }
  }
}
