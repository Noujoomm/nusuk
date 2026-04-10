import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class CustodyFundsService {
  constructor(private prisma: PrismaService) {}

  // ═══ FUNDS ═══════════════════════════════════════════════

  async listFunds() {
    return this.prisma.custodyFund.findMany({
      include: {
        createdBy: { select: { id: true, nameAr: true } },
        closedBy: { select: { id: true, nameAr: true } },
        _count: { select: { transactions: true, members: true, invoices: true, alerts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFund(data: { custodyName: string; totalAmount: number; date: string }, userId: string) {
    return this.prisma.custodyFund.create({
      data: {
        custodyName: data.custodyName,
        totalAmount: data.totalAmount,
        currentBalance: data.totalAmount,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, nameAr: true } } },
    });
  }

  async getFund(id: string) {
    const fund = await this.prisma.custodyFund.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, nameAr: true } },
        closedBy: { select: { id: true, nameAr: true } },
        members: {
          include: { user: { select: { id: true, nameAr: true, name: true, email: true } } },
          orderBy: { addedAt: 'asc' },
        },
        invoices: {
          include: {
            createdBy: { select: { id: true, nameAr: true } },
            custodyMember: { include: { user: { select: { id: true, nameAr: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
        alerts: { where: { isRead: false }, orderBy: { triggeredAt: 'desc' }, take: 5 },
        _count: { select: { transactions: true, members: true, invoices: true } },
      },
    });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    return fund;
  }

  // ═══ TRANSACTIONS ════════════════════════════════════════

  async getLedger(fundId: string, page = 1, pageSize = 50) {
    const [data, total] = await Promise.all([
      this.prisma.custodyFundTransaction.findMany({
        where: { custodyFundId: fundId },
        include: { createdBy: { select: { id: true, nameAr: true } } },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.custodyFundTransaction.count({ where: { custodyFundId: fundId } }),
    ]);
    return { data, total, page, pageSize };
  }

  async addTransaction(fundId: string, data: { transactionType: string; amount: number; transactionDate: string; note?: string }, userId: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    if (fund.status === 'closed') throw new BadRequestException('لا يمكن إضافة معاملات على عهدة مغلقة');

    const isCredit = data.transactionType === 'credit';
    const newBalance = isCredit ? fund.currentBalance + data.amount : fund.currentBalance - data.amount;

    if (!isCredit && newBalance < 0) throw new BadRequestException('الرصيد غير كافي');

    const [tx] = await this.prisma.$transaction([
      this.prisma.custodyFundTransaction.create({
        data: {
          custodyFundId: fundId,
          transactionType: data.transactionType,
          amount: data.amount,
          transactionDate: new Date(data.transactionDate),
          note: data.note,
          createdById: userId,
        },
        include: { createdBy: { select: { id: true, nameAr: true } } },
      }),
      this.prisma.custodyFund.update({
        where: { id: fundId },
        data: { currentBalance: newBalance },
      }),
    ]);

    // Check low balance alert
    await this.checkLowBalance(fundId);

    return { transaction: tx, currentBalance: newBalance };
  }

  // ═══ MEMBERS ═════════════════════════════════════════════

  async addMember(fundId: string, data: { userId: string; allocatedAmount: number; roleNote?: string }, addedById: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    if (fund.status === 'closed') throw new BadRequestException('العهدة مغلقة');

    return this.prisma.custodyFundMember.upsert({
      where: { custodyFundId_userId: { custodyFundId: fundId, userId: data.userId } },
      update: { allocatedAmount: data.allocatedAmount, roleNote: data.roleNote },
      create: {
        custodyFundId: fundId, userId: data.userId,
        allocatedAmount: data.allocatedAmount, roleNote: data.roleNote,
        addedById,
      },
      include: { user: { select: { id: true, nameAr: true, name: true, email: true } } },
    });
  }

  async removeMember(fundId: string, memberId: string) {
    await this.prisma.custodyFundMember.delete({ where: { id: memberId } });
    return { message: 'تم إزالة العضو' };
  }

  // ═══ INVOICES ════════════════════════════════════════════

  async addInvoice(fundId: string, data: {
    invoiceName: string; amount: number; invoiceDate: string;
    custodyMemberId?: string; notes?: string;
    attachmentUrl?: string; attachmentOriginalName?: string;
  }, userId: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    if (fund.status === 'closed') throw new BadRequestException('لا يمكن إضافة فواتير على عهدة مغلقة');

    return this.prisma.custodyFundInvoice.create({
      data: {
        custodyFundId: fundId,
        invoiceName: data.invoiceName,
        amount: data.amount,
        invoiceDate: new Date(data.invoiceDate),
        custodyMemberId: data.custodyMemberId || null,
        notes: data.notes,
        attachmentUrl: data.attachmentUrl,
        attachmentOriginalName: data.attachmentOriginalName,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, nameAr: true } } },
    });
  }

  async updateInvoiceStatus(invoiceId: string, status: string) {
    const invoice = await this.prisma.custodyFundInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    const updated = await this.prisma.custodyFundInvoice.update({
      where: { id: invoiceId },
      data: { status },
    });

    // On approval: deduct from fund balance + update member spent
    if (status === 'approved' && invoice.status !== 'approved') {
      await this.prisma.custodyFund.update({
        where: { id: invoice.custodyFundId },
        data: { currentBalance: { decrement: invoice.amount } },
      });
      if (invoice.custodyMemberId) {
        await this.prisma.custodyFundMember.update({
          where: { id: invoice.custodyMemberId },
          data: { spentAmount: { increment: invoice.amount } },
        });
      }
      await this.checkLowBalance(invoice.custodyFundId);
    }

    // On rejection after approval: refund
    if (status === 'rejected' && invoice.status === 'approved') {
      await this.prisma.custodyFund.update({
        where: { id: invoice.custodyFundId },
        data: { currentBalance: { increment: invoice.amount } },
      });
      if (invoice.custodyMemberId) {
        await this.prisma.custodyFundMember.update({
          where: { id: invoice.custodyMemberId },
          data: { spentAmount: { decrement: invoice.amount } },
        });
      }
    }

    return updated;
  }

  // ═══ CLOSE FUND ══════════════════════════════════════════

  async closeFund(fundId: string, closingNote: string | undefined, userId: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    if (fund.status === 'closed') throw new BadRequestException('العهدة مغلقة بالفعل');

    const pendingInvoices = await this.prisma.custodyFundInvoice.count({
      where: { custodyFundId: fundId, status: 'pending' },
    });
    if (pendingInvoices > 0) {
      throw new BadRequestException('لا يمكن إقفال العهدة — يوجد فواتير قيد المراجعة');
    }

    return this.prisma.custodyFund.update({
      where: { id: fundId },
      data: { status: 'closed', closedAt: new Date(), closedById: userId, closingNote },
    });
  }

  // ═══ REOPEN FUND (admin only) ═════════════════════════════

  async reopenFund(fundId: string, reason: string, userId: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    if (fund.status !== 'closed') throw new BadRequestException('العهدة ليست مغلقة');
    if (!reason?.trim()) throw new BadRequestException('سبب إعادة الفتح مطلوب');

    return this.prisma.custodyFund.update({
      where: { id: fundId },
      data: {
        status: 'active',
        closedAt: null,
        closedById: null,
        closingNote: `أُعيد فتحها: ${reason.trim()} (كانت مغلقة بملاحظة: ${fund.closingNote || '—'})`,
      },
    });
  }

  // ═══ FUND EDIT + DELETE ══════════════════════════════════

  async updateFund(fundId: string, data: { custodyName?: string; totalAmount?: number }, userId: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');

    const updateData: any = {};
    if (data.custodyName !== undefined) updateData.custodyName = data.custodyName;
    if (data.totalAmount !== undefined) {
      const diff = data.totalAmount - fund.totalAmount;
      updateData.totalAmount = data.totalAmount;
      updateData.currentBalance = fund.currentBalance + diff;
    }

    return this.prisma.custodyFund.update({ where: { id: fundId }, data: updateData });
  }

  async deleteFund(fundId: string, userId: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException('العهدة غير موجودة');
    // Soft delete by closing with a deletion note
    return this.prisma.custodyFund.update({
      where: { id: fundId },
      data: { status: 'closed', closedAt: new Date(), closedById: userId, closingNote: 'تم الحذف بواسطة المدير' },
    });
  }

  // ═══ INVOICE EDIT + DELETE ═══════════════════════════════

  async editInvoice(invoiceId: string, data: { invoiceName?: string; amount?: number; notes?: string }, userId: string) {
    const invoice = await this.prisma.custodyFundInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    const updateData: any = {};
    if (data.invoiceName !== undefined) updateData.invoiceName = data.invoiceName;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.amount !== undefined && data.amount !== invoice.amount) {
      // Adjust fund balance if invoice was already approved
      if (invoice.status === 'approved') {
        const diff = data.amount - invoice.amount;
        await this.prisma.custodyFund.update({
          where: { id: invoice.custodyFundId },
          data: { currentBalance: { decrement: diff } },
        });
      }
      updateData.amount = data.amount;
    }

    return this.prisma.custodyFundInvoice.update({ where: { id: invoiceId }, data: updateData });
  }

  async deleteInvoice(invoiceId: string) {
    const invoice = await this.prisma.custodyFundInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    // Refund if approved
    if (invoice.status === 'approved') {
      await this.prisma.custodyFund.update({
        where: { id: invoice.custodyFundId },
        data: { currentBalance: { increment: invoice.amount } },
      });
    }

    await this.prisma.custodyFundInvoice.delete({ where: { id: invoiceId } });
    return { message: 'تم حذف الفاتورة' };
  }

  // ═══ LOW BALANCE ALERT ═══════════════════════════════════

  private async checkLowBalance(fundId: string) {
    const fund = await this.prisma.custodyFund.findUnique({ where: { id: fundId } });
    if (!fund || fund.status === 'closed') return;

    const threshold = fund.totalAmount * 0.20;
    if (fund.currentBalance <= threshold) {
      // Check if alert already exists and unread
      const existing = await this.prisma.custodyFundAlert.findFirst({
        where: { custodyFundId: fundId, alertType: 'low_balance', isRead: false },
      });
      if (!existing) {
        await this.prisma.custodyFundAlert.create({
          data: { custodyFundId: fundId, alertType: 'low_balance' },
        });
      }
    } else {
      // Balance is above threshold — mark alerts as read
      await this.prisma.custodyFundAlert.updateMany({
        where: { custodyFundId: fundId, alertType: 'low_balance', isRead: false },
        data: { isRead: true },
      });
    }
  }

  async dismissAlert(alertId: string) {
    await this.prisma.custodyFundAlert.update({ where: { id: alertId }, data: { isRead: true } });
    return { message: 'تم' };
  }
}
