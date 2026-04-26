import { Controller, Get, Query, Res, UseGuards, Logger, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SystemExportService } from './system-export.service';
import { setFileResponseHeaders } from '../common/utils/file-response.util';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SystemExportController {
  private readonly logger = new Logger(SystemExportController.name);

  constructor(private readonly exportService: SystemExportService) {}

  /**
   * GET /api/admin/full-system-export
   * Returns all data from all models as structured JSON.
   */
  @Get('full-system-export')
  async getFullExport() {
    this.logger.log('Admin requested full system export');
    return this.exportService.getFullExport();
  }

  /**
   * GET /api/admin/system-stats
   * Lightweight counts for all models (fast dashboard view).
   */
  @Get('system-stats')
  async getSystemStats() {
    return this.exportService.getSystemStats();
  }

  /**
   * GET /api/admin/integrity-check
   * Validates data integrity across all models.
   */
  @Get('integrity-check')
  async getIntegrityCheck() {
    this.logger.log('Admin requested integrity check');
    return this.exportService.validateDataIntegrity();
  }

  /**
   * GET /api/admin/tracks-deep?trackId=optional
   * Deep export of tracks with all nested relationships.
   */
  @Get('tracks-deep')
  async getTracksDeep(@Query('trackId') trackId?: string) {
    return this.exportService.getTrackDeepExport(trackId);
  }

  /**
   * GET /api/admin/export-zip
   * Downloads a ZIP backup of the entire system.
   */
  @Get('export-zip')
  async downloadZip(@Res() res: Response) {
    this.logger.log('Admin requested ZIP export');
    const { stream, filename } = await this.exportService.createZipExport();

    setFileResponseHeaders(res, filename, 'application/zip', null, 'attachment');
    stream.pipe(res);
  }
}
