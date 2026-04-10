import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  UseGuards, UseInterceptors, Req, UploadedFile as UpFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { Request } from 'express';
import { ScopeBlocksService } from './scope-blocks.service';
import { AuditService } from '../audit/audit.service';
import { EventsGateway } from '../websocket/events.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { fixMulterFilename } from '../common/fix-filename';
import {
  CreateScopeBlockDto, UpdateScopeBlockDto, ImportScopeTextDto,
  UpdateScopeBlockProgressDto, ReorderBlocksDto, CreateScopeBlockUpdateDto,
} from './scope-blocks.dto';

const SCOPE_UPLOADS_DIR = join(process.cwd(), 'uploads', 'scope-attachments');
if (!existsSync(SCOPE_UPLOADS_DIR)) mkdirSync(SCOPE_UPLOADS_DIR, { recursive: true });

@Controller('scope-blocks')
@UseGuards(JwtAuthGuard)
export class ScopeBlocksController {
  constructor(
    private scopeBlocks: ScopeBlocksService,
    private audit: AuditService,
    private ws: EventsGateway,
  ) {}

  // ─── READ: all authenticated users ─────────────────────

  @Get('track/:trackId')
  findByTrack(@Param('trackId') trackId: string) {
    return this.scopeBlocks.findByTrack(trackId);
  }

  @Get('track/:trackId/stats')
  getStats(@Param('trackId') trackId: string) {
    return this.scopeBlocks.getStats(trackId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.scopeBlocks.findById(id);
  }

  @Get(':id/attachments')
  getAttachments(@Param('id') id: string) {
    return this.scopeBlocks.getAttachments(id);
  }

  @Get(':id/updates')
  getUpdates(@Param('id') id: string) {
    return this.scopeBlocks.getUpdates(id);
  }

  // ─── WRITE: admin only (نطاق العمل — مدير النظام فقط) ──

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateScopeBlockDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.scopeBlocks.create(dto);
    await this.audit.log({ actorId: user.id, actionType: 'create', entityType: 'scope_block', entityId: result.id, trackId: dto.trackId, afterData: result as any, ip: req.ip });
    return result;
  }

  @Patch('reorder')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async reorder(@Body() dto: ReorderBlocksDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.scopeBlocks.reorderBlocks(dto.blocks);
    await this.audit.log({ actorId: user.id, actionType: 'reorder', entityType: 'scope_block', afterData: dto.blocks as any, ip: req.ip });
    return result;
  }

  @Patch(':id/progress')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateProgress(@Param('id') id: string, @Body() dto: UpdateScopeBlockProgressDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.scopeBlocks.findById(id);
    const result = await this.scopeBlocks.updateProgress(id, dto);
    await this.audit.log({ actorId: user.id, actionType: 'update_progress', entityType: 'scope_block', entityId: id, trackId: result.trackId, beforeData: before as any, afterData: result as any, ip: req.ip });
    this.ws.emitToTrack(result.trackId, 'scopeBlock.progress', result);
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateScopeBlockDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.scopeBlocks.findById(id);
    const result = await this.scopeBlocks.update(id, dto);
    await this.audit.log({ actorId: user.id, actionType: 'update', entityType: 'scope_block', entityId: id, trackId: result.trackId, beforeData: before as any, afterData: result as any, ip: req.ip });
    this.ws.emitToTrack(result.trackId, 'scopeBlock.updated', result);
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async delete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.scopeBlocks.findById(id);
    const result = await this.scopeBlocks.delete(id);
    await this.audit.log({ actorId: user.id, actionType: 'delete', entityType: 'scope_block', entityId: id, trackId: before?.trackId || undefined, beforeData: before as any, ip: req.ip });
    return result;
  }

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async importFromText(@Body() dto: ImportScopeTextDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.scopeBlocks.importFromText(dto.trackId, dto.text);
    await this.audit.log({ actorId: user.id, actionType: 'import', entityType: 'scope_block', trackId: dto.trackId, afterData: { count: result.count } as any, ip: req.ip });
    return result;
  }

  @Post(':id/attachments')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => { if (!existsSync(SCOPE_UPLOADS_DIR)) mkdirSync(SCOPE_UPLOADS_DIR, { recursive: true }); cb(null, SCOPE_UPLOADS_DIR); },
      filename: (_req, file, cb) => cb(null, 'scope-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + extname(file.originalname)),
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadAttachment(@Param('id') scopeBlockId: string, @UpFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) return { error: 'لم يتم رفع ملف' };
    fixMulterFilename(file);
    const fileUrl = `/uploads/scope-attachments/${file.filename}`;
    return this.scopeBlocks.addAttachment({ scopeBlockId, fileName: file.originalname, fileUrl, fileSize: file.size, uploadedById: user.id });
  }

  @Delete('attachments/:attachmentId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteAttachment(@Param('attachmentId') id: string) {
    return this.scopeBlocks.deleteAttachment(id);
  }

  @Post(':id/updates')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async addUpdate(@Param('id') scopeBlockId: string, @Body() body: { content: string }, @CurrentUser() user: any) {
    return this.scopeBlocks.addUpdate({ scopeBlockId, content: body.content }, user.id);
  }

  @Delete('updates/:updateId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteUpdate(@Param('updateId') id: string) {
    return this.scopeBlocks.deleteUpdate(id);
  }
}
