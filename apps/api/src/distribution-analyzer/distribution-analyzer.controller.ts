import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { fixMulterFilename } from '../common/fix-filename';
import { setFileResponseHeaders } from '../common/utils/file-response.util';
import { PrismaService } from '../common/prisma.service';
import { DistributionTrackAccessGuard } from './guards/distribution-track-access.guard';
import { DistributionAnalyzerService } from './distribution-analyzer.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { ExportReportDto } from './dto/export-report.dto';

const MAX_BYTES = 20 * 1024 * 1024;

@Controller('distribution-analyzer')
@UseGuards(JwtAuthGuard, RolesGuard, DistributionTrackAccessGuard)
@Roles('admin', 'system_manager', 'pm', 'track_lead', 'hr', 'employee')
export class DistributionAnalyzerController {
  private readonly logger = new Logger(DistributionAnalyzerController.name);

  constructor(
    private readonly service: DistributionAnalyzerService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── 1. Upload + create session ────────────────────────────────────────
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: { id: string },
  ) {
    if (file) fixMulterFilename(file);
    const session = await this.service.createSession(file, user.id, dto);
    // Phase 2 will queue the analysis here. For now the client polls /sessions/:id.
    return { ...session, streamUrl: null as string | null };
  }

  // ─── 2. (Placeholder) trigger analysis ────────────────────────────────
  // Phase 2 will replace this with a queue-driven worker. Kept so the
  // frontend has a stable URL to call once the engine ships.
  @Post('sessions/:id/analyze')
  async analyze(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.service.runAnalysis(id, user.id);
  }

  // ─── 3. Read session result ───────────────────────────────────────────
  @Get('sessions/:id')
  async getSession(@Param('id') id: string, @CurrentUser() user: { id: string; role: string }) {
    return this.service.getSession(id, user.id, user.role);
  }

  // ─── 4. Download original file ────────────────────────────────────────
  @Get('sessions/:id/file')
  async downloadFile(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const row = await this.prisma.distributionAnalysisSession.findUnique({
      where: { id },
      select: { userId: true, fileName: true, fileType: true, fileSize: true, fileBytes: true },
    });
    if (!row) throw new BadRequestException('الجلسة غير موجودة');
    if (
      row.userId !== user.id &&
      user.role !== 'admin' &&
      user.role !== 'system_manager'
    ) {
      throw new BadRequestException('ليس لديك صلاحية لتنزيل هذا الملف');
    }
    if (!row.fileBytes) throw new BadRequestException('الملف الأصلي غير محفوظ');
    setFileResponseHeaders(res, row.fileName, row.fileType, row.fileSize, 'attachment');
    res.end(row.fileBytes);
  }

  // ─── 5. Export report (Phase 5) ───────────────────────────────────────
  @Post('sessions/:id/export')
  async export(
    @Param('id') id: string,
    @Body() _dto: ExportReportDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.service.exportReport(id, user.id, user.role);
  }

  // ─── 6. List sessions ─────────────────────────────────────────────────
  @Get('sessions')
  async list(
    @CurrentUser() user: { id: string; role: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listSessions(
      user.id,
      user.role,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
    );
  }

  // ─── 7. Delete session ────────────────────────────────────────────────
  @Delete('sessions/:id')
  async delete(@Param('id') id: string, @CurrentUser() user: { id: string; role: string }) {
    return this.service.deleteSession(id, user.id, user.role);
  }
}
