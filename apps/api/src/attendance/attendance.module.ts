import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ExcelSeederService } from './services/excel-seeder.service';
import { PdfUploadService } from './services/pdf-upload.service';
import { LetterGeneratorService } from './services/letter-generator.service';
import { AttendanceExportService } from './services/attendance-export.service';

@Module({
  controllers: [AttendanceController],
  providers: [ExcelSeederService, PdfUploadService, LetterGeneratorService, AttendanceExportService],
  exports: [ExcelSeederService, PdfUploadService, LetterGeneratorService, AttendanceExportService],
})
export class AttendanceModule {}
