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
 * AI Invoice Analyzer endpoints. Nested under the support-services URL tree
 * so permissions + navigation stay consistent with the custody UI. Only the
 * roles that can already manage custodies get access.
 */
@Controller('support-services/custodies/:custodyId/ai-invoice')
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
    @Param('custodyId') custodyId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    return this.analyzer.analyze(custodyId, user.id, file);
  }

  @Post('confirm')
  async confirm(
    @Param('custodyId') custodyId: string,
    @Body() dto: AIConfirmDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.analyzer.confirm(custodyId, user.id, dto);
  }

  @Delete(':extractionId')
  async cancel(
    @Param('custodyId') custodyId: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.analyzer.cancel(custodyId, user.id, extractionId);
  }
}

/**
 * Separate controller for streaming the temp preview file — intentionally
 * rooted at `/support-services/ai-invoice/preview/:extractionId` so the UI
 * can reference it with a stable URL that doesn't need the custodyId.
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
