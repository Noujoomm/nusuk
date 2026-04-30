import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ExcelSeederService } from './services/excel-seeder.service';
import { PdfUploadService } from './services/pdf-upload.service';
import { LetterGeneratorService } from './services/letter-generator.service';
import { AttendanceExportService } from './services/attendance-export.service';
import { AbsenceService } from './services/absence.service';
import { AttendanceAnalysisService } from './services/attendance-analysis.service';

@Module({
  controllers: [AttendanceController],
  providers: [
    ExcelSeederService,
    PdfUploadService,
    LetterGeneratorService,
    AttendanceExportService,
    AbsenceService,
    AttendanceAnalysisService,
  ],
  exports: [
    ExcelSeederService,
    PdfUploadService,
    LetterGeneratorService,
    AttendanceExportService,
    AbsenceService,
    AttendanceAnalysisService,
  ],
})
export class AttendanceModule {}
