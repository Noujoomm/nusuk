import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { ProductivityController } from './productivity.controller';
import { ProductivityService } from './productivity.service';
import { ExportService } from './export.service';
import { ProductivityScheduler } from './productivity.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [ProductivityController],
  providers: [ProductivityService, ExportService, ProductivityScheduler],
  exports: [ProductivityService, ExportService],
})
export class ProductivityModule {}
