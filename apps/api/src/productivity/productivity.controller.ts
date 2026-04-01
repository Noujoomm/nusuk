import { Controller, Get, Post, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ProductivityService } from './productivity.service';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('productivity')
@UseGuards(JwtAuthGuard)
export class ProductivityController {
  constructor(
    private readonly productivity: ProductivityService,
    private readonly exportService: ExportService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  getProjectProductivity() {
    return this.productivity.getProjectProductivity();
  }

  @Get('tracks/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  getTrackProductivity(@Param('id') id: string) {
    return this.productivity.getTrackProductivity(id);
  }

  @Post('snapshot')
  @UseGuards(RolesGuard)
  @Roles('admin')
  saveSnapshot() {
    return this.productivity.saveWeeklySnapshot();
  }

  @Get('export/excel')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async exportExcel(@Res() res: Response) {
    const buffer = await this.exportService.generateExcelReport();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('تقرير-الإنتاجية')}-${Date.now()}.xlsx`,
    });
    res.send(buffer);
  }

  @Get('export/pptx')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm')
  async exportPptx(@Res() res: Response) {
    const buffer = await this.exportService.generatePptxReport();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('عرض-الإنتاجية')}-${Date.now()}.pptx`,
    });
    res.send(buffer);
  }

  @Get('export/tracks/:id/excel')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pm', 'track_lead')
  async exportTrackExcel(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.generateTrackExcel(id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('تقرير-المسار')}-${Date.now()}.xlsx`,
    });
    res.send(buffer);
  }
}
