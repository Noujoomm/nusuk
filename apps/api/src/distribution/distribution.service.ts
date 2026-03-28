import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDistributionEntryDto } from './distribution.dto';

const DURATION = 4;
const SPECIALISTS = 4;

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
      const achievement = expected > 0 ? Math.round((e.distributionActual / expected) * 100 * 10) / 10 : 0;
      const platVsFact = e.factoryActual > 0 ? Math.round(((e.platformActual - e.factoryActual) / e.factoryActual) * 100 * 10) / 10 : 0;
      const platVsDist = e.distributionActual > 0 ? Math.round(((e.platformActual - e.distributionActual) / e.distributionActual) * 100 * 10) / 10 : 0;
      const factVsDist = e.distributionActual > 0 ? Math.round(((e.factoryActual - e.distributionActual) / e.distributionActual) * 100 * 10) / 10 : 0;

      let status: string;
      if (achievement >= 95) status = 'excellent';
      else if (achievement >= 85) status = 'on_track';
      else if (achievement >= 70) status = 'warning';
      else status = 'critical';

      return {
        ...e,
        duration: DURATION,
        specialists: SPECIALISTS,
        expectedCapacity: expected,
        achievement,
        platVsFact,
        platVsDist,
        factVsDist,
        status,
        overLimit: e.cardsPerHour > 4000,
      };
    });

    // Aggregates
    const total = computed.length;
    if (total === 0) {
      return { entries: [], summary: null };
    }

    const avgAchievement = Math.round(computed.reduce((s, e) => s + e.achievement, 0) / total * 10) / 10;
    const totalExpected = computed.reduce((s, e) => s + e.expectedCapacity, 0);
    const totalPlatform = computed.reduce((s, e) => s + e.platformActual, 0);
    const totalFactory = computed.reduce((s, e) => s + e.factoryActual, 0);
    const totalDistribution = computed.reduce((s, e) => s + e.distributionActual, 0);
    const overLimitCount = computed.filter((e) => e.overLimit).length;

    const maxDeviation = [
      { pair: 'المنصة والمصنع', value: Math.abs(computed.reduce((s, e) => s + e.platVsFact, 0) / total) },
      { pair: 'المنصة والتوزيع', value: Math.abs(computed.reduce((s, e) => s + e.platVsDist, 0) / total) },
      { pair: 'المصنع والتوزيع', value: Math.abs(computed.reduce((s, e) => s + e.factVsDist, 0) / total) },
    ].sort((a, b) => b.value - a.value)[0];

    let overallStatus: string;
    if (avgAchievement >= 95) overallStatus = 'excellent';
    else if (avgAchievement >= 85) overallStatus = 'on_track';
    else if (avgAchievement >= 70) overallStatus = 'warning';
    else overallStatus = 'critical';

    return {
      entries: computed,
      summary: {
        totalEntries: total,
        avgAchievement,
        totalExpected,
        totalPlatform,
        totalFactory,
        totalDistribution,
        overLimitCount,
        maxDeviation,
        overallStatus,
      },
    };
  }
}
