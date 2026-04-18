import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { OpenAIModule } from '../openai/openai.module';
import { AuditModule } from '../audit/audit.module';
import { ReportsIntelligenceController } from './reports-intelligence.controller';
import { ReportsIntelligenceService } from './reports-intelligence.service';

@Module({
  imports: [PrismaModule, OpenAIModule, AuditModule],
  controllers: [ReportsIntelligenceController],
  providers: [ReportsIntelligenceService],
})
export class ReportsIntelligenceModule {}
