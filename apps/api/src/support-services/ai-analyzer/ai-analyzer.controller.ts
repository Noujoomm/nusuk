import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AIAnalyzerService } from './ai-analyzer.service';
import { AIConfirmDto } from './dto/ai-confirm.dto';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TEMP_DIR = join(process.cwd(), 'uploads', 'temp', 'ai-invoices');
try {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
} catch { /* best-effort */ }

const tempStorage = diskStorage({
  destination: TEMP_DIR,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

/**
 * AI Invoice Analyzer endpoints — operate on CustodyFund (v2), which is the
 * model surfaced on /support-services in the UI. Scoped to the same roles
 * that already manage custody funds.
 */
@Controller('custody-funds/:fundId/ai-invoice')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'system_manager', 'pm', 'track_lead')
export class AIAnalyzerController {
  constructor(private readonly analyzer: AIAnalyzerService) {}

  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tempStorage,
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async analyze(
    @Param('fundId') fundId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    return this.analyzer.analyze(fundId, user.id, file);
  }

  @Post('confirm')
  async confirm(
    @Param('fundId') fundId: string,
    @Body() dto: AIConfirmDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.analyzer.confirm(fundId, user.id, dto);
  }

  @Delete(':extractionId')
  async cancel(
    @Param('fundId') fundId: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.analyzer.cancel(fundId, user.id, extractionId);
  }
}

/**
 * Separate controller for streaming the temp preview — rooted on a stable URL
 * that doesn't need the fundId, so the UI can reference it as-is.
 */
@Controller('support-services/ai-invoice')
@UseGuards(JwtAuthGuard)
export class AIAnalyzerPreviewController {
  constructor(private readonly analyzer: AIAnalyzerService) {}

  @Get('preview/:extractionId')
  async preview(
    @Param('extractionId') extractionId: string,
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    const { filePath, mediaType, fileName } = this.analyzer.preview(
      extractionId,
      user.id,
    );
    if (!fs.existsSync(filePath)) throw new NotFoundException('انتهت صلاحية المعاينة.');
    res.setHeader('Content-Type', mediaType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    fs.createReadStream(filePath).pipe(res);
  }
}
