import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExcelSeederService } from './services/excel-seeder.service';

const EXCEL_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/octet-stream', // some browsers
]);
const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls']);

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  private readonly logger = new Logger(AttendanceController.name);

  constructor(private seeder: ExcelSeederService) {}

  /**
   * POST /attendance/employees/seed
   *
   * One-time bootstrap (or refresh) of the employee master list from the HR
   * Excel workbook. The summary sheet supplies every employee; per-track
   * sheets refine shiftType / scheduled times.
   */
  @Post('employees/seed')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: EXCEL_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const ok = EXCEL_MIME_TYPES.has(file.mimetype) || EXCEL_EXTENSIONS.has(ext);
        cb(null, ok);
      },
    }),
  )
  async seedEmployees(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) {
      throw new BadRequestException('يرجى رفع ملف Excel (.xlsx أو .xls) بحجم لا يتجاوز 5MB');
    }
    this.logger.log(
      `Seed by user=${user.id} file="${file.originalname}" size=${file.size}B mime=${file.mimetype}`,
    );
    return this.seeder.seedFromBuffer(file.buffer);
  }
}
