import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, UploadedFiles, Req, Res,
  BadRequestException, Logger,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { Request, Response } from 'express';
import { ReportsService } from './reports.service';
import { VoiceFillService } from './voice-fill.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB - no practical limit

const BLOCKED_EXTS = ['.exe', '.js', '.sh', '.bat', '.dll', '.apk', '.cmd', '.com', '.msi', '.ps1', '.vbs', '.wsf', '.scr', '.pif'];

const tempStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'temp'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const ext = extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTS.includes(ext)) {
    return cb(new BadRequestException(`نوع الملف غير مسموح: ${ext}`), false);
  }
  cb(null, true);
};

// Ensure temp dir exists
import { mkdirSync } from 'fs';
try { mkdirSync(join(process.cwd(), 'uploads', 'temp'), { recursive: true }); } catch {}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private audit: AuditService,
    private voiceFill: VoiceFillService,
  ) {}

  /**
   * يستقبل تسجيل صوتي ويُرجع مقترحاً لحقول التقرير (transcription + fields).
   * المستخدم يراجعها ويعدّلها في النموذج ثم يحفظ التقرير عبر POST العادي
   * — لا حفظ تلقائي. الصوت لا يُخزّن (transcribe-then-discard).
   */
  @Post('voice-fill')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async voiceFillReport(
    @UploadedFile() audio: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    const result = await this.voiceFill.fillFromAudio(audio);
    new Logger('ReportsController').log(
      `voice-fill by user=${user.id} bytes=${audio?.size ?? 0} chars=${result.transcription.length}`,
    );
    return result;
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('trackId') trackId?: string,
    @Query('type') type?: string,
    @Query('authorId') authorId?: string,
  ) {
    return this.reports.findAll({
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
      trackId,
      type,
      authorId,
    });
  }

  @Get('stats')
  getStats() {
    return this.reports.getStats();
  }

  @Get('attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    try {
      const { buffer, attachment } = await this.reports.getAttachmentBuffer(attachmentId);
      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
      res.setHeader('Content-Length', buffer.length);
      res.status(200).end(buffer);
    } catch (e: any) {
      Logger.error(`[Download Error] ${attachmentId}: ${e.message}`, undefined, 'ReportsController');
      if (!res.headersSent) {
        const msg = e.message || '';
        const is404 = msg.includes('not found') || msg.includes('غير موجود') || e.status === 404;
        res.status(is404 ? 404 : 500).json({
          message: is404 ? 'المرفق غير موجود أو حُذف أثناء تحديث النظام' : 'فشل تحميل الملف، حاول مرة أخرى',
        });
      }
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reports.findById(id);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any, @Req() req: Request) {
    const report = await this.reports.create({ ...body, authorId: user.id });
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'report',
      entityId: report.id,
      trackId: body.trackId,
      afterData: report as any,
      ip: req.ip,
    });
    return report;
  }

  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 20, {
    storage: tempStorage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
  }))
  async addAttachments(
    @Param('id') reportId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('لم يتم اختيار ملفات');
    }
    return this.reports.addAttachments(reportId, files, user.id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.reports.findById(id);
    const report = await this.reports.update(id, body);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'report',
      entityId: id,
      beforeData: before as any,
      afterData: report as any,
      ip: req.ip,
    });
    return report;
  }

  @Delete('attachments/:attachmentId')
  async deleteAttachment(@Param('attachmentId') attachmentId: string) {
    return this.reports.deleteAttachment(attachmentId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.reports.findById(id);
    const result = await this.reports.delete(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'report',
      entityId: id,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }
}
