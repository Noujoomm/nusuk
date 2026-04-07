import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { Response } from 'express';
import { SupportServicesService } from './support-services.service';
import { CreateCustodyDto, UpdateCustodyDto, CreateExpenseDto, CreateSettlementDto, AddMemberDto } from './support-services.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { fixMulterFilename } from '../common/fix-filename';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'support-services');
try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

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
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('trackId') trackId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listCustodies({
      category, status, trackId, search,
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

  // ─── Expenses ──────────────────────────────────────────
  @Post('expenses')
  addExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: any) {
    return this.service.addExpense(dto, user.id);
  }

  @Delete('expenses/:id')
  deleteExpense(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.deleteExpense(id, user.id);
  }

  // ─── Settlements ───────────────────────────────────────
  @Post('settlements')
  addSettlement(@Body() dto: CreateSettlementDto, @CurrentUser() user: any) {
    return this.service.addSettlement(dto, user.id);
  }

  // ─── File Upload ───────────────────────────────────────
  @Post('attachments/:custodyId')
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = UPLOADS_DIR;
        try { mkdirSync(dir, { recursive: true }); } catch {}
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + extname(file.originalname));
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
      cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
    },
  }))
  uploadFiles(
    @Param('custodyId') custodyId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('expenseId') expenseId: string | undefined,
    @Body('settlementId') settlementId: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (files) files.forEach((f) => fixMulterFilename(f));
    return this.service.uploadFiles(custodyId, files || [], user.id, expenseId, settlementId);
  }

  @Delete('attachments/:id')
  deleteAttachment(@Param('id') id: string) {
    return this.service.deleteAttachment(id);
  }

  // ─── ZIP Download ──────────────────────────────────────
  @Get('attachments/download-all')
  async downloadAll(
    @Query('custodyId') custodyId: string,
    @Query('expenseId') expenseId: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.service.downloadAllAsZip(custodyId, expenseId);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('مرفقات')}-${Date.now()}.zip`,
    });
    res.send(buffer);
  }

  // ─── Close Custody ─────────────────────────────────────
  @Post('custodies/:id/close')
  closeCustody(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.closeCustody(id, user.id);
  }

  // ─── Members ───────────────────────────────────────────
  @Get('custodies/:id/members')
  getMembers(@Param('id') id: string) { return this.service.getMembers(id); }

  @Post('members')
  addMember(@Body() dto: AddMemberDto, @CurrentUser() user: any) {
    return this.service.addMember(dto, user.id);
  }

  @Delete('members/:id')
  removeMember(@Param('id') id: string, @Query('custodyId') custodyId: string, @CurrentUser() user: any) {
    return this.service.removeMember(custodyId, id, user.id);
  }

  // ─── Audit ─────────────────────────────────────────────
  @Get('custodies/:id/audit')
  getAuditLogs(@Param('id') id: string) { return this.service.getAuditLogs(id); }
}
