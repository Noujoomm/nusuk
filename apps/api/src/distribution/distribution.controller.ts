import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { CreateAchievementDto, CreateDeviationDto } from './distribution.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('distribution')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributionController {
  constructor(private service: DistributionService) {}

  // ─── READ: admin, pm, track_lead ───────────────────────

  @Get('achievement/dashboard')
  @Roles('admin', 'pm', 'track_lead')
  achievementDashboard() { return this.service.achievementDashboard(); }

  @Get('deviation/dashboard')
  @Roles('admin', 'pm', 'track_lead')
  deviationDashboard() { return this.service.deviationDashboard(); }

  // ─── WRITE: admin, track_lead only ─────────────────────

  @Post('achievement')
  @Roles('admin', 'track_lead')
  createAchievement(@Body() dto: CreateAchievementDto, @CurrentUser() user: any) {
    return this.service.createAchievement(dto, user.id);
  }

  @Delete('achievement/:id')
  @Roles('admin', 'track_lead')
  deleteAchievement(@Param('id') id: string) { return this.service.deleteAchievement(id); }

  @Post('deviation')
  @Roles('admin', 'track_lead')
  createDeviation(@Body() dto: CreateDeviationDto, @CurrentUser() user: any) {
    return this.service.createDeviation(dto, user.id);
  }

  @Delete('deviation/:id')
  @Roles('admin', 'track_lead')
  deleteDeviation(@Param('id') id: string) { return this.service.deleteDeviation(id); }
}
