import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, Logger,
} from '@nestjs/common';
import { ExecutiveTasksService } from './executive-tasks.service';
import { CreateExecutiveTaskDto, UpdateExecutiveTaskDto } from './executive-tasks.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('executive-tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class ExecutiveTasksController {
  private readonly logger = new Logger(ExecutiveTasksController.name);

  constructor(private service: ExecutiveTasksService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sheetName') sheetName?: string,
    @Query('track') track?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.service.findAll({
      search,
      status,
      sheetName,
      track,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('sheets')
  sheets() {
    return this.service.sheets();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateExecutiveTaskDto) {
    return this.service.create(dto);
  }

  @Post('import')
  async importExcel(@Body() body: { data: Array<Record<string, any>>; sheetName: string }) {
    this.logger.log(`Import request for sheet: ${body.sheetName}, rows: ${body.data?.length}`);
    return this.service.importFromData(body.data, body.sheetName);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExecutiveTaskDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
