import { Controller, Get, Post, Body, Query, UseGuards, UseInterceptors, Req, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile as UpFile } from '@nestjs/common';
import { diskStorage } from 'multer';
import { join, extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Request } from 'express';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { ImportDataDto } from './imports.dto';

// Ensure uploads directory exists at startup
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'imports');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  private readonly logger = new Logger('ImportsController');

  constructor(
    private service: ImportsService,
    private audit: AuditService,
  ) {}

  @Get('fields')
  getFields(@Query('entityType') entityType: string) {
    return this.service.getEntityFields(entityType);
  }

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr', 'track_lead')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
        cb(null, UPLOADS_DIR);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'import-' + uniqueSuffix + extname(file.originalname));
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
      // Accept CSV with various MIME types (browsers differ)
      const allowed = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel',      // .xls (and sometimes .csv)
        'text/csv',                       // .csv
        'text/plain',                     // .csv (some browsers)
        'application/csv',               // .csv (some browsers)
        'application/octet-stream',      // generic binary
      ];
      const ext = extname(file.originalname).toLowerCase();
      const validExt = ['.xlsx', '.xls', '.csv'].includes(ext);
      cb(null, allowed.includes(file.mimetype) || validExt);
    },
  }))
  async upload(@UpFile() file: Express.Multer.File) {
    if (!file) return { error: 'الملف غير مدعوم. يرجى رفع ملف Excel (.xlsx) أو CSV (.csv)' };
    this.logger.log(`File uploaded: ${file.originalname} (${file.size} bytes, type: ${file.mimetype})`);
    const ext = extname(file.originalname).toLowerCase();
    const result = await this.service.parseFile(file.path, ext);
    return { ...result, filePath: file.path, fileName: file.originalname };
  }

  @Post('parse-sheet')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr', 'track_lead')
  async parseSheet(@Body() body: { filePath: string; sheetName: string }) {
    const ext = extname(body.filePath).toLowerCase();
    return this.service.parseSheet(body.filePath, body.sheetName, ext);
  }

  @Post('execute')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr', 'track_lead')
  async executeImport(@Body() dto: ImportDataDto, @CurrentUser() user: any, @Req() req: Request) {
    this.logger.log(`Import execute: entityType=${dto.entityType}, rows=${dto.rows?.length}, user=${user.id}`);
    const result = await this.service.importData(dto, user.id);
    this.logger.log(`Import result: inserted=${result.inserted}, skipped=${result.skipped}, errors=${result.errors}`);
    await this.audit.log({
      actorId: user.id,
      actionType: 'import',
      entityType: dto.entityType,
      afterData: { ...result, fileName: dto.fileName } as any,
      ip: req.ip,
    });
    return result;
  }

  @Get('history')
  getHistory(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.service.getHistory({ page, pageSize });
  }
}
