import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { BioTimeClient } from './biotime.client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(
    private service: AttendanceService,
    private biotime: BioTimeClient,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr')
  getDailyAttendance(@Query('date') date?: string) {
    return this.service.getDailyAttendance(date);
  }

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'hr')
  getSummary(@Query('date') date?: string) {
    return this.service.getSummary(date);
  }

  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles('admin')
  syncNow() {
    return this.service.syncAttendance('manual');
  }

  @Post('test-connection')
  @UseGuards(RolesGuard)
  @Roles('admin')
  testConnection() {
    return this.biotime.testConnection();
  }

  @Get('config')
  @UseGuards(RolesGuard)
  @Roles('admin')
  getConfig() {
    return this.service.getConfig();
  }

  @Post('config')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateConfig(@Body() data: any) {
    return this.service.updateConfig(data);
  }

  @Get('sync-logs')
  @UseGuards(RolesGuard)
  @Roles('admin')
  getSyncLogs(@Query('limit') limit?: string) {
    return this.service.getSyncLogs(limit ? parseInt(limit) : 20);
  }
}
