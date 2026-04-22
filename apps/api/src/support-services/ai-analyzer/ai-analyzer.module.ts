import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { SupportServicesModule } from '../support-services.module';
import {
  AIAnalyzerController,
  AIAnalyzerPreviewController,
} from './ai-analyzer.controller';
import { AIAnalyzerService } from './ai-analyzer.service';

/**
 * AI Invoice Analyzer — Claude Vision OCR + classification + risk scoring
 * for custody invoices. Registered under support-services so permissions
 * and navigation are consistent.
 *
 * Peer-reviewed by docs/AI_INVOICE_ANALYZER_README.md.
 */
@Module({
  imports: [PrismaModule, SupportServicesModule],
  controllers: [AIAnalyzerController, AIAnalyzerPreviewController],
  providers: [AIAnalyzerService],
})
export class AIAnalyzerModule {}
