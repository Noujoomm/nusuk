import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseGuards, UseInterceptors, UploadedFile, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { existsSync, createReadStream } from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { CustodyFundsService } from './custody-funds.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { fixMulterFilename } from '../common/fix-filename';

@Controller('custody-funds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class CustodyFundsController {
  constructor(private service: CustodyFundsService) {}

  // ─── Funds CRUD ─────────────────────
  @Get()
  list() { return this.service.listFunds(); }

  @Post()
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.service.createFund(body, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.getFund(id); }

  @Patch(':id')
  @Roles('admin')
  updateFund(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.service.updateFund(id, body, user.id);
  }

  @Delete(':id')
  @Roles('admin')
  deleteFund(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.deleteFund(id, user.id);
  }

  // ─── Reopen Closed Fund (admin only) ──
  @Patch(':id/reopen')
  @Roles('admin')
  reopenFund(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.service.reopenFund(id, reason, user.id);
  }

  // ─── Ledger ─────────────────────────
  @Get(':id/ledger')
  ledger(@Param('id') id: string, @Query('page') page?: string) {
    return this.service.getLedger(id, page ? +page : 1);
  }

  @Post(':id/transactions')
  addTransaction(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.service.addTransaction(id, body, user.id);
  }

  // ─── Members ────────────────────────
  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.service.addMember(id, body, user.id);
  }

  @Delete(':id/members/:mid')
  removeMember(@Param('id') id: string, @Param('mid') mid: string) {
    return this.service.removeMember(id, mid);
  }

  // ─── Invoices ───────────────────────
  // Upload stores the file in Postgres (attachmentData Bytes) — the container
  // filesystem is ephemeral on Railway, so local `uploads/` dirs get wiped on
  // every restart. `memoryStorage` holds the ≤10MB buffer briefly, we copy it
  // into DB, done. No temp file, no FS leak, survives redeploys.
  @Post(':id/invoices')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_r, file, cb) => {
      const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xlsx', '.xls', '.docx'];
      cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
    },
  }))
  addInvoice(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    if (file) fixMulterFilename(file);
    return this.service.addInvoice(id, {
      ...body,
      amount: parseFloat(body.amount),
      attachmentBuffer: file?.buffer,
      attachmentOriginalName: file?.originalname,
      attachmentMimeType: file?.mimetype,
    }, user.id);
  }

  /**
   * Download: prefers DB-backed `attachmentData` (persistent). Falls back to
   * the legacy `attachmentUrl` filesystem path for invoices uploaded before
   * this migration. If neither is available (orphaned after Railway wiped
   * the ephemeral FS), returns a clear 404 so the UI can toast instead of
   * saving the error JSON as a .json download.
   */
  @Get('invoices/:iid/download')
  @Roles('admin')
  async downloadInvoice(@Param('iid') iid: string, @Res() res: Response) {
    const invoice = await this.service.getInvoice(iid);
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    const filename = invoice.attachmentOriginalName || 'attachment';
    const ext = extname(filename).toLowerCase();
    const extToMime: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.webp': 'image/webp',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const mime =
      (invoice as any).attachmentMimeType ||
      extToMime[ext] ||
      'application/octet-stream';

    // Path 1 — DB-backed bytes (new uploads + AI-analyzed invoices).
    const dbBytes = (invoice as any).attachmentData as Uint8Array | null | undefined;
    if (dbBytes && dbBytes.length > 0) {
      const buffer = Buffer.from(dbBytes);
      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.setHeader('Content-Length', buffer.length.toString());
      res.status(200).end(buffer);
      return;
    }

    // Path 2 — legacy filesystem path (may be wiped by Railway ephemeral FS).
    if (invoice.attachmentUrl && existsSync(invoice.attachmentUrl)) {
      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      createReadStream(invoice.attachmentUrl).pipe(res);
      return;
    }

    // No data anywhere — orphaned attachment.
    throw new NotFoundException(
      invoice.attachmentUrl || invoice.attachmentOriginalName
        ? 'الملف غير متوفر — قد يكون رُفع قبل ترقية التخزين وتعذّر استرجاعه. يمكن إعادة رفعه.'
        : 'لا يوجد مرفق لهذه الفاتورة',
    );
  }

  @Patch('invoices/:iid')
  @Roles('admin')
  editInvoice(@Param('iid') iid: string, @Body() body: any, @CurrentUser() user: any) {
    return this.service.editInvoice(iid, body, user.id);
  }

  @Patch('invoices/:iid/status')
  updateInvoiceStatus(@Param('iid') iid: string, @Body('status') status: string) {
    return this.service.updateInvoiceStatus(iid, status);
  }

  @Delete('invoices/:iid')
  @Roles('admin')
  deleteInvoice(@Param('iid') iid: string) {
    return this.service.deleteInvoice(iid);
  }

  // ─── Close ──────────────────────────
  @Patch(':id/close')
  close(@Param('id') id: string, @Body('closingNote') closingNote: string, @CurrentUser() user: any) {
    return this.service.closeFund(id, closingNote, user.id);
  }

  // ─── Alerts ─────────────────────────
  @Patch('alerts/:aid/dismiss')
  dismissAlert(@Param('aid') aid: string) {
    return this.service.dismissAlert(aid);
  }
}
