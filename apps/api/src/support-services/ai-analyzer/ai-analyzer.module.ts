import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { CustodyFundsModule } from '../../custody-funds/custody-funds.module';
import {
  AIAnalyzerController,
  AIAnalyzerPreviewController,
} from './ai-analyzer.controller';
import { AIAnalyzerService } from './ai-analyzer.service';

/**
 * AI Invoice Analyzer — targets CustodyFund (v2), the custody model actually
 * used by /support-services in the UI.
 */
@Module({
  imports: [PrismaModule, CustodyFundsModule],
  controllers: [AIAnalyzerController, AIAnalyzerPreviewController],
  providers: [AIAnalyzerService],
})
export class AIAnalyzerModule {}
