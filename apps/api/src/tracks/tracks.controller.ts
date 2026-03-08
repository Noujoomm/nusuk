import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { TracksService } from './tracks.service';
import { PrismaService } from '../common/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { PptxImportService, ExtractedUpdate } from './pptx-import.service';
import {
  CreateTrackDto,
  UpdateTrackDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateDeliverableDto,
  UpdateDeliverableDto,
  CreateScopeDto,
  UpdateScopeDto,
  CreateTrackKPIDto,
  UpdateTrackKPIDto,
  CreatePenaltyDto,
  UpdatePenaltyDto,
} from './tracks.dto';

@Controller('tracks')
@UseGuards(JwtAuthGuard)
export class TracksController {
  constructor(
    private tracks: TracksService,
    private audit: AuditService,
    private prisma: PrismaService,
    private pptxImport: PptxImportService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.tracks.findAll(user.id, user.role);
  }

  @Get('employees')
  getEmployees(
    @Query('trackId') trackId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.tracks.getEmployees({ trackId, search, status });
  }

  @Get('penalties')
  getPenalties(@Query('trackId') trackId?: string, @Query('resolved') resolved?: string) {
    return this.tracks.getPenalties({ trackId, resolved });
  }

  @Patch('penalties/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  updatePenalty(@Param('id') id: string, @Body() body: any) {
    return this.tracks.updatePenalty(id, body);
  }

  // ─── EMPLOYEE CRUD ───

  @Post('employees')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  async createEmployee(@Body() dto: CreateEmployeeDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.createEmployee(dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'employee',
      entityId: result.id,
      trackId: dto.trackId,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('employees/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  async updateEmployee(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    const result = await this.tracks.updateEmployee(id, dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'employee',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Delete('employees/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  async deleteEmployee(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    const result = await this.tracks.deleteEmployee(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'employee',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }

  @Post('employees/bulk-delete')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  async bulkDeleteEmployees(@Body() body: { ids: string[] }, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.bulkDeleteEmployees(body.ids);
    await this.audit.log({
      actorId: user.id,
      actionType: 'bulk_delete',
      entityType: 'employee',
      afterData: { ids: body.ids, count: result.count } as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('employees/:id/restore')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  async restoreEmployee(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.restoreEmployee(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'restore',
      entityType: 'employee',
      entityId: id,
      ip: req.ip,
    });
    return result;
  }

  // ─── DELIVERABLE CRUD ───

  @Post('deliverables')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createDeliverable(@Body() dto: CreateDeliverableDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.createDeliverable(dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'deliverable',
      entityId: result.id,
      trackId: dto.trackId,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('deliverables/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async updateDeliverable(@Param('id') id: string, @Body() dto: UpdateDeliverableDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.deliverable.findUnique({ where: { id } });
    const result = await this.tracks.updateDeliverable(id, dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'deliverable',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Delete('deliverables/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteDeliverable(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.deliverable.findUnique({ where: { id } });
    const result = await this.tracks.deleteDeliverable(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'deliverable',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('deliverables/:id/restore')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async restoreDeliverable(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.restoreDeliverable(id);
    await this.audit.log({ actorId: user.id, actionType: 'restore', entityType: 'deliverable', entityId: id, ip: req.ip });
    return result;
  }

  // ─── SCOPE CRUD ───

  @Post('scopes')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createScope(@Body() dto: CreateScopeDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.createScope(dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'scope',
      entityId: result.id,
      trackId: dto.trackId,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('scopes/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async updateScope(@Param('id') id: string, @Body() dto: UpdateScopeDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.scope.findUnique({ where: { id } });
    const result = await this.tracks.updateScope(id, dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'scope',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Delete('scopes/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteScope(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.scope.findUnique({ where: { id } });
    const result = await this.tracks.deleteScope(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'scope',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('scopes/:id/restore')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async restoreScope(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.restoreScope(id);
    await this.audit.log({ actorId: user.id, actionType: 'restore', entityType: 'scope', entityId: id, ip: req.ip });
    return result;
  }

  // ─── TRACK KPI CRUD ───

  @Post('track-kpis')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createTrackKPI(@Body() dto: CreateTrackKPIDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.createTrackKPI(dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'track_kpi',
      entityId: result.id,
      trackId: dto.trackId,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('track-kpis/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async updateTrackKPI(@Param('id') id: string, @Body() dto: UpdateTrackKPIDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.trackKPI.findUnique({ where: { id } });
    const result = await this.tracks.updateTrackKPI(id, dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'track_kpi',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Delete('track-kpis/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deleteTrackKPI(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.trackKPI.findUnique({ where: { id } });
    const result = await this.tracks.deleteTrackKPI(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'track_kpi',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }

  @Patch('track-kpis/:id/restore')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async restoreTrackKPI(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.restoreTrackKPI(id);
    await this.audit.log({ actorId: user.id, actionType: 'restore', entityType: 'track_kpi', entityId: id, ip: req.ip });
    return result;
  }

  // ─── PENALTY CREATE & DELETE ───

  @Post('penalties')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async createPenalty(@Body() dto: CreatePenaltyDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.tracks.createPenalty(dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'penalty',
      entityId: result.id,
      trackId: dto.trackId,
      afterData: result as any,
      ip: req.ip,
    });
    return result;
  }

  @Delete('penalties/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async deletePenalty(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.prisma.penalty.findUnique({ where: { id } });
    const result = await this.tracks.deletePenalty(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'penalty',
      entityId: id,
      trackId: before?.trackId || undefined,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }

  // ─── PPTX IMPORT ───

  @Post('pptx-extract')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  @HttpCode(200)
  async extractPptx(
    @Body() body: { content: string; trackId: string },
    @CurrentUser() user: any,
  ) {
    return this.pptxImport.extractFromPptx(body.content, body.trackId);
  }

  @Post('pptx-apply')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  @HttpCode(200)
  async applyPptxUpdates(
    @Body() body: { trackId: string; updates: ExtractedUpdate[] },
    @CurrentUser() user: any,
  ) {
    return this.pptxImport.applyUpdates(body.trackId, body.updates, user.sub);
  }

  @Post('file-extract')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  @HttpCode(200)
  async extractFile(
    @Body() body: { content: string; trackId: string; fileName: string },
    @CurrentUser() user: any,
  ) {
    return this.pptxImport.extractFromFile(body.content, body.trackId, body.fileName);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tracks.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async create(@Body() dto: CreateTrackDto, @CurrentUser() user: any, @Req() req: Request) {
    const track = await this.tracks.create(dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'create',
      entityType: 'track',
      entityId: track.id,
      afterData: track as any,
      ip: req.ip,
    });
    return track;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async update(@Param('id') id: string, @Body() dto: UpdateTrackDto, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.tracks.findById(id);
    const track = await this.tracks.update(id, dto);
    await this.audit.log({
      actorId: user.id,
      actionType: 'update',
      entityType: 'track',
      entityId: id,
      trackId: id,
      beforeData: before as any,
      afterData: track as any,
      ip: req.ip,
    });
    return track;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async delete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    const before = await this.tracks.findById(id);
    const result = await this.tracks.delete(id);
    await this.audit.log({
      actorId: user.id,
      actionType: 'delete',
      entityType: 'track',
      entityId: id,
      beforeData: before as any,
      ip: req.ip,
    });
    return result;
  }
}
