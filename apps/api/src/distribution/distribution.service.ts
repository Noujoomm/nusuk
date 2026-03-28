import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateAchievementDto, CreateDeviationDto } from './distribution.dto';

const EXPECTED_PER_HOUR = 4000;

function pct(actual: number, expected: number): number {
  return expected > 0 ? Math.round((actual / expected) * 1000) / 10 : 0;
}

function devPct(expected: number, actual: number): number {
  return expected > 0 ? Math.round((Math.abs(expected - actual) / expected) * 1000) / 10 : 0;
}

@Injectable()
export class DistributionService {
  constructor(private prisma: PrismaService) {}

  // ═══ ACHIEVEMENT ═══

  async createAchievement(dto: CreateAchievementDto, userId: string) {
    return this.prisma.distributionAchievement.create({
      data: {
        ...dto,
        gregorianDate: new Date(dto.gregorianDate),
        duration: dto.duration ?? 4,
        specialists: dto.specialists ?? 4,
        createdById: userId,
      },
    });
  }

  async deleteAchievement(id: string) {
    const e = await this.prisma.distributionAchievement.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('السجل غير موجود');
    await this.prisma.distributionAchievement.delete({ where: { id } });
    return { message: 'تم الحذف' };
  }

  async achievementDashboard() {
    const raw = await this.prisma.distributionAchievement.findMany({ orderBy: { gregorianDate: 'desc' } });
    if (raw.length === 0) return { entries: [], summary: null };

    const entries = raw.map((e) => {
      const expected = EXPECTED_PER_HOUR * e.duration;
      const achievementPct = pct(e.totalCards, expected);
      return {
        ...e,
        expectedCards: expected,
        achievementPct,
        overLimit: e.cardsPerHour > 4000,
      };
    });

    const n = entries.length;
    const avg = Math.round(entries.reduce((s, e) => s + e.achievementPct, 0) / n * 10) / 10;
    const highest = Math.max(...entries.map((e) => e.achievementPct));
    const latest = entries[0]?.achievementPct ?? 0;
    const aboveTarget = entries.filter((e) => e.achievementPct >= 100).length;
    const overLimitDays = entries.filter((e) => e.overLimit).length;

    return {
      entries,
      summary: {
        avg, highest, latest, aboveTarget, overLimitDays, total: n,
        totalCompanies: entries.reduce((s, e) => s + e.companies, 0),
        totalBatches: entries.reduce((s, e) => s + e.batches, 0),
        totalCards: entries.reduce((s, e) => s + e.totalCards, 0),
      },
    };
  }

  // ═══ DEVIATION ═══

  async createDeviation(dto: CreateDeviationDto, userId: string) {
    return this.prisma.distributionDeviation.create({
      data: {
        ...dto,
        gregorianDate: new Date(dto.gregorianDate),
        expectedSortingTime: dto.expectedSortingTime ?? 60,
        systemDowntime: dto.systemDowntime ?? 0,
        createdById: userId,
      },
    });
  }

  async deleteDeviation(id: string) {
    const e = await this.prisma.distributionDeviation.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('السجل غير موجود');
    await this.prisma.distributionDeviation.delete({ where: { id } });
    return { message: 'تم الحذف' };
  }

  async deviationDashboard() {
    const raw = await this.prisma.distributionDeviation.findMany({ orderBy: { gregorianDate: 'desc' } });
    if (raw.length === 0) return { entries: [], summary: null };

    const entries = raw.map((e) => {
      const total = e.platformValue + e.factoryValue + e.distributionValue;
      const avgBase = total > 0 ? Math.round(total / 3) : 1;

      const platformDev = devPct(avgBase, e.platformValue);
      const factoryDev = devPct(avgBase, e.factoryValue);
      const distributionDev = devPct(avgBase, e.distributionValue);
      const deliveryDev = devPct(e.companies, e.fullDeliveryCount);
      const appointmentDev = devPct(e.scheduledAppointments, e.actualAppointments);
      const sortingDev = devPct(e.expectedSortingTime, e.sortingTime);

      return {
        ...e,
        platformDev, factoryDev, distributionDev,
        deliveryDev, appointmentDev, sortingDev,
      };
    });

    const n = entries.length;
    const avg = (field: string) => Math.round(entries.reduce((s, e) => s + (e as any)[field], 0) / n * 10) / 10;
    const latest = entries[0];
    const hasCritical = entries.some((e) =>
      e.platformDev > 15 || e.factoryDev > 15 || e.distributionDev > 15 ||
      e.deliveryDev > 15 || e.appointmentDev > 15 || e.sortingDev > 15
    );

    return {
      entries,
      summary: {
        avgPlatform: avg('platformDev'),
        avgFactory: avg('factoryDev'),
        avgDistribution: avg('distributionDev'),
        avgDelivery: avg('deliveryDev'),
        avgAppointment: avg('appointmentDev'),
        avgSorting: avg('sortingDev'),
        hasCritical,
        total: n,
        latestPlatform: latest?.platformDev ?? 0,
        latestFactory: latest?.factoryDev ?? 0,
        latestDistribution: latest?.distributionDev ?? 0,
        latestDelivery: latest?.deliveryDev ?? 0,
        latestAppointment: latest?.appointmentDev ?? 0,
        latestSorting: latest?.sortingDev ?? 0,
      },
    };
  }
}
