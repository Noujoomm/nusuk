import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { buildSkipTake } from '../common/utils/pagination.util';

interface AuditLogInput {
  actorId?: string;
  actionType: string;
  entityType: string;
  entityId?: string;
  trackId?: string;
  beforeData?: any;
  afterData?: any;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    try {
      await this.prisma.auditLog.create({ data: input });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err.message}`);
    }
  }

  async findAll(params: {
    page: number;
    pageSize: number;
    trackId?: string;
    entityType?: string;
    actionType?: string;
    actorId?: string;
  }) {
    const { page, pageSize, trackId, entityType, actionType, actorId } = params;
    const { skip, take } = buildSkipTake(page, pageSize);
    const where: any = {};
    if (trackId) where.trackId = trackId;
    if (entityType) where.entityType = entityType;
    if (actionType) where.actionType = actionType;
    if (actorId) where.actorId = actorId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, nameAr: true } },
          track: { select: { id: true, nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
