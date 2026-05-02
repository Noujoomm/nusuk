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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AIAnalyzerService } from './ai-analyzer.service';
import { AIBatchInvoiceService } from './ai-batch-invoice.service';
import { AIConfirmDto } from './dto/ai-confirm.dto';
import { BatchSaveDto } from './dto/batch-save.dto';
import { BatchRetryDto } from './dto/batch-retry.dto';
import { setFileResponseHeaders } from '../../common/utils/file-response.util';

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
  constructor(
    private readonly analyzer: AIAnalyzerService,
    private readonly batch: AIBatchInvoiceService,
  ) {}

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

  // ── Batch flow (1–10 invoices) ───────────────────────────────────────
  // Routes nested under /batch/* so they can't collide with the single-
  // invoice :extractionId DELETE.

  @Post('batch/analyze')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: tempStorage,
      limits: { fileSize: MAX_FILE_BYTES, files: 10 },
    }),
  )
  async batchAnalyze(
    @Param('fundId') fundId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: { id: string },
  ) {
    return this.batch.batchAnalyze(fundId, user.id, files);
  }

  @Post('batch/:batchId/retry')
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  async batchRetry(
    @Param('fundId') fundId: string,
    @Param('batchId') batchId: string,
    @Body() dto: BatchRetryDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.batch.batchRetry(fundId, user.id, batchId, dto);
  }

  @Post('batch/save')
  async batchSave(
    @Param('fundId') _fundId: string,
    @Body() dto: BatchSaveDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.batch.batchSave(user.id, dto);
  }

  @Delete('batch/:batchId')
  async batchDiscard(
    @Param('fundId') fundId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.batch.batchDiscard(fundId, user.id, batchId);
  }

  // Single-invoice cancel — kept last so the more specific batch routes win.
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
    setFileResponseHeaders(res, fileName, mediaType, null, 'inline');
    fs.createReadStream(filePath).pipe(res);
  }
}
