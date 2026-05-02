import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { CustodyFundsModule } from '../../custody-funds/custody-funds.module';
import {
  AIAnalyzerController,
  AIAnalyzerPreviewController,
} from './ai-analyzer.controller';
import { AIAnalyzerService } from './ai-analyzer.service';
import { AIBatchInvoiceService } from './ai-batch-invoice.service';

/**
 * AI Invoice Analyzer — targets CustodyFund (v2), the custody model actually
 * used by /support-services in the UI. Provides both the single-invoice flow
 * (analyze/confirm/cancel) and the batch flow (1–10 invoices in parallel).
 */
@Module({
  imports: [PrismaModule, CustodyFundsModule],
  controllers: [AIAnalyzerController, AIAnalyzerPreviewController],
  providers: [AIAnalyzerService, AIBatchInvoiceService],
})
export class AIAnalyzerModule {}
