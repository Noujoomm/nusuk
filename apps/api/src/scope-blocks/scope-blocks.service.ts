import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateScopeBlockDto, UpdateScopeBlockDto, UpdateScopeBlockProgressDto, CreateScopeBlockUpdateDto } from './scope-blocks.dto';

@Injectable()
export class ScopeBlocksService {
  private readonly logger = new Logger(ScopeBlocksService.name);

  constructor(private prisma: PrismaService) {}

  async findByTrack(trackId: string) {
    const includeExtras = {
      attachments: { include: { uploadedBy: { select: { id: true, name: true, nameAr: true } } }, orderBy: { createdAt: 'desc' as const } },
      updates: { include: { createdBy: { select: { id: true, name: true, nameAr: true } } }, orderBy: { createdAt: 'desc' as const } },
    };
    return this.prisma.scopeBlock.findMany({
      where: { trackId, parentId: null },
      include: {
        ...includeExtras,
        children: {
          include: {
            ...includeExtras,
            children: { include: includeExtras },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.scopeBlock.findUnique({
      where: { id },
      include: {
        children: {
          include: {
            children: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  async create(data: CreateScopeBlockDto) {
    return this.prisma.scopeBlock.create({
      data: {
        trackId: data.trackId,
        code: data.code,
        title: data.title,
        content: data.content,
        parentId: data.parentId,
        orderIndex: data.orderIndex ?? 0,
        progress: data.progress ?? 0,
        status: data.status ?? 'pending',
      },
    });
  }

  async update(id: string, data: UpdateScopeBlockDto) {
    return this.prisma.scopeBlock.update({
      where: { id },
      data,
    });
  }

  async updateProgress(id: string, data: UpdateScopeBlockProgressDto) {
    const updateData: any = { progress: data.progress };
    if (data.status) updateData.status = data.status;

    const updated = await this.prisma.scopeBlock.update({
      where: { id },
      data: updateData,
    });

    // Propagate progress to parent
    if (updated.parentId) {
      await this.recalculateParentProgress(updated.parentId);
    }

    return updated;
  }

  private async recalculateParentProgress(parentId: string) {
    const children = await this.prisma.scopeBlock.findMany({
      where: { parentId },
      select: { progress: true },
    });

    if (children.length === 0) return;

    const avgProgress = children.reduce((sum, c) => sum + c.progress, 0) / children.length;

    const parent = await this.prisma.scopeBlock.update({
      where: { id: parentId },
      data: { progress: Math.round(avgProgress * 100) / 100 },
    });

    // Recursively propagate up
    if (parent.parentId) {
      await this.recalculateParentProgress(parent.parentId);
    }
  }

  async delete(id: string) {
    return this.prisma.scopeBlock.delete({
      where: { id },
    });
  }

  async importFromText(trackId: string, text: string) {
    const lines = text.split('\n');
    const codePattern = /^(\d+(?:\.\d+)*)\s+(.+)$/;

    interface ParsedBlock {
      code: string;
      title: string;
      content: string;
      depth: number;
    }

    const parsedBlocks: ParsedBlock[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(codePattern);
      if (match) {
        const code = match[1];
        const title = match[2].trim();
        const depth = code.split('.').length;
        parsedBlocks.push({ code, title, content: '', depth });
      } else if (parsedBlocks.length > 0) {
        // Content line belongs to the previous heading
        parsedBlocks[parsedBlocks.length - 1].content +=
          (parsedBlocks[parsedBlocks.length - 1].content ? '\n' : '') + trimmed;
      }
    }

    // Delete existing blocks for this track
    await this.prisma.scopeBlock.deleteMany({
      where: { trackId },
    });

    // Build hierarchy: determine parentId based on code depth
    // E.g., "1.7.1" is a child of "1.7", "1.7.1.1" is a child of "1.7.1"
    const codeToId = new Map<string, string>();

    for (let i = 0; i < parsedBlocks.length; i++) {
      const block = parsedBlocks[i];
      const codeParts = block.code.split('.');

      // Find parent code: for "1.7.1", parent is "1.7"
      let parentId: string | null = null;
      if (codeParts.length > 1) {
        const parentCode = codeParts.slice(0, -1).join('.');
        parentId = codeToId.get(parentCode) || null;
      }

      const created = await this.prisma.scopeBlock.create({
        data: {
          trackId,
          code: block.code,
          title: block.title,
          content: block.content || null,
          parentId,
          orderIndex: i,
          progress: 0,
          status: 'pending',
        },
      });

      codeToId.set(block.code, created.id);
    }

    return { count: parsedBlocks.length };
  }

  async getStats(trackId: string) {
    const blocks = await this.prisma.scopeBlock.findMany({
      where: { trackId },
      select: { progress: true, status: true },
    });

    const total = blocks.length;
    const avgProgress = total > 0
      ? Math.round((blocks.reduce((sum, b) => sum + b.progress, 0) / total) * 100) / 100
      : 0;

    const byStatus: Record<string, number> = {};
    for (const block of blocks) {
      byStatus[block.status] = (byStatus[block.status] || 0) + 1;
    }

    return { total, avgProgress, byStatus };
  }

  async reorderBlocks(blocks: Array<{ id: string; orderIndex: number }>) {
    const updates = blocks.map((b) =>
      this.prisma.scopeBlock.update({
        where: { id: b.id },
        data: { orderIndex: b.orderIndex },
      }),
    );

    await this.prisma.$transaction(updates);

    return { updated: blocks.length };
  }

  // ─── ATTACHMENTS ───

  async getAttachments(scopeBlockId: string) {
    return this.prisma.scopeBlockAttachment.findMany({
      where: { scopeBlockId },
      include: { uploadedBy: { select: { id: true, name: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addAttachment(data: { scopeBlockId: string; fileName: string; fileUrl: string; fileSize?: number; uploadedById: string }) {
    return this.prisma.scopeBlockAttachment.create({
      data,
      include: { uploadedBy: { select: { id: true, name: true, nameAr: true } } },
    });
  }

  async deleteAttachment(id: string) {
    return this.prisma.scopeBlockAttachment.delete({ where: { id } });
  }

  // ─── UPDATES ───

  async getUpdates(scopeBlockId: string) {
    return this.prisma.scopeBlockUpdate.findMany({
      where: { scopeBlockId },
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addUpdate(dto: CreateScopeBlockUpdateDto, userId: string) {
    return this.prisma.scopeBlockUpdate.create({
      data: {
        scopeBlockId: dto.scopeBlockId,
        content: dto.content,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, name: true, nameAr: true } } },
    });
  }

  async deleteUpdate(id: string) {
    return this.prisma.scopeBlockUpdate.delete({ where: { id } });
  }
}
