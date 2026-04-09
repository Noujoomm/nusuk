import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { CustodyFundsService } from './custody-funds.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { fixMulterFilename } from '../common/fix-filename';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'custody-invoices');
try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

@Controller('custody-funds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class CustodyFundsController {
  constructor(private service: CustodyFundsService) {}

  // ─── Funds ──────────────────────────
  @Get()
  list() { return this.service.listFunds(); }

  @Post()
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.service.createFund(body, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.getFund(id); }

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
  @Post(':id/invoices')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_r, _f, cb) => { try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {} cb(null, UPLOADS_DIR); },
      filename: (_r, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + extname(file.originalname)),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
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
      attachmentUrl: file?.path,
      attachmentOriginalName: file?.originalname,
    }, user.id);
  }

  @Patch('invoices/:iid/status')
  updateInvoiceStatus(@Param('iid') iid: string, @Body('status') status: string) {
    return this.service.updateInvoiceStatus(iid, status);
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
