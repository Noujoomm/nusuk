import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { CreateDistributionEntryDto } from './distribution.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('distribution')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class DistributionController {
  constructor(private service: DistributionService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('dashboard')
  getDashboard() {
    return this.service.getDashboard();
  }

  @Post()
  create(@Body() dto: CreateDistributionEntryDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
