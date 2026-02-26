import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { DailyUpdatesService } from './daily-updates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { CreateDailyUpdateDto, UpdateDailyUpdateDto } from './daily-updates.dto';

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
  ) {
    return this.service.findAll({ page, pageSize, type, trackId, search, pinned, priority });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateDailyUpdateDto, @CurrentUser() user: any, @Req() req: Request) {
    const result = await this.service.create(dto, user.id);
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

  @Delete(':id')
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
