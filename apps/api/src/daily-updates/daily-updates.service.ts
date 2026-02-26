import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateDailyUpdateDto, UpdateDailyUpdateDto } from './daily-updates.dto';
import { extname } from 'path';

const ALLOWED_EXTENSIONS = new Set([
  '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt',
  '.pdf', '.png', '.jpg', '.jpeg', '.webp',
  '.txt', '.csv', '.zip',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.js', '.sh', '.bat', '.dll', '.apk', '.cmd',
  '.com', '.msi', '.ps1', '.vbs', '.wsf', '.scr', '.pif',
]);

const ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/octet-stream', // fallback for some browsers
]);

@Injectable()
export class DailyUpdatesService {
  private readonly maxFileSize: number;
  private readonly maxFilesPerUpdate: number;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {
    this.maxFileSize = (config.get<number>('MAX_UPLOAD_MB', 25)) * 1024 * 1024;
    this.maxFilesPerUpdate = 10;
  }

  // ─── FILE VALIDATION ───

  validateFile(file: Express.Multer.File) {
    const ext = extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`نوع الملف غير مسموح: ${ext}`);
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`نوع الملف غير مدعوم: ${ext}. الأنواع المدعومة: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
    }
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`حجم الملف ${file.originalname} يتجاوز الحد الأقصى (${this.maxFileSize / 1024 / 1024} MB)`);
    }
  }

  // ─── CRUD ───

  async findAll(params: {
    page?: number;
    pageSize?: number;
    type?: string;
    trackId?: string;
    search?: string;
    pinned?: string;
    priority?: string;
    userId?: string;
  }) {
    const { page = 1, pageSize = 20, type, trackId, search, pinned, priority, userId } = params;
    const where: any = { isDeleted: false };
    if (type) where.type = type;
    if (trackId) where.trackId = trackId;
    if (pinned === 'true') where.pinned = true;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { titleAr: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { contentAr: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.dailyUpdate.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, nameAr: true, role: true } },
          track: { select: { id: true, name: true, nameAr: true, color: true } },
          fileAttachments: {
            select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
          },
          ...(userId ? { reads: { where: { userId }, select: { id: true } } } : {}),
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dailyUpdate.count({ where }),
    ]);

    // Add isRead flag
    const enriched = data.map((item: any) => {
      const { reads, ...rest } = item;
      return { ...rest, isRead: reads ? reads.length > 0 : false };
    });

    // Count unread for this user
    let unreadCount = 0;
    if (userId) {
      const totalUpdates = await this.prisma.dailyUpdate.count({ where: { isDeleted: false } });
      const readCount = await this.prisma.dailyUpdateRead.count({ where: { userId } });
      unreadCount = Math.max(0, totalUpdates - readCount);
    }

    return { data: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize), unreadCount };
  }

  async findById(id: string) {
    const update = await this.prisma.dailyUpdate.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, nameAr: true, role: true } },
        track: { select: { id: true, name: true, nameAr: true, color: true } },
        fileAttachments: {
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
    if (!update || update.isDeleted) throw new NotFoundException('التحديث غير موجود');
    return update;
  }

  async create(dto: CreateDailyUpdateDto, authorId: string, files?: Express.Multer.File[]) {
    // Validate file count
    if (files && files.length > this.maxFilesPerUpdate) {
      throw new BadRequestException(`الحد الأقصى ${this.maxFilesPerUpdate} ملفات لكل تحديث`);
    }

    // Validate each file
    if (files) {
      for (const file of files) {
        this.validateFile(file);
      }
    }

    // Create the update
    const update = await this.prisma.dailyUpdate.create({
      data: {
        title: dto.title,
        titleAr: dto.titleAr,
        content: dto.content,
        contentAr: dto.contentAr,
        type: dto.type,
        status: dto.status,
        progress: dto.progress,
        trackId: dto.trackId,
        pinned: dto.pinned,
        priority: dto.priority,
        authorId,
      } as any,
    });

    // Upload and store attachments
    if (files && files.length > 0) {
      for (const file of files) {
        const stored = await this.storage.upload(file);
        await this.prisma.dailyUpdateAttachment.create({
          data: {
            updateId: update.id,
            originalName: file.originalname,
            storedName: stored.storedName,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storageProvider: stored.storageProvider,
            storagePath: stored.storagePath,
            uploadedById: authorId,
          },
        });
      }
    }

    // Return full update with relations
    return this.findById(update.id);
  }

  async update(id: string, dto: UpdateDailyUpdateDto, userId: string, userRole: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new NotFoundException('التحديث غير موجود');

    if (existing.authorId !== userId && !['admin', 'pm'].includes(userRole)) {
      throw new ForbiddenException('لا يمكنك تعديل هذا التحديث');
    }

    const editHistory = (existing.editHistory as any[]) || [];
    editHistory.push({
      editedBy: userId,
      editedAt: new Date().toISOString(),
      previousTitle: existing.titleAr,
      previousContent: existing.contentAr || existing.content,
    });

    return this.prisma.dailyUpdate.update({
      where: { id },
      data: {
        ...dto,
        editHistory,
      } as any,
      include: {
        author: { select: { id: true, name: true, nameAr: true, role: true } },
        track: { select: { id: true, name: true, nameAr: true, color: true } },
        fileAttachments: {
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
  }

  async delete(id: string, userId: string, userRole: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التحديث غير موجود');

    if (existing.authorId !== userId && !['admin', 'pm'].includes(userRole)) {
      throw new ForbiddenException('لا يمكنك حذف هذا التحديث');
    }

    // Soft delete (attachments remain but are inaccessible through the update)
    await this.prisma.dailyUpdate.update({
      where: { id },
      data: { isDeleted: true },
    });
    return { message: 'تم حذف التحديث' };
  }

  // ─── ATTACHMENTS ───

  async addAttachments(updateId: string, files: Express.Multer.File[], uploaderId: string) {
    const update = await this.prisma.dailyUpdate.findUnique({
      where: { id: updateId },
      include: { fileAttachments: { select: { id: true } } },
    });
    if (!update || update.isDeleted) throw new NotFoundException('التحديث غير موجود');

    const existingCount = (update as any).fileAttachments?.length || 0;
    if (existingCount + files.length > this.maxFilesPerUpdate) {
      throw new BadRequestException(`الحد الأقصى ${this.maxFilesPerUpdate} ملفات لكل تحديث. الموجود: ${existingCount}`);
    }

    for (const file of files) {
      this.validateFile(file);
    }

    const attachments: any[] = [];
    for (const file of files) {
      const stored = await this.storage.upload(file);
      const att = await this.prisma.dailyUpdateAttachment.create({
        data: {
          updateId,
          originalName: file.originalname,
          storedName: stored.storedName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageProvider: stored.storageProvider,
          storagePath: stored.storagePath,
          uploadedById: uploaderId,
        },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      });
      attachments.push(att);
    }
    return attachments;
  }

  async getAttachment(attachmentId: string) {
    const att = await this.prisma.dailyUpdateAttachment.findUnique({
      where: { id: attachmentId },
      include: { update: { select: { isDeleted: true } } },
    });
    if (!att || att.update.isDeleted) throw new NotFoundException('المرفق غير موجود');
    return att;
  }

  async getAttachmentStream(attachmentId: string) {
    const att = await this.getAttachment(attachmentId);
    const stream = await this.storage.getStream(att.storagePath, att.storageProvider);
    return { stream, attachment: att };
  }

  async deleteAttachment(attachmentId: string) {
    const att = await this.prisma.dailyUpdateAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) throw new NotFoundException('المرفق غير موجود');

    await this.storage.delete(att.storagePath, att.storageProvider);
    await this.prisma.dailyUpdateAttachment.delete({ where: { id: attachmentId } });
    return { message: 'تم حذف المرفق' };
  }

  // ─── READ TRACKING ───

  async markAsRead(updateId: string, userId: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id: updateId } });
    if (!existing || existing.isDeleted) throw new NotFoundException('التحديث غير موجود');

    await this.prisma.dailyUpdateRead.upsert({
      where: { updateId_userId: { updateId, userId } },
      create: { updateId, userId },
      update: {},
    });
    return { success: true };
  }

  async markAllAsRead(userId: string) {
    const unreadUpdates = await this.prisma.dailyUpdate.findMany({
      where: {
        isDeleted: false,
        NOT: { reads: { some: { userId } } },
      },
      select: { id: true },
    });

    if (unreadUpdates.length > 0) {
      await this.prisma.dailyUpdateRead.createMany({
        data: unreadUpdates.map((u) => ({ updateId: u.id, userId })),
        skipDuplicates: true,
      });
    }
    return { success: true, marked: unreadUpdates.length };
  }

  async getUnreadCount(userId: string) {
    const totalUpdates = await this.prisma.dailyUpdate.count({ where: { isDeleted: false } });
    const readCount = await this.prisma.dailyUpdateRead.count({ where: { userId } });
    return { unreadCount: Math.max(0, totalUpdates - readCount) };
  }

  async togglePin(id: string) {
    const existing = await this.prisma.dailyUpdate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التحديث غير موجود');

    return this.prisma.dailyUpdate.update({
      where: { id },
      data: { pinned: !existing.pinned },
      include: {
        author: { select: { id: true, name: true, nameAr: true, role: true } },
        track: { select: { id: true, name: true, nameAr: true, color: true } },
        fileAttachments: {
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
  }
}
