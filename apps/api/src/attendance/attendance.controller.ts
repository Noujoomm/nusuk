import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExcelSeederService } from './services/excel-seeder.service';
import { PdfUploadService } from './services/pdf-upload.service';
import { LetterGeneratorService } from './services/letter-generator.service';
import { AttendanceExportService, ExportScope } from './services/attendance-export.service';
import { AbsenceService } from './services/absence.service';
import { AttendanceAnalysisService } from './services/attendance-analysis.service';
import { AttendanceReportDocxService } from './services/attendance-report-docx.service';
import { AttendanceAnalyticsService, AnalyticsScope, Center } from './services/attendance-analytics.service';
import { AttendanceOverrideService } from './services/attendance-override.service';
import { AttendanceManualStatus } from '@prisma/client';
import { BulkAbsenceDto, GetEmployeesByTrackBookletDto } from './dto/absence.dto';
import { fixMulterFilename } from '../common/fix-filename';
import { setFileResponseHeaders } from '../common/utils/file-response.util';

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
    private exporter: AttendanceExportService,
    private absences: AbsenceService,
    private analysis: AttendanceAnalysisService,
    private reportDocx: AttendanceReportDocxService,
    private analytics: AttendanceAnalyticsService,
    private overrides: AttendanceOverrideService,
  ) {}

  // ─── AI ANALYSIS (cached in DB, refresh on demand) ───

  @Get('uploads/:id/analysis')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async getAnalysis(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.analysis.getOrCreateAnalysis(id, user.id, false);
  }

  @Post('uploads/:id/analysis/refresh')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async refreshAnalysis(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.analysis.getOrCreateAnalysis(id, user.id, true);
  }

  @Delete('uploads/:id/analysis')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async deleteAnalysis(@Param('id') id: string) {
    return this.analysis.deleteAnalysis(id);
  }

  @Get('uploads/:id/analysis/exists')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async hasAnalysis(@Param('id') id: string) {
    const exists = await this.analysis.hasAnalysis(id);
    return { exists };
  }

  /** Bulk existence check for the uploads list page (avoids N requests). */
  @Post('uploads/analysis/exists-many')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async hasAnalysisMany(@Body() body: { ids: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string').slice(0, 200) : [];
    return this.analysis.hasAnalysisMany(ids);
  }

  // ─── CROSS-PERIOD ANALYTICS ─────────────────────────────────────────
  // Aggregates PdfDailyAttendanceSummary rows across an arbitrary date
  // range. Different from /uploads/:id/analysis (which is per-file) —
  // this powers the /attendance-analytics dashboard with trends, ranking,
  // anomalies, and a date×employee heatmap.

  /** Privileged dashboard — RBAC restricts scope on non-admin roles. */
  @Get('analytics/dashboard')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async analyticsDashboard(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('trackName') trackName: string | undefined,
    @Query('center') center: string | undefined,
    @Query('rosterOnly') rosterOnly: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: { role: string; trackPermissions?: Array<{ trackId: string; permissions: string[] }> },
  ) {
    if (!from || !to) {
      throw new BadRequestException('يجب تحديد الفترة (from + to)');
    }
    const scope: AnalyticsScope = {
      trackName: trackName || null,
      center: (center as Center) || 'all',
      rosterOnly: rosterOnly === 'true' || rosterOnly === '1',
      employeeId: employeeId || null,
    };
    // RBAC narrowing: pm/track_lead may only see tracks they own. We can't
    // check here without resolving Track→trackName; accepting the user's
    // explicit filter and trusting RolesGuard to gate role membership.
    // hr/admin/system_manager → no scope narrowing.
    return this.analytics.analyze(from, to, scope);
  }

  /** Diagnostic snapshot — exposes city tag distribution on both employees
   *  and summaries so the UI can show "X موظف بدون مدينة محددة" and the
   *  user can debug missing-data complaints. */
  @Get('analytics/coverage')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async analyticsCoverage() {
    return this.analytics.coverage();
  }

  /** Self-view — any authenticated user can see their own data. The
   * caller doesn't need to pass employeeId; the service resolves it
   * from the requesting user's identity (best-effort: maps user.email
   * to PdfAttendanceEmployee.fullName via legacy lookup). For now
   * we require an explicit employeeId param to keep this stub honest. */
  @Get('analytics/employee/:employeeId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async analyticsEmployee(
    @Param('employeeId') employeeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() _user: { id: string; role: string },
  ) {
    if (!from || !to) {
      throw new BadRequestException('يجب تحديد الفترة (from + to)');
    }
    return this.analytics.analyze(from, to, { employeeId });
  }

  // ─── MANUAL STATUS OVERRIDES ────────────────────────────────────────
  // Lets an authorized human flip a single (employee, day) cell in the
  // analytics heatmap to PRESENT / LATE / ABSENT / EXCUSED_ABSENCE,
  // overriding the auto-derived status. Stored in a separate table so
  // reanalyze() can't wipe the edit. Audit trail in
  // attendance_status_override_logs.

  @Patch('status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager', 'pm', 'track_lead', 'hr')
  async updateStatus(
    @Body() body: { employeeId: string; date: string; status: AttendanceManualStatus; reason?: string },
    @CurrentUser() user: { id: string },
  ) {
    if (!body?.employeeId || !body?.date || !body?.status) {
      throw new BadRequestException('employeeId و date و status حقول مطلوبة');
    }
    const allowed: AttendanceManualStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED_ABSENCE'];
    if (!allowed.includes(body.status)) {
      throw new BadRequestException('قيمة الحالة غير صالحة');
    }
    return this.overrides.upsert(
      {
        employeeId: body.employeeId,
        date: new Date(body.date),
        status: body.status,
        reason: body.reason,
      },
      user.id,
    );
  }

  /** Apply the same status to many cells in one atomic transaction.
   *  Frontend uses this when the user drag-selects across the heatmap. */
  @Patch('bulk-status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager', 'pm', 'track_lead', 'hr')
  async bulkUpdateStatus(
    @Body()
    body: {
      cells: Array<{ employeeId: string; date: string }>;
      status: AttendanceManualStatus;
      reason?: string;
    },
    @CurrentUser() user: { id: string },
  ) {
    if (!body?.cells || !Array.isArray(body.cells) || body.cells.length === 0) {
      throw new BadRequestException('cells array مطلوبة وغير فارغة');
    }
    const allowed: AttendanceManualStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED_ABSENCE'];
    if (!allowed.includes(body.status)) {
      throw new BadRequestException('قيمة الحالة غير صالحة');
    }
    return this.overrides.bulkUpsert(body.cells, body.status, body.reason ?? null, user.id);
  }

  @Delete('status/:employeeId/:date')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager', 'pm', 'track_lead', 'hr')
  async clearStatus(
    @Param('employeeId') employeeId: string,
    @Param('date') date: string,
  ) {
    return this.overrides.remove(employeeId, new Date(date));
  }

  @Get('status/:employeeId/:date/history')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager', 'pm', 'track_lead', 'hr')
  async statusHistory(
    @Param('employeeId') employeeId: string,
    @Param('date') date: string,
  ) {
    return this.overrides.history(employeeId, new Date(date));
  }

  // ─── BULK ABSENCE BY TRACK + BOOKLET ───

  @Get('employees-by-track-booklet')
  async getEmployeesByTrackBooklet(@Query() query: GetEmployeesByTrackBookletDto) {
    return this.absences.getEmployeesByTrackAndBooklet(query);
  }

  @Post('absences/bulk')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr', 'track_lead')
  async createBulkAbsence(@Body() dto: BulkAbsenceDto, @CurrentUser() user: { id: string }) {
    return this.absences.createBulkAbsence(user.id, dto);
  }

  @Get('absences/report')
  async getAbsenceReport(
    @Query('trackId') trackId: string,
    @Query('bookletId') bookletId: string,
    @Query('date') date: string,
  ) {
    if (!trackId || !bookletId || !date) {
      throw new BadRequestException('trackId و bookletId و date مطلوبة');
    }
    return this.absences.getAbsenceReport(trackId, bookletId, date);
  }

  @Patch('absences/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr')
  async approveAbsence(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.absences.approve(id, user.id);
  }

  @Patch('absences/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr')
  async rejectAbsence(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.absences.reject(id, user.id);
  }

  @Delete('absences/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr')
  async deleteAbsence(@Param('id') id: string) {
    return this.absences.deleteAbsence(id);
  }

  /** Backfill the `center` column for legacy employees whose row was
   *  written before deriveCenter() existed. Reads each employee's track
   *  string and infers the city from "(مكة المكرمة)" / "(المدينة المنورة)"
   *  markers. Idempotent — safe to hit multiple times. */
  @Post('employees/backfill-center')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async backfillCenter() {
    return this.seeder.backfillCenters();
  }

  @Post('employees/seed')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
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
  @Roles('admin', 'system_manager')
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
    @Body('centerOverride') centerOverride: string | undefined,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) {
      throw new BadRequestException('يرجى رفع ملف PDF بحجم لا يتجاوز 10MB');
    }
    fixMulterFilename(file);
    const override =
      centerOverride === 'makkah' || centerOverride === 'madinah' ? centerOverride : null;
    this.logger.log(
      `PDF upload by user=${user.id} file="${file.originalname}" size=${file.size}B center=${override ?? 'auto'}`,
    );
    return this.uploads.ingest(file.originalname, file.size, file.buffer, user.id, override);
  }

  @Get('uploads')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async listUploads(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('center') center?: string,
  ) {
    const c = center === 'makkah' || center === 'madinah' || center === 'mixed' || center === 'all' ? center : undefined;
    return this.uploads.listUploads({
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      center: c,
    });
  }

  @Get('uploads/:id/report')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async getReport(@Param('id') id: string) {
    return this.uploads.getDailyReport(id);
  }

  /** Distinct unmatched (rawName, rawEmployeeNumber) pairs from this upload —
   *  one row per real person, with punch counts and date range. Drives the
   *  "إدارة غير المطابقة" dialog. */
  @Get('uploads/:id/unmatched-grouped')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async unmatchedGrouped(@Param('id') id: string) {
    return this.uploads.getUnmatchedGrouped(id);
  }

  /** Bulk-create master-roster entries from unmatched PDF rows + relink
   *  records across uploads + reanalyze affected uploads in one shot. */
  @Post('unmatched/create-employees')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async resolveUnmatched(
    @Body() body: { items: any[] },
  ) {
    if (!body || !Array.isArray(body.items)) {
      throw new BadRequestException('يجب تمرير قائمة الموظفين');
    }
    return this.uploads.createEmployeesFromUnmatched(body.items);
  }

  /**
   * Original PDF download. Returns the bytes with the original (Arabic)
   * filename. Records the download in the audit table.
   */
  @Get('uploads/:id/download')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async downloadFile(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const file = await this.uploads.downloadFile(id, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setFileResponseHeaders(res, file.fileName, file.mimeType, file.buffer.length, 'attachment');
    if (file.checksum) res.setHeader('X-File-Checksum-SHA256', file.checksum);
    return res.send(file.buffer);
  }

  /** Same bytes, but `Content-Disposition: inline` so the browser previews. */
  @Get('uploads/:id/preview')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async previewFile(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const file = await this.uploads.downloadFile(id, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setFileResponseHeaders(res, file.fileName, file.mimeType, file.buffer.length, 'inline');
    return res.send(file.buffer);
  }

  @Delete('uploads/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async deleteUpload(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    this.logger.log(`Deleting upload=${id} by user=${user.id}`);
    await this.uploads.deleteUpload(id);
    return { success: true };
  }

  @Get('uploads/:id/downloads')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async getDownloadHistory(@Param('id') id: string) {
    return this.uploads.getDownloadHistory(id);
  }

  /**
   * Recompute every DailySummary for one upload using the current analyzer.
   * Use this after deploying analyzer changes (e.g. the on_call status split).
   */
  @Post('uploads/:id/reanalyze')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async reanalyze(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    this.logger.log(`Re-analyze upload=${id} by user=${user.id}`);
    return this.uploads.reanalyze(id);
  }

  /** Re-analyze every past upload. One-shot maintenance for analyzer migrations. */
  @Post('admin/reanalyze-all')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async reanalyzeAll(@CurrentUser() user: { id: string }) {
    this.logger.log(`Re-analyze ALL uploads by user=${user.id}`);
    return this.uploads.reanalyzeAll();
  }

  /** Official Arabic absence letter for one daily upload. */
  @Get('letters/daily/:uploadId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
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
  @Roles('admin', 'system_manager')
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

  /**
   * تصدير تقرير حضور إلى Excel.
   *  - scope=all   → ملخص شامل + pivot بالمسار + pivot بالمركز + sheet لكل مسار
   *  - scope=track → فقط الموظفون في `filter` (اسم المسار)
   *  - scope=center→ فقط المركز المحدد (makkah | madinah | shared)
   */
  /**
   * Comprehensive Word report — one DOCX per upload with cover, KPIs,
   * per-track / per-city / charter sections, and a section per employee
   * showing their daily timeline.
   */
  @Get('uploads/:id/export.docx')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async exportDocx(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.reportDocx.generate(id);
    setFileResponseHeaders(
      res,
      filename,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer.length,
      'attachment',
    );
    return res.send(buffer);
  }

  @Get('uploads/:id/export.xlsx')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system_manager')
  async exportXlsx(
    @Param('id') id: string,
    @Query('scope') scope: ExportScope = 'all',
    @Query('filter') filter: string | undefined,
    @Query('rosterOnly') rosterOnly: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.exporter.exportXlsx(
      id,
      scope,
      filter,
      rosterOnly === 'true' || rosterOnly === '1',
    );
    setFileResponseHeaders(
      res,
      filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer.length,
      'attachment',
    );
    return res.send(buffer);
  }
}
