import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AuditModule } from '../audit/audit.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OverdueSchedulerService } from './overdue-scheduler.service';

@Module({
  imports: [AuditModule, WebsocketModule, NotificationsModule],
  providers: [TasksService, OverdueSchedulerService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
