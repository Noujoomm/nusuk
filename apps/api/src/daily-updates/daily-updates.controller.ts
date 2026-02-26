import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFiles, Req, Res,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { DailyUpdatesService } from './daily-updates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { CreateDailyUpdateDto, UpdateDailyUpdateDto } from './daily-updates.dto';

const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_MB || '25', 10) * 1024 * 1024;

const tempStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'temp'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

@Controller('daily-updates')
@UseGuards(JwtAuthGuard)
export class DailyUpdatesController {
  constructor(
    private service: DailyUpdatesService,
    private audit: AuditService,
  ) {}

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('type') type?: string,
    @Query('trackId') trackId?: string,
    @Query('search') search?: string,
    @Query('pinned') pinned?: string,
    @Query('priority') priority?: string,
    @CurrentUser() user?: any,
  ) {
    return this.service.findAll({ page, pageSize, type, trackId, search, pinned, priority, userId: user?.id });
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: any) {
    return this.service.getUnreadCount(user.id);
  }

  @Get('attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const { stream, attachment } = await this.service.getAttachmentStream(attachmentId);
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      'Content-Length': attachment.sizeBytes.toString(),
    });
    stream.pipe(res);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser() user: any) {
    return this.service.markAllAsRead(user.id);
  }

  @Post(':id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.markAsRead(id, user.id);
  }

  @Post(':id/attachments')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: tempStorage,
    limits: { fileSize: MAX_FILE_SIZE },
  }))
  async addAttachments(
    @Param('id') updateId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('لم يتم اختيار ملفات');
    }
    return this.service.addAttachments(updateId, files, user.id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: tempStorage,
    limits: { fileSize: MAX_FILE_SIZE },
  }))
  async create(
    @Body() dto: CreateDailyUpdateDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const result = await this.service.create(dto, user.id, files);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'daily_update',
      entityId: result.id,
      trackId: dto.trackId,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async update(@Param('id') id: string, @Body() dto: UpdateDailyUpdateDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.service.findById(id);
    const result = await this.service.update(id, dto, user.id, user.role);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'daily_update',
      entityId: id,
      trackId: before.trackId || undefined,
      beforeData: before as any,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Delete('attachments/:attachmentId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteAttachment(@Param('attachmentId') attachmentId: string) {
    return this.service.deleteAttachment(attachmentId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async delete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.service.findById(id);
    const result = await this.service.delete(id, user.id, user.role);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'daily_update',
      entityId: id,
      trackId: before.trackId || undefined,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch(':id/pin')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async togglePin(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.togglePin(id);
  }
}
