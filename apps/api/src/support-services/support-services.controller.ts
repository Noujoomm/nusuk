import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { fixMulterFilename } from '../common/fix-filename';

const INVOICE_UPLOADS = join(process.cwd(), 'uploads', 'invoices');
try { mkdirSync(INVOICE_UPLOADS, { recursive: true }); } catch {}
import { SupportServicesService } from './support-services.service';
import { CreateCustodyDto, UpdateCustodyDto, CloseCustodyDto, CreateInvoiceDto, UpdateInvoiceStatusDto, AddMemberDto } from './support-services.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('support-services')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class SupportServicesController {
  constructor(private service: SupportServicesService) {}

  // ─── Dashboard ─────────────────────────────────────────
  @Get('dashboard')
  getDashboard() { return this.service.getDashboard(); }

  // ─── Custodies ─────────────────────────────────────────
  @Get('custodies')
  listCustodies(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listCustodies({
      status, search,
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
    });
  }

  @Get('custodies/:id')
  getCustody(@Param('id') id: string) { return this.service.getCustody(id); }

  @Post('custodies')
  createCustody(@Body() dto: CreateCustodyDto, @CurrentUser() user: any) {
    return this.service.createCustody(dto, user.id);
  }

  @Patch('custodies/:id')
  updateCustody(@Param('id') id: string, @Body() dto: UpdateCustodyDto, @CurrentUser() user: any) {
    return this.service.updateCustody(id, dto, user.id);
  }

  @Delete('custodies/:id')
  deleteCustody(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.deleteCustody(id, user.id);
  }

  @Post('custodies/:id/close')
  closeCustody(@Param('id') id: string, @Body() dto: CloseCustodyDto, @CurrentUser() user: any) {
    return this.service.closeCustody(id, dto, user.id);
  }

  // ─── Invoices (الفواتير) ───────────────────────────────
  @Get('invoices')
  listInvoices(
    @Query('custodyId') custodyId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listInvoices({
      custodyId, status, search, dateFrom, dateTo,
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
    });
  }

  @Post('invoices')
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: any) {
    return this.service.createInvoice(dto, user.id);
  }

  @Patch('invoices/:id/status')
  updateInvoiceStatus(@Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto, @CurrentUser() user: any) {
    return this.service.updateInvoiceStatus(id, dto.status, user.id);
  }

  @Delete('invoices/:id')
  deleteInvoice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.deleteInvoice(id, user.id);
  }

  // ─── Members ───────────────────────────────────────────
  @Get('custodies/:id/members')
  getMembers(@Param('id') id: string) {
    return this.service.getCustody(id).then((c) => c.members);
  }

  @Post('members')
  addMember(@Body() dto: AddMemberDto, @CurrentUser() user: any) {
    return this.service.addMember(dto, user.id);
  }

  @Delete('custodies/:custodyId/members/:memberId')
  removeMember(@Param('custodyId') custodyId: string, @Param('memberId') memberId: string, @CurrentUser() user: any) {
    return this.service.removeMember(custodyId, memberId, user.id);
  }

  // ─── Invoice Attachments ────────────────────────────────
  @Post('invoices/:id/attachments')
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: diskStorage({
      destination: (_req, _file, cb) => { try { mkdirSync(INVOICE_UPLOADS, { recursive: true }); } catch {} cb(null, INVOICE_UPLOADS); },
      filename: (_req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + extname(file.originalname)),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  uploadInvoiceAttachments(
    @Param('id') invoiceId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    if (files) files.forEach((f) => fixMulterFilename(f));
    return this.service.uploadInvoiceAttachments(invoiceId, files || [], user.id);
  }

  @Get('invoices/:id/attachments')
  getInvoiceAttachments(@Param('id') invoiceId: string) {
    return this.service.getInvoiceAttachments(invoiceId);
  }

  @Delete('invoices/:invoiceId/attachments/:attachmentId')
  deleteInvoiceAttachment(@Param('attachmentId') attachmentId: string) {
    return this.service.deleteInvoiceAttachment(attachmentId);
  }

  // ─── Balance Transactions ──────────────────────────────
  @Post('balance-transactions')
  addBalanceTransaction(@Body() body: any, @CurrentUser() user: any) {
    return this.service.addBalanceTransaction(body, user.id);
  }

  @Get('custodies/:id/balance-transactions')
  getBalanceTransactions(@Param('id') custodyId: string) {
    return this.service.getBalanceTransactions(custodyId);
  }

  // ─── Audit Logs ────────────────────────────────────────
  @Get('audit-logs')
  getAuditLogs(@Query('custodyId') custodyId?: string, @Query('limit') limit?: string) {
    return this.service.getAuditLogs(custodyId, limit ? +limit : undefined);
  }
}
