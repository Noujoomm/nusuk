import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, UseInterceptors, UploadedFile as UpFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { Request } from 'express';

const TASK_UPLOADS_DIR = join(process.cwd(), 'uploads', 'tasks');
try { mkdirSync(TASK_UPLOADS_DIR, { recursive: true }); } catch {}
import { TasksService } from './tasks.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateTaskDto, UpdateTaskDto, UpdateTaskStatusDto, AssignTaskDto,
  CreateChecklistItemDto, UpdateChecklistItemDto,
  CreateAdminNoteDto, UpdateAdminNoteDto,
  CreateTaskUpdateDto,
} from './tasks.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private tasks: TasksService,
    private audit: AuditService,
  ) {}

  /**
   * GET /tasks - Returns tasks visible to the current user.
   * Admin/PM sees all. Others see filtered by assignment rules.
   * Supports tab query: my, track, hr, all
   */
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('trackId') trackId?: string,
    @Query('assigneeType') assigneeType?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('search') search?: string,
    @Query('overdue') overdue?: string,
    @Query('dueDateFrom') dueDateFrom?: string,
    @Query('dueDateTo') dueDateTo?: string,
    @Query('tab') tab?: string,
  ) {
    return this.tasks.findVisible(user, {
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
      status,
      priority,
      trackId,
      assigneeType,
      assigneeId,
      search,
      overdue: overdue === 'true',
      dueDateFrom,
      dueDateTo,
      tab,
    });
  }

  @Get('my')
  findMyTasks(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.tasks.findByUser(user.id, {
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
      status,
    });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getStats(@Query('trackId') trackId?: string) {
    return this.tasks.getStats(trackId);
  }

  @Get('executive/stats')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getExecutiveStats() {
    return this.tasks.getExecutiveStats();
  }

  @Get('track/:trackId')
  findByTrack(
    @Param('trackId') trackId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.tasks.findByTrack(trackId, {
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
      status,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findById(id);
  }

  @Get(':id/audit')
  getTaskAudit(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tasks.getTaskAuditLog(id, {
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: any, @Req() req: Request) {
    const task = await this.tasks.create(dto, user.id);

    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'task',
      entityId: task.id,
      trackId: dto.trackId,
      afterData: task as any,
      ip: req.ip,
    });

    return task;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: any, @Req() req: Request) {
    const task = await this.tasks.update(id, dto, user.id);
    return task;
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.tasks.updateStatus(id, dto.status, user.id);
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async assign(@Param('id') id: string, @Body() dto: AssignTaskDto, @CurrentUser() user: any, @Req() req: Request) {
    const task = await this.tasks.assign(id, dto.userIds, user.id);

    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'task',
      entityId: id,
      trackId: task.trackId || undefined,
      afterData: { assignedUserIds: dto.userIds } as any,
      ip: req.ip,
    });

    return task;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async delete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tasks.delete(id, user.id);
    return result;
  }

  // ─── Checklist Endpoints ───

  @Get(':id/checklist')
  getChecklist(@Param('id') id: string) {
    return this.tasks.getChecklist(id);
  }

  @Post(':id/checklist')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  createChecklistItem(
    @Param('id') id: string,
    @Body() dto: CreateChecklistItemDto,
    @CurrentUser() user: any,
  ) {
    return this.tasks.createChecklistItem(id, dto, user.id);
  }

  @Patch(':id/checklist/:itemId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  updateChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: any,
  ) {
    return this.tasks.updateChecklistItem(id, itemId, dto, user.id);
  }

  @Delete(':id/checklist/:itemId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  deleteChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
  ) {
    return this.tasks.deleteChecklistItem(id, itemId, user.id);
  }

  // ─── Admin Notes Endpoints ───

  @Get(':id/admin-notes')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getAdminNotes(@Param('id') id: string) {
    return this.tasks.getAdminNotes(id);
  }

  @Post(':id/admin-notes')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  createAdminNote(
    @Param('id') id: string,
    @Body() dto: CreateAdminNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.tasks.createAdminNote(id, dto, user.id);
  }

  @Patch(':id/admin-notes/:noteId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  updateAdminNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateAdminNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.tasks.updateAdminNote(id, noteId, dto, user.id);
  }

  @Delete(':id/admin-notes/:noteId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  deleteAdminNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: any,
  ) {
    return this.tasks.deleteAdminNote(id, noteId, user.id);
  }

  // ─── Task Updates Endpoints ───

  @Get(':id/updates')
  getTaskUpdates(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tasks.getTaskUpdates(id, {
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
    });
  }

  @Post(':id/updates')
  createTaskUpdate(
    @Param('id') id: string,
    @Body() dto: CreateTaskUpdateDto,
    @CurrentUser() user: any,
  ) {
    return this.tasks.createTaskUpdate(id, dto, user.id);
  }

  @Delete(':id/updates/:updateId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  deleteTaskUpdate(
    @Param('id') id: string,
    @Param('updateId') updateId: string,
    @CurrentUser() user: any,
  ) {
    return this.tasks.deleteTaskUpdate(id, updateId, user.id);
  }

  // ─── Task Files Endpoints ───

  @Get(':id/files')
  getTaskFiles(@Param('id') id: string) {
    return this.tasks.getTaskFiles(id);
  }

  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: TASK_UPLOADS_DIR,
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + extname(file.originalname));
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  uploadTaskFile(
    @Param('id') id: string,
    @UpFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.tasks.uploadTaskFile(id, {
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      filePath: file.path,
    }, user.id);
  }

  @Delete(':id/files/:fileId')
  deleteTaskFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
  ) {
    return this.tasks.deleteTaskFile(id, fileId, user.id);
  }
}
