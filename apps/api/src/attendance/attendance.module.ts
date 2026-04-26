import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ExcelSeederService } from './services/excel-seeder.service';
import { PdfUploadService } from './services/pdf-upload.service';

@Module({
  controllers: [AttendanceController],
  providers: [ExcelSeederService, PdfUploadService],
  exports: [ExcelSeederService, PdfUploadService],
})
export class AttendanceModule {}
