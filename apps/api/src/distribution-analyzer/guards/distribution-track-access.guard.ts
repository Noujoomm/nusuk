import { CanActivate, ExecutionContext, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/**
 * Gate for the Distribution Smart Analyzer.
 *
 * Pass conditions:
 *  - role ∈ {admin, system_manager}                                 → unconditional access
 *  - role ∈ {pm, track_lead, hr, employee} + has TrackPermission
 *    on the distribution track                                       → allowed
 *
 * The distribution-track id is resolved once on module init from the
 * Track row whose `name` is "distribution" (see prisma/seed.ts). It's
 * cached here to keep the guard a constant-time check; if the seed
 * row is missing on a fresh DB, the guard fails closed with a 403.
 *
 * Runs AFTER JwtAuthGuard, so `req.user` is populated by JwtStrategy.
 */
@Injectable()
export class DistributionTrackAccessGuard implements CanActivate, OnModuleInit {
  private distributionTrackId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const track = await this.prisma.track.findUnique({
      where: { name: 'distribution' },
      select: { id: true },
    });
    this.distributionTrackId = track?.id ?? null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user: {
      id: string;
      role: string;
      trackPermissions?: Array<{ trackId: string; permissions: string[] }>;
    } | undefined = req.user;

    if (!user) throw new ForbiddenException('غير مصرح');

    if (user.role === 'admin' || user.role === 'system_manager') return true;

    // Resolve track id lazily if module init lost the race with the request.
    if (!this.distributionTrackId) {
      await this.onModuleInit();
    }
    if (!this.distributionTrackId) {
      throw new ForbiddenException('مسار التوزيع غير معرّف في النظام');
    }

    const hasAccess = (user.trackPermissions ?? []).some(
      (tp) => tp.trackId === this.distributionTrackId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('هذه الميزة متاحة فقط لأعضاء مسار التوزيع');
    }
    return true;
  }

  /** Exposed so the service can stamp `trackId` on new sessions without a 2nd query. */
  getDistributionTrackId(): string | null {
    return this.distributionTrackId;
  }
}
