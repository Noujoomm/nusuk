import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { VoiceFillService } from './voice-fill.service';
import { AuditModule } from '../audit/audit.module';
import { OpenAIModule } from '../openai/openai.module';

@Module({
  imports: [AuditModule, OpenAIModule],
  providers: [ReportsService, VoiceFillService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
