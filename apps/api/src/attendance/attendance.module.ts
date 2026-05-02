import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ExcelSeederService } from './services/excel-seeder.service';
import { PdfUploadService } from './services/pdf-upload.service';
import { LetterGeneratorService } from './services/letter-generator.service';
import { AttendanceExportService } from './services/attendance-export.service';
import { AbsenceService } from './services/absence.service';
import { AttendanceAnalysisService } from './services/attendance-analysis.service';
import { AttendanceReportDocxService } from './services/attendance-report-docx.service';
import { AttendanceAnalyticsService } from './services/attendance-analytics.service';
import { AttendanceOverrideService } from './services/attendance-override.service';

@Module({
  controllers: [AttendanceController],
  providers: [
    ExcelSeederService,
    PdfUploadService,
    LetterGeneratorService,
    AttendanceExportService,
    AbsenceService,
    AttendanceAnalysisService,
    AttendanceReportDocxService,
    AttendanceAnalyticsService,
    AttendanceOverrideService,
  ],
  exports: [
    ExcelSeederService,
    PdfUploadService,
    LetterGeneratorService,
    AttendanceExportService,
    AbsenceService,
    AttendanceAnalysisService,
    AttendanceReportDocxService,
    AttendanceAnalyticsService,
    AttendanceOverrideService,
  ],
})
export class AttendanceModule {}
