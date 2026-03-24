import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, UseInterceptors, UploadedFile as UpFile, Req, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve as pathResolve } from 'path';
import { existsSync, createReadStream, realpathSync } from 'fs';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { Request, Response } from 'express';
import { fixMulterFilename } from '../common/fix-filename';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(
    private files: FilesService,
    private audit: AuditService,
  ) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('trackId') trackId?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.files.findAll({
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
      trackId,
      category,
      status,
    });
  }

  @Get('stats')
  getStats() {
    return this.files.getStats();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: join(process.cwd(), 'uploads'),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + extname(file.originalname));
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  }))
  async upload(
    @UpFile() file: Express.Multer.File,
    @Body() body: any,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    fixMulterFilename(file);

    const uploaded = await this.files.create({
      trackId: body.trackId || null,
      uploadedById: user.id,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      filePath: file.path,
      category: body.category || 'general',
      notes: body.notes,
    });

    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'file',
      entityId: uploaded.id,
      trackId: body.trackId,
      afterData: { fileName: file.originalname, size: file.size } as any,
      ip: req.ip,
    });

    return uploaded;
  }

  @Post('register')
  async registerFile(@Body() body: any, @CurrentUser() user: any, @Req() req: Request) {
    const uploaded = await this.files.create({
      trackId: body.trackId || null,
      uploadedById: user.id,
      fileName: body.fileName,
      fileSize: body.fileSize || 0,
      mimeType: body.mimeType || 'application/octet-stream',
      filePath: body.filePath || 'external',
      category: body.category || 'general',
      notes: body.notes,
    });

    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'file',
      entityId: uploaded.id,
      ip: req.ip,
    });

    return uploaded;
  }

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: join(process.cwd(), 'uploads'),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'ai-' + uniqueSuffix + extname(file.originalname));
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async analyzeFile(
    @UpFile() file: Express.Multer.File,
    @Body() body: { analysisType?: string },
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const result = await this.files.analyzeFile(
      file.path,
      file.originalname,
      file.mimetype,
      body.analysisType || 'extract',
    );

    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'ai_analysis',
      entityId: file.originalname,
      afterData: { fileName: file.originalname, analysisType: body.analysisType || 'extract' } as any,
      ip: req.ip,
    });

    return { fileName: file.originalname, fileSize: file.size, analysis: result };
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const file = await this.files.findById(id);
    if (!file) throw new NotFoundException('الملف غير موجود');

    const uploadDir = realpathSync(join(process.cwd(), 'uploads'));
    const filePath = realpathSync(file.filePath);

    if (!filePath.startsWith(uploadDir)) {
      throw new NotFoundException('الملف غير موجود');
    }

    if (!existsSync(filePath)) {
      throw new NotFoundException('الملف غير موجود على الخادم');
    }

    res.set({
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'Content-Length': file.fileSize.toString(),
    });
    createReadStream(filePath).pipe(res);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.files.updateStatus(id, body.status);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'file',
      entityId: id,
      afterData: { status: body.status } as any,
      ip: req.ip,
    });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async delete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.files.delete(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'file',
      entityId: id,
      ip: req.ip,
    });
    return result;
  }
}
