import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { parsePage, parseLimit } from '../common/utils/pagination.util';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('trackId') trackId?: string,
    @Query('entityType') entityType?: string,
    @Query('actionType') actionType?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.audit.findAll({
      page: parsePage(page),
      pageSize: parseLimit(pageSize),
      trackId,
      entityType,
      actionType,
      actorId,
    });
  }
}
