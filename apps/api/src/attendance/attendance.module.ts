import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ExcelSeederService } from './services/excel-seeder.service';

@Module({
  controllers: [AttendanceController],
  providers: [ExcelSeederService],
  exports: [ExcelSeederService],
})
export class AttendanceModule {}
