import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildSkipTake } from '../common/utils/pagination.util';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private readonly authorSelect = {
    id: true,
    name: true,
    nameAr: true,
    email: true,
    role: true,
  };

  async findByEntity(entityType: string, entityId: string, params: { page: number; pageSize: number }) {
    const { page, pageSize } = params;
    const { skip, take } = buildSkipTake(page, pageSize);
    const where = { entityType, entityId, parentId: null };

    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          author: { select: this.authorSelect },
          replies: {
            include: {
              author: { select: this.authorSelect },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async countByEntity(entityType: string, entityId: string) {
    return this.prisma.comment.count({ where: { entityType, entityId } });
  }

  async create(data: {
    entityType: string;
    entityId: string;
    parentId?: string;
    authorId: string;
    body: string;
    mentions?: string[];
  }) {
    // Extract @mentions from body text
    const mentionMatches = data.body.match(/@(\w+)/g);
    const mentions = data.mentions ?? (mentionMatches ? mentionMatches.map((m) => m.slice(1)) : []);

    const comment = await this.prisma.comment.create({
      data: {
        entityType: data.entityType,
        entityId: data.entityId,
        parentId: data.parentId ?? null,
        authorId: data.authorId,
        body: data.body,
        mentions,
      },
      include: {
        author: { select: this.authorSelect },
      },
    });

    await this.audit.log({
      actorId: data.authorId,
      actionType: 'create',
      entityType: 'comment',
      entityId: comment.id,
      afterData: comment as any,
    });

    return comment;
  }

  async update(id: string, userId: string, body: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    if (comment.authorId !== userId) throw new ForbiddenException('لا يمكنك تعديل تعليق مستخدم آخر');

    return this.prisma.comment.update({
      where: { id },
      data: { body, isEdited: true },
      include: {
        author: { select: this.authorSelect },
      },
    });
  }

  async delete(id: string, userId: string, role: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    if (comment.authorId !== userId && role !== 'admin') {
      throw new ForbiddenException('لا يمكنك حذف تعليق مستخدم آخر');
    }

    await this.prisma.comment.delete({ where: { id } });

    await this.audit.log({
      actorId: userId,
      actionType: 'delete',
      entityType: 'comment',
      entityId: id,
      beforeData: comment as any,
    });

    return { message: 'تم حذف التعليق' };
  }
}
