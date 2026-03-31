import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { CreateAchievementDto, CreateDeviationDto } from './distribution.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('distribution')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm', 'track_lead')
export class DistributionController {
  constructor(private service: DistributionService) {}

  @Get('achievement/dashboard')
  achievementDashboard() { return this.service.achievementDashboard(); }

  @Post('achievement')
  createAchievement(@Body() dto: CreateAchievementDto, @CurrentUser() user: any) {
    return this.service.createAchievement(dto, user.id);
  }

  @Delete('achievement/:id')
  deleteAchievement(@Param('id') id: string) { return this.service.deleteAchievement(id); }

  @Get('deviation/dashboard')
  deviationDashboard() { return this.service.deviationDashboard(); }

  @Post('deviation')
  createDeviation(@Body() dto: CreateDeviationDto, @CurrentUser() user: any) {
    return this.service.createDeviation(dto, user.id);
  }

  @Delete('deviation/:id')
  deleteDeviation(@Param('id') id: string) { return this.service.deleteDeviation(id); }
}
