import { Module } from '@nestjs/common';
import { DistributionAnalyzerController } from './distribution-analyzer.controller';
import { DistributionAnalyzerService } from './distribution-analyzer.service';
import { DistributionTrackAccessGuard } from './guards/distribution-track-access.guard';
import { DistributionVisionService } from './services/claude-vision.service';
import { DistributionFileParserService } from './services/distribution-file-parser.service';
import { DistributionComparisonService } from './services/distribution-comparison.service';

/**
 * Distribution Smart Analyzer — Phase 1 (scaffold).
 *
 * Compares user-uploaded distribution data (Excel/CSV/PDF/image) against
 * `DistributionAchievement` rows. Phase 1 ships:
 *   - schema (DistributionAnalysisSession + Discrepancy)
 *   - controller surface for the 6 spec'd endpoints
 *   - access guard (admin/system_manager unrestricted; others must hold
 *     a TrackPermission on the distribution track)
 *
 * Phase 2 will add file-parser + Claude Vision extractor + comparison
 * engine. Phase 5 adds DOCX/Excel report generation. The controller
 * already returns 400/501-style placeholders for those endpoints so the
 * frontend can be built against a stable URL surface.
 */
@Module({
  controllers: [DistributionAnalyzerController],
  providers: [
    DistributionAnalyzerService,
    DistributionTrackAccessGuard,
    DistributionVisionService,
    DistributionFileParserService,
    DistributionComparisonService,
  ],
  exports: [DistributionAnalyzerService],
})
export class DistributionAnalyzerModule {}
