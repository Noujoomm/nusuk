import { Module } from '@nestjs/common';
import { ExecutiveTasksController } from './executive-tasks.controller';
import { ExecutiveTasksService } from './executive-tasks.service';

@Module({
  controllers: [ExecutiveTasksController],
  providers: [ExecutiveTasksService],
  exports: [ExecutiveTasksService],
})
export class ExecutiveTasksModule {}
