import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ExcelSeederService } from './services/excel-seeder.service';
import { PdfUploadService } from './services/pdf-upload.service';
import { LetterGeneratorService } from './services/letter-generator.service';

@Module({
  controllers: [AttendanceController],
  providers: [ExcelSeederService, PdfUploadService, LetterGeneratorService],
  exports: [ExcelSeederService, PdfUploadService, LetterGeneratorService],
})
export class AttendanceModule {}
