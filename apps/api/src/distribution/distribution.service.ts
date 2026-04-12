import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateAchievementDto, UpdateAchievementDto, CreateDeviationDto } from './distribution.dto';

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

  async updateAchievement(id: string, dto: UpdateAchievementDto) {
    const existing = await this.prisma.distributionAchievement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('السجل غير موجود');
    return this.prisma.distributionAchievement.update({
      where: { id },
      data: {
        ...(dto.batch !== undefined && { batch: dto.batch }),
        ...(dto.companies !== undefined && { companies: dto.companies }),
        ...(dto.parcels !== undefined && { parcels: dto.parcels }),
        ...(dto.totalCards !== undefined && { totalCards: dto.totalCards }),
        ...(dto.cardsPerHour !== undefined && { cardsPerHour: dto.cardsPerHour }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.specialists !== undefined && { specialists: dto.specialists }),
        ...(dto.cardsReceivedFromFactory !== undefined && { cardsReceivedFromFactory: dto.cardsReceivedFromFactory }),
        ...(dto.distributionCenter !== undefined && { distributionCenter: dto.distributionCenter }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
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
  //  DEVIATION (4 independent subsections)
  // ═══════════════════════════════════════════

  async createDeviation(dto: CreateDeviationDto, userId: string) {
    return this.prisma.distributionDeviation.create({
      data: {
        ...dto,
        gregorianDate: new Date(dto.gregorianDate),
        totalCompanies3h: dto.totalCompanies3h ?? 0,
        attendedCompanies3h: dto.attendedCompanies3h ?? 0,
        completionPct: dto.completionPct ?? 100,
        totalReceiving: dto.totalReceiving ?? 0,
        completedReceiving: dto.completedReceiving ?? 0,
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
      // ── Section 1: Input deviations (|A-B|/B × 100) ──
      const platVsFact = e.factoryValue > 0 ? r1(Math.abs(e.platformValue - e.factoryValue) / e.factoryValue * 100) : 0;
      const factVsDist = e.distributionValue > 0 ? r1(Math.abs(e.factoryValue - e.distributionValue) / e.distributionValue * 100) : 0;
      const platVsDist = e.distributionValue > 0 ? r1(Math.abs(e.platformValue - e.distributionValue) / e.distributionValue * 100) : 0;

      // ── Section 2A: Appointment 3H ──
      const appointmentDev = e.totalCompanies3h > 0
        ? r1(((e.totalCompanies3h - e.attendedCompanies3h) / e.totalCompanies3h) * 100) : 0;

      // ── Section 2B: Completion Certificate ──
      const completionDev = r1(100 - e.completionPct);

      // ── Section 2C: Receiving ──
      const receivingDev = e.totalReceiving > 0
        ? r1(((e.totalReceiving - e.completedReceiving) / e.totalReceiving) * 100) : 0;

      // ── Section 3: System Reports ──
      const totalReports = e.reportsPlatform + e.reportsApple + e.reportsAndroid;
      const reportsPlatformPct = totalReports > 0 ? r1(e.reportsPlatform / totalReports * 100) : 0;
      const reportsApplePct = totalReports > 0 ? r1(e.reportsApple / totalReports * 100) : 0;
      const reportsAndroidPct = totalReports > 0 ? r1(e.reportsAndroid / totalReports * 100) : 0;

      return {
        ...e,
        // Section 1
        platVsFact, factVsDist, platVsDist,
        // Section 2
        appointmentDev, completionDev, receivingDev,
        // Section 3
        totalReports, reportsPlatformPct, reportsApplePct, reportsAndroidPct,
      };
    });

    const n = entries.length;
    const avg = (f: string) => r1(entries.reduce((s, e) => s + ((e as any)[f] ?? 0), 0) / n);
    const latest = entries[0];

    // Collect all deviation values to find critical
    const hasCritical = entries.some((e) =>
      e.platVsFact >= 30 || e.factVsDist >= 30 || e.platVsDist >= 30 ||
      e.appointmentDev >= 30 || e.receivingDev >= 30
    );

    return {
      entries,
      summary: {
        // Section 1 averages
        avgPlatVsFact: avg('platVsFact'),
        avgFactVsDist: avg('factVsDist'),
        avgPlatVsDist: avg('platVsDist'),
        // Section 2 latest
        latestAppointment: latest?.appointmentDev ?? 0,
        latestCompletion: latest?.completionDev ?? 0,
        latestReceiving: latest?.receivingDev ?? 0,
        // Section 3 latest
        latestReportsPlatform: latest?.reportsPlatformPct ?? 0,
        latestReportsApple: latest?.reportsApplePct ?? 0,
        latestReportsAndroid: latest?.reportsAndroidPct ?? 0,
        latestTotalReports: latest?.totalReports ?? 0,
        hasCritical,
        total: n,
      },
    };
  }
}
