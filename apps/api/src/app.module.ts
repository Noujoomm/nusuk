import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TracksModule } from './tracks/tracks.module';
import { RecordsModule } from './records/records.module';
import { AuditModule } from './audit/audit.module';
import { WebsocketModule } from './websocket/websocket.module';
import { ReportsModule } from './reports/reports.module';
import { FilesModule } from './files/files.module';
import { KPIModule } from './kpi-management/kpi.module';
import { InsightsModule } from './insights/insights.module';
import { SubtasksModule } from './subtasks/subtasks.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { TasksModule } from './tasks/tasks.module';
import { OpenAIModule } from './openai/openai.module';
import { AIReportsModule } from './ai-reports/ai-reports.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { AIAnalysisModule } from './ai-analysis/ai-analysis.module';
import { ScopeBlocksModule } from './scope-blocks/scope-blocks.module';
import { ProgressModule } from './progress/progress.module';
import { StorageModule } from './storage/storage.module';
import { DailyUpdatesModule } from './daily-updates/daily-updates.module';
import { ImportsModule } from './imports/imports.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    TracksModule,
    RecordsModule,
    AuditModule,
    WebsocketModule,
    ReportsModule,
    FilesModule,
    KPIModule,
    InsightsModule,
    SubtasksModule,
    CommentsModule,
    NotificationsModule,
    SearchModule,
    TasksModule,
    OpenAIModule,
    AIReportsModule,
    EmbeddingsModule,
    AIAnalysisModule,
    ScopeBlocksModule,
    ProgressModule,
    StorageModule,
    DailyUpdatesModule,
    ImportsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
