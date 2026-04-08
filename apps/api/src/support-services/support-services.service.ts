import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateCustodyDto, UpdateCustodyDto, CloseCustodyDto, CreateInvoiceDto, AddMemberDto } from './support-services.dto';

@Injectable()
export class SupportServicesService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════
  //  CUSTODY CRUD
  // ═══════════════════════════════════════════════════════

  async createCustody(dto: CreateCustodyDto, userId: string) {
    const code = `CUS-${Date.now().toString(36).toUpperCase()}`;
    const balance = dto.initialBalance || 0;
    const custody = await this.prisma.custody.create({
      data: {
        code,
        name: dto.name,
        description: dto.description,
        initialBalance: balance,
        currentBalance: balance,
        totalAmount: balance,
        remainingAmount: balance,
        spentAmount: 0,
        balanceAddedAt: dto.balanceAddedAt ? new Date(dto.balanceAddedAt) : new Date(),
        notes: dto.notes,
        assignedToId: dto.assignedToId || userId,
        createdById: userId,
      },
      include: this.custodyIncludes,
    });
    await this.log(custody.id, 'CREATE', 'CUSTODY', custody.id, null, { name: dto.name, balance: dto.initialBalance }, userId);
    return custody;
  }

  async listCustodies(params?: { status?: string; search?: string; page?: number; pageSize?: number }) {
    const { status, search, page = 1, pageSize = 50 } = params || {};
    const where: any = {};
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.custody.findMany({
        where,
        include: this.custodyIncludes,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.custody.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async getCustody(id: string) {
    const custody = await this.prisma.custody.findUnique({
      where: { id },
      include: {
        ...this.custodyIncludes,
        invoices: {
          include: { createdBy: { select: { id: true, nameAr: true } } },
          orderBy: { createdAt: 'desc' },
        },
        members: {
          include: { user: { select: { id: true, nameAr: true, name: true, email: true, role: true } } },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');
    return custody;
  }

  async updateCustody(id: string, dto: UpdateCustodyDto, userId: string) {
    const existing = await this.prisma.custody.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العهدة غير موجودة');
    if (existing.status === 'CLOSED') throw new BadRequestException('لا يمكن تعديل عهدة مقفلة');

    const updated = await this.prisma.custody.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: this.custodyIncludes,
    });
    await this.log(id, 'UPDATE', 'CUSTODY', id, { name: existing.name }, { name: updated.name }, userId);
    return updated;
  }

  async deleteCustody(id: string, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');
    await this.log(id, 'DELETE', 'CUSTODY', id, custody, null, userId);
    await this.prisma.custody.delete({ where: { id } });
    return { message: 'تم حذف العهدة' };
  }

  // ═══════════════════════════════════════════════════════
  //  CLOSE CUSTODY
  // ═══════════════════════════════════════════════════════

  async closeCustody(id: string, dto: CloseCustodyDto, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');
    if (custody.status === 'CLOSED') throw new BadRequestException('العهدة مقفلة بالفعل');

    const invoiceCount = await this.prisma.custodyInvoice.count({ where: { custodyId: id } });

    const updated = await this.prisma.custody.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: userId,
        closingNotes: dto.closingNotes,
        closingBalance: custody.currentBalance,
      },
      include: this.custodyIncludes,
    });

    await this.log(id, 'CLOSE', 'CUSTODY', id,
      { status: custody.status },
      { status: 'CLOSED', closingBalance: custody.currentBalance, invoiceCount, closingNotes: dto.closingNotes },
      userId,
    );
    return updated;
  }

  // ═══════════════════════════════════════════════════════
  //  INVOICES (الفواتير)
  // ═══════════════════════════════════════════════════════

  async createInvoice(dto: CreateInvoiceDto, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id: dto.custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');
    if (custody.status === 'CLOSED') throw new BadRequestException('لا يمكن إضافة فاتورة على عهدة مقفلة');
    const curBalance = custody.currentBalance ?? custody.remainingAmount ?? 0;
    const initBalance = custody.initialBalance ?? custody.totalAmount ?? 1;
    if (dto.amount > curBalance) {
      throw new BadRequestException(`المبلغ يتجاوز الرصيد المتبقي (${curBalance.toLocaleString('en-US')} ريال)`);
    }

    const newBalance = curBalance - dto.amount;
    const newSpent = custody.spentAmount + dto.amount;
    const newStatus = newBalance <= 0 ? 'CLOSED' : (newBalance / initBalance) <= 0.20 ? 'LOW_BALANCE' : 'ACTIVE';

    const [invoice] = await this.prisma.$transaction([
      this.prisma.custodyInvoice.create({
        data: {
          custodyId: dto.custodyId,
          name: dto.name,
          description: dto.description,
          amount: dto.amount,
          invoiceDate: new Date(dto.invoiceDate),
          invoiceNumber: dto.invoiceNumber,
          createdById: userId,
        },
        include: { createdBy: { select: { id: true, nameAr: true } } },
      }),
      this.prisma.custody.update({
        where: { id: dto.custodyId },
        data: {
          currentBalance: Math.max(0, newBalance),
          spentAmount: newSpent,
          status: newStatus as any,
        },
      }),
    ]);

    await this.log(dto.custodyId, 'ADD_INVOICE', 'INVOICE', invoice.id, null, { name: dto.name, amount: dto.amount }, userId);
    return { invoice, custody: { currentBalance: Math.max(0, newBalance), spentAmount: newSpent, status: newStatus } };
  }

  async listInvoices(params?: { custodyId?: string; status?: string; search?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }) {
    const { custodyId, status, search, dateFrom, dateTo, page = 1, pageSize = 50 } = params || {};
    const where: any = {};
    if (custodyId) where.custodyId = custodyId;
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.custodyInvoice.findMany({
        where,
        include: {
          custody: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.custodyInvoice.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async updateInvoiceStatus(invoiceId: string, status: string, userId: string) {
    const invoice = await this.prisma.custodyInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    const updated = await this.prisma.custodyInvoice.update({
      where: { id: invoiceId },
      data: { status: status as any },
    });

    // If rejected, refund the amount
    if (status === 'REJECTED' && invoice.status !== 'REJECTED') {
      await this.prisma.custody.update({
        where: { id: invoice.custodyId },
        data: {
          currentBalance: { increment: invoice.amount },
          spentAmount: { decrement: invoice.amount },
        },
      });
      // Recalculate status
      const custody = await this.prisma.custody.findUnique({ where: { id: invoice.custodyId } });
      if (custody && custody.status !== 'CLOSED') {
        const newStatus = ((custody.currentBalance ?? 0) / (custody.initialBalance || 1)) <= 0.20 ? 'LOW_BALANCE' : 'ACTIVE';
        await this.prisma.custody.update({ where: { id: invoice.custodyId }, data: { status: newStatus as any } });
      }
    }

    const action = status === 'APPROVED' ? 'APPROVE_INVOICE' : 'REJECT_INVOICE';
    await this.log(invoice.custodyId, action, 'INVOICE', invoiceId, { status: invoice.status }, { status }, userId);
    return updated;
  }

  async deleteInvoice(invoiceId: string, userId: string) {
    const invoice = await this.prisma.custodyInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    const custody = await this.prisma.custody.findUnique({ where: { id: invoice.custodyId } });
    if (custody?.status === 'CLOSED') throw new BadRequestException('لا يمكن حذف فاتورة من عهدة مقفلة');

    // Refund if not already rejected
    if (invoice.status !== 'REJECTED') {
      await this.prisma.custody.update({
        where: { id: invoice.custodyId },
        data: {
          currentBalance: { increment: invoice.amount },
          spentAmount: { decrement: invoice.amount },
        },
      });
    }

    await this.log(invoice.custodyId, 'DELETE', 'INVOICE', invoiceId, invoice, null, userId);
    await this.prisma.custodyInvoice.delete({ where: { id: invoiceId } });
    return { message: 'تم حذف الفاتورة' };
  }

  // ═══════════════════════════════════════════════════════
  //  MEMBERS
  // ═══════════════════════════════════════════════════════

  async addMember(dto: AddMemberDto, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id: dto.custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');

    const member = await this.prisma.custodyMember.upsert({
      where: { custodyId_userId: { custodyId: dto.custodyId, userId: dto.userId } },
      update: { roleType: dto.roleType || 'viewer' },
      create: { custodyId: dto.custodyId, userId: dto.userId, roleType: dto.roleType || 'viewer', assignedById: userId },
      include: { user: { select: { id: true, nameAr: true, name: true, email: true, role: true } } },
    });

    await this.log(dto.custodyId, 'ADD_MEMBER', 'MEMBER', member.id, null, { userId: dto.userId, roleType: dto.roleType }, userId);
    return member;
  }

  async removeMember(custodyId: string, memberId: string, userId: string) {
    const member = await this.prisma.custodyMember.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('العضو غير موجود');
    await this.prisma.custodyMember.delete({ where: { id: memberId } });
    await this.log(custodyId, 'REMOVE_MEMBER', 'MEMBER', memberId, member, null, userId);
    return { message: 'تم إزالة العضو' };
  }

  // ═══════════════════════════════════════════════════════
  //  DASHBOARD
  // ═══════════════════════════════════════════════════════

  async getDashboard() {
    try {
      const [total, active, closed, suspended, totalBudget, totalSpent, totalRemaining, lowBalance, invoiceCount, totalInvoiceAmount] = await Promise.all([
        this.prisma.custody.count(),
        this.prisma.custody.count({ where: { status: 'ACTIVE' } }),
        this.prisma.custody.count({ where: { status: 'CLOSED' } }),
        this.prisma.custody.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.custody.aggregate({ _sum: { initialBalance: true } }),
        this.prisma.custody.aggregate({ _sum: { spentAmount: true } }),
        this.prisma.custody.aggregate({ _sum: { currentBalance: true } }),
        this.prisma.custody.count({ where: { status: 'LOW_BALANCE' } }),
        this.prisma.custodyInvoice.count(),
        this.prisma.custodyInvoice.aggregate({ _sum: { amount: true } }),
      ]);

      return {
        totalCustodies: total,
        activeCustodies: active,
        closedCustodies: closed,
        suspendedCustodies: suspended,
        lowBalanceCustodies: lowBalance,
        totalBudget: totalBudget._sum.initialBalance || 0,
        totalSpent: totalSpent._sum.spentAmount || 0,
        totalRemaining: totalRemaining._sum.currentBalance || 0,
        totalInvoices: invoiceCount,
        totalInvoiceAmount: totalInvoiceAmount._sum.amount || 0,
        isSchemaReady: true,
      };
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('P2021')) {
        return {
          totalCustodies: 0, activeCustodies: 0, closedCustodies: 0,
          suspendedCustodies: 0, lowBalanceCustodies: 0,
          totalBudget: 0, totalSpent: 0, totalRemaining: 0,
          totalInvoices: 0, totalInvoiceAmount: 0,
          isSchemaReady: false,
          message: 'جداول خدمات المساندة غير جاهزة بعد — يرجى إعادة نشر المنصة',
        };
      }
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  AUDIT LOG
  // ═══════════════════════════════════════════════════════

  async getAuditLogs(custodyId?: string, limit = 100) {
    const where: any = {};
    if (custodyId) where.custodyId = custodyId;
    return this.prisma.custodyAuditLog.findMany({
      where,
      include: {
        user: { select: { id: true, nameAr: true } },
        custody: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async log(custodyId: string | null, action: string, entityType: string, entityId: string, oldValue: any, newValue: any, userId: string) {
    await this.prisma.custodyAuditLog.create({
      data: {
        custodyId,
        action,
        entityType,
        entityId,
        oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : undefined,
        newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : undefined,
        userId,
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════

  private get custodyIncludes() {
    return {
      createdBy: { select: { id: true, nameAr: true } },
      assignedTo: { select: { id: true, nameAr: true } },
      closedBy: { select: { id: true, nameAr: true } },
      _count: { select: { invoices: true, members: true } },
    };
  }
}
