import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { GanttController } from './gantt.controller';
import { GanttService } from './gantt.service';

@Module({
  imports: [PrismaModule],
  controllers: [GanttController],
  providers: [GanttService],
  exports: [GanttService],
})
export class GanttModule {}
