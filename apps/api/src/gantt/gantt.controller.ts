import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req, Res,
  UseGuards, HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GanttService } from './gantt.service';
import {
  CreateGanttTaskDto, UpdateGanttTaskDto, BulkUpdateDto,
  CreateDependencyDto, UpdateDependencyDto,
  CreateCalendarDto, UpdateCalendarDto,
  CreateResourceAssignmentDto, SetBaselineDto,
  GanttQueryDto,
} from './gantt.dto';

@Controller('gantt')
@UseGuards(JwtAuthGuard)
export class GanttController {
  constructor(private readonly ganttService: GanttService) {}

  // ─── TASKS ───

  @Get('tasks')
  async findAll(@Query() query: GanttQueryDto, @CurrentUser() user: any) {
    return this.ganttService.findAll(query, user ? { sub: user.id, role: user.role } : undefined);
  }

  @Get('tasks/:id')
  async findOne(@Param('id') id: string) {
    return this.ganttService.findOne(id);
  }

  @Post('tasks')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createTask(@Body() dto: CreateGanttTaskDto, @CurrentUser() user: any) {
    return this.ganttService.createTask(dto, user.id);
  }

  @Patch('tasks/:id')
  async updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateGanttTaskDto,
    @CurrentUser() user: any,
  ) {
    return this.ganttService.updateTask(id, dto, user.id);
  }

  @Post('tasks/bulk-update')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async bulkUpdate(@Body() dto: BulkUpdateDto, @CurrentUser() user: any) {
    return this.ganttService.bulkUpdate(dto.tasks, user.id);
  }

  @Get('tasks/:id/delete-info')
  async getDeleteInfo(@Param('id') id: string) {
    return this.ganttService.getDeleteInfo(id);
  }

  @Delete('tasks/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteTask(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ganttService.deleteTask(id, user.id);
  }

  @Post('tasks/:id/undo-delete')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async undoDeleteTask(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ganttService.undoDeleteTask(id, user.id);
  }

  // ─── AUTO-SCHEDULE ───

  @Post('auto-schedule/:trackId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async autoSchedule(@Param('trackId') trackId: string, @CurrentUser() user: any) {
    return this.ganttService.autoSchedule(trackId, user.id);
  }

  // ─── DEPENDENCIES ───

  @Get('dependencies/:taskId')
  async findDependencies(@Param('taskId') taskId: string) {
    return this.ganttService.findDependencies(taskId);
  }

  @Post('dependencies')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createDependency(@Body() dto: CreateDependencyDto, @CurrentUser() user: any) {
    return this.ganttService.createDependency(dto, user.id);
  }

  @Patch('dependencies/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async updateDependency(@Param('id') id: string, @Body() dto: UpdateDependencyDto) {
    return this.ganttService.updateDependency(id, dto);
  }

  @Delete('dependencies/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteDependency(@Param('id') id: string) {
    return this.ganttService.deleteDependency(id);
  }

  // ─── CALENDARS ───

  @Get('calendars')
  async findCalendars() {
    return this.ganttService.findCalendars();
  }

  @Post('calendars')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createCalendar(@Body() dto: CreateCalendarDto) {
    return this.ganttService.createCalendar(dto);
  }

  @Patch('calendars/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async updateCalendar(@Param('id') id: string, @Body() dto: UpdateCalendarDto) {
    return this.ganttService.updateCalendar(id, dto);
  }

  @Delete('calendars/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteCalendar(@Param('id') id: string) {
    return this.ganttService.deleteCalendar(id);
  }

  // ─── RESOURCE ASSIGNMENTS ───

  @Post('resources')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createResourceAssignment(@Body() dto: CreateResourceAssignmentDto) {
    return this.ganttService.createResourceAssignment(dto);
  }

  @Delete('resources/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteResourceAssignment(@Param('id') id: string) {
    return this.ganttService.deleteResourceAssignment(id);
  }

  @Get('resource-load/:userId')
  async getResourceLoad(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ganttService.getResourceLoad(userId, startDate, endDate);
  }

  // ─── BASELINE ───

  @Post('baseline')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async setBaseline(@Body() dto: SetBaselineDto, @Query('trackId') trackId?: string) {
    return this.ganttService.setBaseline(trackId, dto.taskIds);
  }

  // ─── STATS ───

  @Get('stats')
  async getStats(@Query('trackId') trackId?: string) {
    return this.ganttService.getStats(trackId);
  }

  // ─── MS PROJECT EXPORT ───

  @Get('export/msproject.xml')
  async exportMSProject(
    @Query('trackId') trackId: string | undefined,
    @Res() res: Response,
  ) {
    const xml = await this.ganttService.exportMSProject(trackId);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="nusuk-project.xml"');
    res.send(xml);
  }

  // ─── SMART IMPORT (XML / CSV / JSON) ───

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  @HttpCode(200)
  async smartImport(
    @Body() body: { content: string; trackId: string; format?: string },
    @CurrentUser() user: any,
  ) {
    return this.ganttService.smartImport(body.content, body.trackId, user.id, body.format);
  }

  // Legacy endpoint for backward compatibility
  @Post('import/msproject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  @HttpCode(200)
  async importMSProject(
    @Body() body: { xmlContent: string; trackId: string },
    @CurrentUser() user: any,
  ) {
    return this.ganttService.importMSProject(body.xmlContent, body.trackId, user.id);
  }

  // ─── CSV EXPORT ───

  @Get('export/csv')
  async exportCSV(
    @Query('trackId') trackId: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.ganttService.exportCSV(trackId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nusuk-tasks.csv"');
    res.send(csv);
  }
}
