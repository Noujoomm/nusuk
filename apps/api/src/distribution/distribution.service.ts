import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateAchievementDto, CreateDeviationDto } from './distribution.dto';

/** Round to 1 decimal place using standard rounding */
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

@Injectable()
export class DistributionService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════
  //  ACHIEVEMENT
  // ═══════════════════════════════════════════

  async createAchievement(dto: CreateAchievementDto, userId: string) {
    return this.prisma.distributionAchievement.create({
      data: {
        ...dto,
        gregorianDate: new Date(dto.gregorianDate),
        batch: dto.batch ?? '',
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
      // Expected = cardsPerHour × duration × specialists
      const expected = e.cardsPerHour * e.duration * e.specialists;
      // Achievement = (totalCards / expected) × 100, rounded to 1 decimal
      const achievementPct = expected > 0 ? r1((e.totalCards / expected) * 100) : 0;
      const gap = expected - e.totalCards;

      let status: string;
      if (achievementPct >= 100) status = 'excellent';
      else if (achievementPct >= 85) status = 'warning';
      else status = 'critical';

      return { ...e, expected, achievementPct, gap, status, overLimit: e.cardsPerHour > 4000 };
    });

    const n = entries.length;
    return {
      entries,
      summary: {
        avg: r1(entries.reduce((s, e) => s + e.achievementPct, 0) / n),
        highest: Math.max(...entries.map((e) => e.achievementPct)),
        latest: entries[0]?.achievementPct ?? 0,
        latestGap: entries[0]?.gap ?? 0,
        aboveTarget: entries.filter((e) => e.achievementPct >= 100).length,
        overLimitDays: entries.filter((e) => e.overLimit).length,
        total: n,
        totalCards: entries.reduce((s, e) => s + e.totalCards, 0),
        totalExpected: entries.reduce((s, e) => s + e.expected, 0),
        totalCompanies: entries.reduce((s, e) => s + e.companies, 0),
      },
    };
  }

  // ═══════════════════════════════════════════
  //  DEVIATION
  // ═══════════════════════════════════════════

  async createDeviation(dto: CreateDeviationDto, userId: string) {
    return this.prisma.distributionDeviation.create({
      data: {
        ...dto,
        gregorianDate: new Date(dto.gregorianDate),
        reportsPlatform: dto.reportsPlatform ?? 0,
        reportsApple: dto.reportsApple ?? 0,
        reportsAndroid: dto.reportsAndroid ?? 0,
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
      const p = e.parcels; // denominator
      // Deviation % = (value / parcels) × 100
      const calc = (v: number) => p > 0 ? r1((v / p) * 100) : 0;

      const platformDev = calc(e.platformValue);
      const factoryDev = calc(e.factoryValue);
      const distributionDev = calc(e.distributionValue);
      const threeHourDev = calc(e.threeHourValue);
      const reportsPlatformDev = calc(e.reportsPlatform);
      const reportsAppleDev = calc(e.reportsApple);
      const reportsAndroidDev = calc(e.reportsAndroid);

      const allDevs = [platformDev, factoryDev, distributionDev, threeHourDev, reportsPlatformDev, reportsAppleDev, reportsAndroidDev];
      const totalDev = r1(allDevs.reduce((s, v) => s + v, 0) / allDevs.length);

      const noDenom = p === 0;

      return {
        ...e,
        platformDev, factoryDev, distributionDev, threeHourDev,
        reportsPlatformDev, reportsAppleDev, reportsAndroidDev,
        totalDev, noDenom,
      };
    });

    const n = entries.length;
    const avg = (field: string) => r1(entries.reduce((s, e) => s + ((e as any)[field] ?? 0), 0) / n);
    const latest = entries[0];
    const hasCritical = entries.some((e) =>
      e.platformDev >= 30 || e.factoryDev >= 30 || e.distributionDev >= 30 ||
      e.threeHourDev >= 30 || e.reportsPlatformDev >= 30 || e.reportsAppleDev >= 30 || e.reportsAndroidDev >= 30
    );

    // Find highest deviation source
    const devSources = [
      { name: 'المنصة', val: latest?.platformDev ?? 0 },
      { name: 'المصنع', val: latest?.factoryDev ?? 0 },
      { name: 'التوزيع', val: latest?.distributionDev ?? 0 },
      { name: '3HOUR', val: latest?.threeHourDev ?? 0 },
      { name: 'بلاغات المنصة', val: latest?.reportsPlatformDev ?? 0 },
      { name: 'Apple', val: latest?.reportsAppleDev ?? 0 },
      { name: 'Android', val: latest?.reportsAndroidDev ?? 0 },
    ];
    const highestSource = devSources.sort((a, b) => b.val - a.val)[0];

    return {
      entries,
      summary: {
        avgPlatform: avg('platformDev'),
        avgFactory: avg('factoryDev'),
        avgDistribution: avg('distributionDev'),
        avg3Hour: avg('threeHourDev'),
        avgReportsPlatform: avg('reportsPlatformDev'),
        avgApple: avg('reportsAppleDev'),
        avgAndroid: avg('reportsAndroidDev'),
        avgTotal: avg('totalDev'),
        hasCritical,
        highestSource,
        total: n,
      },
    };
  }
}
