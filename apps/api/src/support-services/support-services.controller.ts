import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SupportServicesService } from './support-services.service';
import { CreateCustodyDto, UpdateCustodyDto, CreateExpenseDto, CreateSettlementDto } from './support-services.dto';
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

  // ─── Audit ─────────────────────────────────────────────
  @Get('custodies/:id/audit')
  getAuditLogs(@Param('id') id: string) { return this.service.getAuditLogs(id); }
}
