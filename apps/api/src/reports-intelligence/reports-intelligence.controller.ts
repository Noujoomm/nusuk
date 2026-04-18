import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { ReportsIntelligenceService } from './reports-intelligence.service';
import {
  CreateIntelligenceSessionDto,
  RegenerateDto,
  UpdateIntelligenceSessionDto,
} from './reports-intelligence.dto';
import { ExportFormat } from './exporters';

const ENTITY = 'intelligence_session';
const ALLOWED_EXPORT: ReadonlyArray<ExportFormat> = ['txt', 'md', 'docx', 'xlsx', 'pptx'];

const TEMPLATE_MAX = 50 * 1024 * 1024; // 50 MB
const tempStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'temp'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});
try {
  mkdirSync(join(process.cwd(), 'uploads', 'temp'), { recursive: true });
} catch { /* best-effort */ }

/**
 * All endpoints: JWT-authenticated and restricted to `admin` or `system_manager`.
 * Intelligence sessions contain cross-organisation summaries; never expose
 * another user's session even to same-role peers (enforced in the service).
 */
@Controller('intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'system_manager')
export class ReportsIntelligenceController {
  constructor(
    private readonly service: ReportsIntelligenceService,
    private readonly audit: AuditService,
  ) {}

  @Get('sessions')
  list(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listMine(user.id, {
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
    });
  }

  @Get('sessions/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findById(id, user.id);
  }

  @Post('sessions')
  async create(
    @Body() dto: CreateIntelligenceSessionDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const session = await this.service.createSession(dto, user.id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: ENTITY,
      entityId: session.id,
      afterData: { outputMode: session.outputMode, status: session.status } as any,
      ip: req.ip,
    });
    return session;
  }

  @Patch('sessions/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateIntelligenceSessionDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const session = await this.service.updateEdited(id, user.id, dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: ENTITY,
      entityId: id,
      ip: req.ip,
    });
    return session;
  }

  @Post('sessions/:id/regenerate')
  async regenerate(
    @Param('id') id: string,
    @Body() dto: RegenerateDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const session = await this.service.regenerate(id, user.id, dto.section);
    await this.audit.log({
      actorId: user.id,
      actionType: 'regenerate',
      entityType: ENTITY,
      entityId: id,
      afterData: { section: dto.section ?? 'all' } as any,
      ip: req.ip,
    });
    return session;
  }

  @Delete('sessions/:id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const out = await this.service.delete(id, user.id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: ENTITY,
      entityId: id,
      ip: req.ip,
    });
    return out;
  }

  // ─── Templates ────────────────────────────────────────────────────────

  @Post('templates')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tempStorage,
      limits: { fileSize: TEMPLATE_MAX },
    }),
  )
  async uploadTemplate(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const tpl = await this.service.uploadTemplate(file, user.id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'upload_template',
      entityType: 'intelligence_template',
      entityId: tpl.id,
      afterData: { originalName: tpl.originalName, sizeBytes: tpl.sizeBytes } as any,
      ip: req.ip,
    });
    return tpl;
  }

  @Get('templates/:id/download')
  async downloadTemplate(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, template } = await this.service.downloadTemplate(id);
    res.setHeader(
      'Content-Type',
      template.mimeType || 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(template.originalName)}`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.status(200).end(buffer);
  }

  // ─── Export generated session ─────────────────────────────────────────

  @Get('sessions/:id/export')
  async exportSession(
    @Param('id') id: string,
    @Query('format') format: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const fmt = (format || '').toLowerCase() as ExportFormat;
    if (!ALLOWED_EXPORT.includes(fmt)) {
      throw new BadRequestException(
        `صيغة التصدير غير مدعومة: ${format}. المدعوم: ${ALLOWED_EXPORT.join(', ')}`,
      );
    }
    const artifact = await this.service.export(id, user.id, fmt);
    res.setHeader('Content-Type', artifact.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
    );
    res.setHeader('Content-Length', artifact.buffer.length);
    res.status(200).end(artifact.buffer);
  }
}
