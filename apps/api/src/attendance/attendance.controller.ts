import {
  Controller,
  Get,
  Post,
  Param,
  Query,
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
import { PdfUploadService } from './services/pdf-upload.service';
import { LetterGeneratorService } from './services/letter-generator.service';

const EXCEL_MAX_BYTES = 5 * 1024 * 1024;
const PDF_MAX_BYTES = 10 * 1024 * 1024;
const EXCEL_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);
const EXCEL_EXT = new Set(['.xlsx', '.xls']);
const PDF_MIME = new Set(['application/pdf', 'application/octet-stream']);

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  private readonly logger = new Logger(AttendanceController.name);

  constructor(
    private seeder: ExcelSeederService,
    private uploads: PdfUploadService,
    private letters: LetterGeneratorService,
  ) {}

  @Post('employees/seed')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: EXCEL_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        cb(null, EXCEL_MIME.has(file.mimetype) || EXCEL_EXT.has(ext));
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
    this.logger.log(`Seed by user=${user.id} file="${file.originalname}" size=${file.size}B`);
    return this.seeder.seedFromBuffer(file.buffer);
  }

  @Post('uploads')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PDF_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        cb(null, PDF_MIME.has(file.mimetype) || ext === '.pdf');
      },
    }),
  )
  async uploadDailyPdf(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) {
      throw new BadRequestException('يرجى رفع ملف PDF بحجم لا يتجاوز 10MB');
    }
    this.logger.log(`PDF upload by user=${user.id} file="${file.originalname}" size=${file.size}B`);
    return this.uploads.ingest(file.originalname, file.size, file.buffer, user.id);
  }

  @Get('uploads')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async listUploads() {
    return this.uploads.listUploads();
  }

  @Get('uploads/:id/report')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async getReport(@Param('id') id: string) {
    return this.uploads.getDailyReport(id);
  }

  /**
   * Recompute every DailySummary for one upload using the current analyzer.
   * Use this after deploying analyzer changes (e.g. the on_call status split).
   */
  @Post('uploads/:id/reanalyze')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async reanalyze(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    this.logger.log(`Re-analyze upload=${id} by user=${user.id}`);
    return this.uploads.reanalyze(id);
  }

  /** Re-analyze every past upload. One-shot maintenance for analyzer migrations. */
  @Post('admin/reanalyze-all')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async reanalyzeAll(@CurrentUser() user: { id: string }) {
    this.logger.log(`Re-analyze ALL uploads by user=${user.id}`);
    return this.uploads.reanalyzeAll();
  }

  /** Official Arabic absence letter for one daily upload. */
  @Get('letters/daily/:uploadId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async dailyLetter(
    @Param('uploadId') uploadId: string,
    @Query('recipientName') recipientName?: string,
  ) {
    return this.letters.generateDailyLetter(uploadId, recipientName);
  }

  /**
   * Letter for a date range (e.g. 9 → 24 April).
   *  GET /attendance/letters/range?from=2026-04-09&to=2026-04-24&noteAboutLastDay=true
   */
  @Get('letters/range')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async rangeLetter(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('recipientName') recipientName?: string,
    @Query('noteAboutLastDay') noteAboutLastDay?: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException('يجب تحديد from و to (YYYY-MM-DD)');
    }
    // `from`/`to` arrive as YYYY-MM-DD; parse as UTC-midnight to align with
    // how the daily-summary `reportDate @db.Date` rows are stored.
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    return this.letters.generateRangeLetter(
      start,
      end,
      recipientName,
      { noteAboutLastDay: noteAboutLastDay === 'true' },
    );
  }
}
