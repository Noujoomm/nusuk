import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateCustodyDto, UpdateCustodyDto, CreateExpenseDto, CreateSettlementDto, AddMemberDto } from './support-services.dto';
import * as fs from 'fs';
import archiver from 'archiver';

@Injectable()
export class SupportServicesService {
  constructor(private prisma: PrismaService) {}

  // ─── CUSTODY CRUD ──────────────────────────────────────────

  async createCustody(dto: CreateCustodyDto, userId: string) {
    if (dto.category === 'TRACK_NEEDS' && !dto.trackId) {
      throw new BadRequestException('المسار مطلوب لفئة "احتياجات المسار"');
    }

    return this.prisma.custody.create({
      data: {
        name: dto.name,
        description: dto.description,
        totalAmount: dto.totalAmount,
        remainingAmount: dto.totalAmount,
        spentAmount: 0,
        category: dto.category as any,
        subCategory: (dto.subCategory || 'OTHER') as any,
        trackId: dto.trackId || null,
        createdById: userId,
      },
      include: { track: { select: { id: true, nameAr: true } }, createdBy: { select: { id: true, nameAr: true } } },
    });
  }

  async listCustodies(params?: {
    category?: string; status?: string; trackId?: string;
    search?: string; page?: number; pageSize?: number;
  }) {
    const { category, status, trackId, search, page = 1, pageSize = 50 } = params || {};
    const where: any = {};
    if (category) where.category = category;
    if (status) where.status = status;
    if (trackId) where.trackId = trackId;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.custody.findMany({
        where,
        include: {
          track: { select: { id: true, nameAr: true, color: true } },
          createdBy: { select: { id: true, nameAr: true } },
          _count: { select: { expenses: true, settlements: true, attachments: true } },
        },
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
        track: { select: { id: true, nameAr: true, color: true } },
        createdBy: { select: { id: true, nameAr: true } },
        expenses: {
          include: {
            createdBy: { select: { id: true, nameAr: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        settlements: {
          include: {
            createdBy: { select: { id: true, nameAr: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        attachments: { orderBy: { uploadedAt: 'desc' } },
      },
    });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');
    return custody;
  }

  async updateCustody(id: string, dto: UpdateCustodyDto, userId: string) {
    const existing = await this.prisma.custody.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العهدة غير موجودة');

    const updated = await this.prisma.custody.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status as any }),
      },
    });

    await this.auditLog(id, 'UPDATE', 'CUSTODY', id, existing, updated, userId);
    return updated;
  }

  async deleteCustody(id: string, userId: string) {
    const existing = await this.prisma.custody.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العهدة غير موجودة');

    await this.auditLog(id, 'DELETE', 'CUSTODY', id, existing, null, userId);
    await this.prisma.custody.delete({ where: { id } });
    return { message: 'تم حذف العهدة' };
  }

  // ─── EXPENSES ──────────────────────────────────────────────

  async addExpense(dto: CreateExpenseDto, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id: dto.custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');

    if (dto.amount > custody.remainingAmount) {
      throw new BadRequestException(`المبلغ يتجاوز المتبقي (${custody.remainingAmount.toLocaleString('en-US')} ريال)`);
    }

    const newRemaining = custody.remainingAmount - dto.amount;
    const newSpent = custody.spentAmount + dto.amount;
    const newStatus = newRemaining <= 0 ? 'CLOSED' : (newRemaining / custody.totalAmount) <= 0.20 ? 'LOW_BALANCE' : 'ACTIVE';

    const [expense] = await this.prisma.$transaction([
      this.prisma.custodyExpense.create({
        data: {
          custodyId: dto.custodyId,
          amount: dto.amount,
          description: dto.description,
          notes: dto.notes,
          createdById: userId,
        },
        include: { createdBy: { select: { id: true, nameAr: true } } },
      }),
      this.prisma.custody.update({
        where: { id: dto.custodyId },
        data: {
          remainingAmount: Math.max(0, newRemaining),
          spentAmount: newSpent,
          status: newStatus as any,
        },
      }),
    ]);

    await this.auditLog(dto.custodyId, 'CREATE', 'EXPENSE', expense.id, null, { amount: dto.amount, description: dto.description }, userId);

    return { expense, custody: { remainingAmount: Math.max(0, newRemaining), spentAmount: newSpent, status: newStatus } };
  }

  async deleteExpense(expenseId: string, userId: string) {
    const expense = await this.prisma.custodyExpense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('سجل الصرف غير موجود');

    const custody = await this.prisma.custody.findUnique({ where: { id: expense.custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');

    const newRemaining = custody.remainingAmount + expense.amount;
    const newSpent = custody.spentAmount - expense.amount;
    const newStatus = newRemaining <= 0 ? 'CLOSED' : (newRemaining / custody.totalAmount) <= 0.20 ? 'LOW_BALANCE' : 'ACTIVE';

    await this.prisma.$transaction([
      this.prisma.custodyExpense.delete({ where: { id: expenseId } }),
      this.prisma.custody.update({
        where: { id: expense.custodyId },
        data: { remainingAmount: newRemaining, spentAmount: Math.max(0, newSpent), status: newStatus as any },
      }),
    ]);

    await this.auditLog(expense.custodyId, 'DELETE', 'EXPENSE', expenseId, expense, null, userId);
    return { message: 'تم حذف سجل الصرف' };
  }

  // ─── SETTLEMENTS ───────────────────────────────────────────

  async addSettlement(dto: CreateSettlementDto, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id: dto.custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');

    const settlement = await this.prisma.custodySettlement.create({
      data: {
        custodyId: dto.custodyId,
        amount: dto.amount,
        date: new Date(dto.date),
        reference: dto.reference,
        notes: dto.notes,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, nameAr: true } } },
    });

    // Check if fully settled
    const totalSettled = await this.prisma.custodySettlement.aggregate({
      where: { custodyId: dto.custodyId },
      _sum: { amount: true },
    });

    if ((totalSettled._sum.amount || 0) >= custody.spentAmount && custody.spentAmount > 0) {
      await this.prisma.custody.update({ where: { id: dto.custodyId }, data: { status: 'SETTLED' } });
    }

    await this.auditLog(dto.custodyId, 'CREATE', 'SETTLEMENT', settlement.id, null, { amount: dto.amount }, userId);
    return settlement;
  }

  // ─── DASHBOARD ─────────────────────────────────────────────

  async getDashboard() {
    const [custodies, totalBudget, totalSpent, totalRemaining, lowBalance, byCategory, byTrack] = await Promise.all([
      this.prisma.custody.count(),
      this.prisma.custody.aggregate({ _sum: { totalAmount: true } }),
      this.prisma.custody.aggregate({ _sum: { spentAmount: true } }),
      this.prisma.custody.aggregate({ _sum: { remainingAmount: true } }),
      this.prisma.custody.count({ where: { status: 'LOW_BALANCE' } }),
      this.prisma.custody.groupBy({ by: ['category'], _sum: { spentAmount: true, totalAmount: true }, _count: true }),
      this.prisma.custody.groupBy({
        by: ['trackId'],
        where: { trackId: { not: null } },
        _sum: { spentAmount: true, totalAmount: true },
        _count: true,
      }),
    ]);

    // Enrich track names
    const trackIds = byTrack.map((t) => t.trackId).filter(Boolean) as string[];
    const tracks = trackIds.length > 0
      ? await this.prisma.track.findMany({ where: { id: { in: trackIds } }, select: { id: true, nameAr: true, color: true } })
      : [];
    const trackMap = Object.fromEntries(tracks.map((t) => [t.id, t]));

    const settled = await this.prisma.custody.count({ where: { status: 'SETTLED' } });
    const unsettled = await this.prisma.custody.count({ where: { status: { not: 'SETTLED' } } });

    // Monthly spending (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyExpenses = await this.prisma.custodyExpense.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { amount: true, createdAt: true },
    });

    const monthlyMap = new Map<string, number>();
    for (const e of monthlyExpenses) {
      const key = `${e.createdAt.getFullYear()}-${String(e.createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + e.amount);
    }
    const monthlySpending = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: Math.round(amount) }));

    return {
      totalCustodies: custodies,
      totalBudget: totalBudget._sum.totalAmount || 0,
      totalSpent: totalSpent._sum.spentAmount || 0,
      totalRemaining: totalRemaining._sum.remainingAmount || 0,
      lowBalanceCount: lowBalance,
      settledCount: settled,
      unsettledCount: unsettled,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        count: c._count,
        spent: c._sum.spentAmount || 0,
        budget: c._sum.totalAmount || 0,
      })),
      byTrack: byTrack.map((t) => ({
        trackId: t.trackId,
        trackName: trackMap[t.trackId!]?.nameAr || 'غير محدد',
        trackColor: trackMap[t.trackId!]?.color || '#6366f1',
        count: t._count,
        spent: t._sum.spentAmount || 0,
        budget: t._sum.totalAmount || 0,
      })),
      monthlySpending,
    };
  }

  // ─── AUDIT LOG ─────────────────────────────────────────────

  private async auditLog(custodyId: string, action: string, entityType: string, entityId: string, oldValue: any, newValue: any, userId: string) {
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

  async getAuditLogs(custodyId: string) {
    return this.prisma.custodyAuditLog.findMany({
      where: { custodyId },
      include: { user: { select: { id: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ─── FILE MANAGEMENT ───────────────────────────────────────

  async uploadFiles(custodyId: string, files: Express.Multer.File[], userId: string, expenseId?: string, settlementId?: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id: custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');

    const attachments = await Promise.all(
      files.map((f) =>
        this.prisma.custodyAttachment.create({
          data: {
            custodyId,
            expenseId: expenseId || null,
            settlementId: settlementId || null,
            fileName: f.originalname,
            fileSize: f.size,
            mimeType: f.mimetype,
            filePath: f.path,
            uploadedById: userId,
          },
        }),
      ),
    );

    await this.auditLog(custodyId, 'UPLOAD', 'ATTACHMENT', custodyId, null, { count: files.length }, userId);
    return attachments;
  }

  async deleteAttachment(id: string) {
    const att = await this.prisma.custodyAttachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('المرفق غير موجود');

    try { fs.unlinkSync(att.filePath); } catch {}
    await this.prisma.custodyAttachment.delete({ where: { id } });
    return { message: 'تم حذف المرفق' };
  }

  async downloadAllAsZip(custodyId: string, expenseId?: string): Promise<Buffer> {
    const where: any = { custodyId };
    if (expenseId) where.expenseId = expenseId;

    const attachments = await this.prisma.custodyAttachment.findMany({ where });
    if (attachments.length === 0) throw new NotFoundException('لا توجد مرفقات');

    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 5 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      for (const att of attachments) {
        if (fs.existsSync(att.filePath)) {
          archive.file(att.filePath, { name: att.fileName });
        }
      }

      archive.finalize();
    });
  }

  // ─── CLOSE CUSTODY ─────────────────────────────────────────

  async closeCustody(custodyId: string, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id: custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');
    if (custody.status === 'CLOSED' || custody.status === 'SETTLED') {
      throw new BadRequestException('العهدة مغلقة بالفعل');
    }

    const updated = await this.prisma.custody.update({
      where: { id: custodyId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    await this.auditLog(custodyId, 'CLOSE', 'CUSTODY', custodyId, { status: custody.status }, { status: 'CLOSED' }, userId);
    return updated;
  }

  // ─── MEMBER MANAGEMENT ─────────────────────────────────────

  async addMember(dto: AddMemberDto, userId: string) {
    const custody = await this.prisma.custody.findUnique({ where: { id: dto.custodyId } });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');

    const member = await this.prisma.custodyMember.upsert({
      where: { custodyId_userId: { custodyId: dto.custodyId, userId: dto.userId } },
      update: { role: dto.role || 'viewer' },
      create: { custodyId: dto.custodyId, userId: dto.userId, role: dto.role || 'viewer' },
      include: { user: { select: { id: true, nameAr: true, name: true, email: true } } },
    });

    await this.auditLog(dto.custodyId, 'ADD_MEMBER', 'MEMBER', member.id, null, { userId: dto.userId, role: dto.role }, userId);
    return member;
  }

  async removeMember(custodyId: string, memberId: string, userId: string) {
    const member = await this.prisma.custodyMember.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('العضو غير موجود');

    await this.prisma.custodyMember.delete({ where: { id: memberId } });
    await this.auditLog(custodyId, 'REMOVE_MEMBER', 'MEMBER', memberId, member, null, userId);
    return { message: 'تم إزالة العضو' };
  }

  async getMembers(custodyId: string) {
    return this.prisma.custodyMember.findMany({
      where: { custodyId },
      include: { user: { select: { id: true, nameAr: true, name: true, email: true } } },
      orderBy: { addedAt: 'asc' },
    });
  }
}
