import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateAchievementDto, CreateDeviationDto } from './distribution.dto';

@Injectable()
export class DistributionService {
  constructor(private prisma: PrismaService) {}

  // ═══ ACHIEVEMENT ═══

  async listAchievements() {
    return this.prisma.distributionAchievement.findMany({
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
      orderBy: { gregorianDate: 'desc' },
    });
  }

  async createAchievement(dto: CreateAchievementDto, userId: string) {
    return this.prisma.distributionAchievement.create({
      data: {
        ...dto,
        gregorianDate: new Date(dto.gregorianDate),
        duration: dto.duration ?? 4,
        specialists: dto.specialists ?? 4,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
    });
  }

  async deleteAchievement(id: string) {
    const e = await this.prisma.distributionAchievement.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('السجل غير موجود');
    await this.prisma.distributionAchievement.delete({ where: { id } });
    return { message: 'تم الحذف' };
  }

  async achievementDashboard() {
    const entries = await this.prisma.distributionAchievement.findMany({ orderBy: { gregorianDate: 'desc' } });
    if (entries.length === 0) return { entries: [], summary: null };

    const n = entries.length;
    const avg = Math.round(entries.reduce((s, e) => s + e.achievementPct, 0) / n * 10) / 10;
    const highest = Math.max(...entries.map((e) => e.achievementPct));
    const latest = entries[0]?.achievementPct ?? 0;
    const totalCompanies = entries.reduce((s, e) => s + e.companies, 0);
    const totalBatches = entries.reduce((s, e) => s + e.batches, 0);
    const totalCards = entries.reduce((s, e) => s + e.totalCards, 0);
    const aboveTarget = entries.filter((e) => e.achievementPct > 100).length;

    return {
      entries,
      summary: { avg, highest, latest, totalCompanies, totalBatches, totalCards, aboveTarget, total: n },
    };
  }

  // ═══ DEVIATION ═══

  async listDeviations() {
    return this.prisma.distributionDeviation.findMany({
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
      orderBy: { gregorianDate: 'desc' },
    });
  }

  async createDeviation(dto: CreateDeviationDto, userId: string) {
    return this.prisma.distributionDeviation.create({
      data: { ...dto, gregorianDate: new Date(dto.gregorianDate), createdById: userId },
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
    });
  }

  async deleteDeviation(id: string) {
    const e = await this.prisma.distributionDeviation.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('السجل غير موجود');
    await this.prisma.distributionDeviation.delete({ where: { id } });
    return { message: 'تم الحذف' };
  }

  async deviationDashboard() {
    const entries = await this.prisma.distributionDeviation.findMany({ orderBy: { gregorianDate: 'desc' } });
    if (entries.length === 0) return { entries: [], summary: null };

    const n = entries.length;
    const avgPlatform = Math.round(entries.reduce((s, e) => s + e.platformDevPct, 0) / n * 10) / 10;
    const avgReceipt = Math.round(entries.reduce((s, e) => s + e.fullReceiptDevPct, 0) / n * 10) / 10;
    const avgCert = Math.round(entries.reduce((s, e) => s + e.completionCertDevPct, 0) / n * 10) / 10;
    const avg3Hour = Math.round(entries.reduce((s, e) => s + e.booking3HourDevPct, 0) / n * 10) / 10;
    const latest = entries[0];
    const hasCritical = entries.some((e) =>
      Math.abs(e.platformDevPct) > 25 || Math.abs(e.fullReceiptDevPct) > 25 ||
      Math.abs(e.completionCertDevPct) > 25 || Math.abs(e.booking3HourDevPct) > 25
    );

    return {
      entries,
      summary: { avgPlatform, avgReceipt, avgCert, avg3Hour, hasCritical, total: n,
        latestPlatform: latest?.platformDevPct ?? 0,
        latestReceipt: latest?.fullReceiptDevPct ?? 0,
        latestCert: latest?.completionCertDevPct ?? 0,
        latest3Hour: latest?.booking3HourDevPct ?? 0,
      },
    };
  }
}
