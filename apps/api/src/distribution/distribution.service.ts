import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDistributionEntryDto } from './distribution.dto';

const DURATION = 4;
const SPECIALISTS = 4;

function achievementStatus(pct: number): string {
  if (pct >= 100) return 'excellent';
  if (pct >= 95) return 'on_track';
  if (pct >= 85) return 'warning';
  return 'critical';
}

function deviationSeverity(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 10) return 'low';
  if (abs <= 25) return 'medium';
  return 'high';
}

@Injectable()
export class DistributionService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.distributionEntry.findMany({
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
      orderBy: { gregorianDate: 'desc' },
    });
  }

  async create(dto: CreateDistributionEntryDto, userId: string) {
    return this.prisma.distributionEntry.create({
      data: { ...dto, gregorianDate: new Date(dto.gregorianDate), createdById: userId },
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
    });
  }

  async delete(id: string) {
    const entry = await this.prisma.distributionEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('السجل غير موجود');
    await this.prisma.distributionEntry.delete({ where: { id } });
    return { message: 'تم حذف السجل' };
  }

  async getDashboard() {
    const entries = await this.prisma.distributionEntry.findMany({
      orderBy: { gregorianDate: 'desc' },
    });

    const computed = entries.map((e) => {
      const expected = e.cardsPerHour * DURATION * SPECIALISTS;
      const achievement = expected > 0 ? Math.round((e.distributionActual / expected) * 1000) / 10 : 0;

      const platVsFact = e.factoryActual > 0 ? Math.round(((e.platformActual - e.factoryActual) / e.factoryActual) * 1000) / 10 : 0;
      const platVsDist = e.distributionActual > 0 ? Math.round(((e.platformActual - e.distributionActual) / e.distributionActual) * 1000) / 10 : 0;
      const factVsDist = e.distributionActual > 0 ? Math.round(((e.factoryActual - e.distributionActual) / e.distributionActual) * 1000) / 10 : 0;

      return {
        ...e,
        duration: DURATION,
        specialists: SPECIALISTS,
        expectedCapacity: expected,
        achievement,
        achievementStatus: achievementStatus(achievement),
        platVsFact,
        platVsDist,
        factVsDist,
        platVsFactSeverity: deviationSeverity(platVsFact),
        platVsDistSeverity: deviationSeverity(platVsDist),
        factVsDistSeverity: deviationSeverity(factVsDist),
        platVsFactAbs: Math.abs(e.platformActual - e.factoryActual),
        platVsDistAbs: Math.abs(e.platformActual - e.distributionActual),
        factVsDistAbs: Math.abs(e.factoryActual - e.distributionActual),
        overLimit: e.cardsPerHour > 4000,
      };
    });

    const total = computed.length;
    if (total === 0) return { entries: [], achievement: null, deviation: null };

    // Achievement aggregates
    const avgAchievement = Math.round(computed.reduce((s, e) => s + e.achievement, 0) / total * 10) / 10;
    const totalExpected = computed.reduce((s, e) => s + e.expectedCapacity, 0);
    const totalDistribution = computed.reduce((s, e) => s + e.distributionActual, 0);
    const overLimitCount = computed.filter((e) => e.overLimit).length;

    // Deviation aggregates
    const avgPlatVsFact = Math.round(computed.reduce((s, e) => s + e.platVsFact, 0) / total * 10) / 10;
    const avgPlatVsDist = Math.round(computed.reduce((s, e) => s + e.platVsDist, 0) / total * 10) / 10;
    const avgFactVsDist = Math.round(computed.reduce((s, e) => s + e.factVsDist, 0) / total * 10) / 10;
    const totalPlatform = computed.reduce((s, e) => s + e.platformActual, 0);
    const totalFactory = computed.reduce((s, e) => s + e.factoryActual, 0);

    const deviations = [
      { pair: 'المنصة والمصنع', pairEn: 'platform_factory', avg: avgPlatVsFact, severity: deviationSeverity(avgPlatVsFact) },
      { pair: 'المنصة والتوزيع', pairEn: 'platform_distribution', avg: avgPlatVsDist, severity: deviationSeverity(avgPlatVsDist) },
      { pair: 'المصنع والتوزيع', pairEn: 'factory_distribution', avg: avgFactVsDist, severity: deviationSeverity(avgFactVsDist) },
    ];
    const highestDeviation = [...deviations].sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg))[0];
    const hasCriticalDeviation = deviations.some((d) => d.severity === 'high');

    return {
      entries: computed,
      achievement: {
        avgAchievement,
        totalExpected,
        totalDistribution,
        overallStatus: achievementStatus(avgAchievement),
        overLimitCount,
        totalEntries: total,
      },
      deviation: {
        avgPlatVsFact,
        avgPlatVsDist,
        avgFactVsDist,
        totalPlatform,
        totalFactory,
        totalDistribution,
        deviations,
        highestDeviation,
        hasCriticalDeviation,
      },
    };
  }
}
