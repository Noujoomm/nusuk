import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../storage/storage.service';
import { extname } from 'path';
import { fixMulterFilename } from '../common/fix-filename';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const BLOCKED_EXTENSIONS = ['.exe', '.js', '.sh', '.bat', '.dll', '.apk', '.cmd', '.com', '.msi', '.ps1', '.vbs', '.wsf', '.scr', '.pif'];

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp',
  '.txt', '.csv', '.rtf', '.zip', '.rar', '.7z',
  '.mp4', '.mp3', '.wav', '.avi', '.mov',
];

const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'text/plain', 'text/csv', 'application/rtf',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'video/mp4', 'audio/mpeg', 'audio/wav', 'video/x-msvideo', 'video/quicktime',
  'application/octet-stream',
];

const MAX_SINGLE_FILE_SIZE = 500 * 1024 * 1024; // 500MB - no practical limit

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  private readonly attachmentSelect = {
    id: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    createdAt: true,
  };

  async findAll(params: {
    page?: number;
    pageSize?: number;
    trackId?: string;
    type?: string;
    authorId?: string;
  }) {
    const { page = 1, pageSize = 25, trackId, type, authorId } = params;
    const where: any = {};
    if (trackId) where.trackId = trackId;
    if (type) where.type = type;
    if (authorId) where.authorId = authorId;

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, nameAr: true } },
          track: { select: { id: true, nameAr: true, color: true } },
          attachments: { select: this.attachmentSelect, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { reportDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findById(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, nameAr: true } },
        track: { select: { id: true, nameAr: true, color: true } },
        attachments: { select: this.attachmentSelect, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!report) throw new NotFoundException('التقرير غير موجود');
    return report;
  }

  /** Only allow known Report scalar fields — prevents Prisma "Unknown arg" errors */
  private sanitizeReportData(data: Record<string, any>): Record<string, any> {
    const ALLOWED = new Set([
      'trackId', 'authorId', 'type', 'title', 'achievements',
      'kpiUpdates', 'challenges', 'supportNeeded', 'upcomingTasks',
      'notes', 'reportDate', 'aiSummary',
    ]);
    const safe: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (ALLOWED.has(k) && v !== undefined) safe[k] = v;
    }
    return safe;
  }

  async create(data: Record<string, any>) {
    const safe = this.sanitizeReportData(data);
    const aiSummary = this.generateAISummary(data);

    return this.prisma.report.create({
      data: {
        trackId: safe.trackId,
        authorId: safe.authorId,
        type: safe.type || 'daily',
        title: safe.title || '',
        achievements: safe.achievements,
        kpiUpdates: safe.kpiUpdates,
        challenges: safe.challenges,
        supportNeeded: safe.supportNeeded,
        upcomingTasks: safe.upcomingTasks,
        notes: safe.notes,
        reportDate: data.reportDate ? new Date(data.reportDate) : new Date(),
        aiSummary,
      },
      include: {
        author: { select: { id: true, name: true, nameAr: true } },
        track: { select: { id: true, nameAr: true, color: true } },
        attachments: { select: this.attachmentSelect },
      },
    });
  }

  async update(id: string, data: Record<string, any>) {
    await this.findById(id);
    const safe = this.sanitizeReportData(data);
    const aiSummary = this.generateAISummary(data);
    if (safe.reportDate && typeof safe.reportDate === 'string') {
      safe.reportDate = new Date(safe.reportDate);
    }
    return this.prisma.report.update({
      where: { id },
      data: { ...safe, aiSummary },
      include: {
        attachments: { select: this.attachmentSelect },
      },
    });
  }

  async delete(id: string) {
    // Delete attachment files from storage first
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!report) throw new NotFoundException('التقرير غير موجود');

    for (const att of report.attachments) {
      if (att.storageProvider === 'LOCAL') {
        await this.storage.delete(att.storagePath, att.storageProvider).catch(() => {});
      }
    }

    await this.prisma.report.delete({ where: { id } });
    return { message: 'تم حذف التقرير' };
  }

  async getStats() {
    const [total, byType, byTrack] = await Promise.all([
      this.prisma.report.count(),
      this.prisma.report.groupBy({ by: ['type'], _count: true }),
      this.prisma.report.groupBy({ by: ['trackId'], _count: true }),
    ]);

    return {
      total,
      byType: byType.reduce((acc, r) => ({ ...acc, [r.type]: r._count }), {}),
      trackCount: byTrack.length,
    };
  }

  // ─── ATTACHMENTS ───

  private validateFile(file: Express.Multer.File) {
    fixMulterFilename(file);

    // Check empty file
    if (!file.size || file.size === 0) {
      this.logger.warn(`Empty file rejected: ${file.originalname}`);
      throw new BadRequestException(`الملف فارغ: ${file.originalname}`);
    }

    // 3. Check file size
    if (file.size > MAX_SINGLE_FILE_SIZE) {
      this.logger.warn(`File too large: ${file.originalname} (${file.size} bytes)`);
      throw new BadRequestException(`حجم الملف كبير جداً (الحد الأقصى 100MB): ${file.originalname}`);
    }

    // 4. Check blocked extensions
    const ext = extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      this.logger.warn(`Blocked extension: ${ext} for file ${file.originalname}`);
      throw new BadRequestException(`نوع الملف غير مسموح: ${ext}`);
    }

    // 5. Check allowed extensions (if extension exists)
    if (ext && ext !== '.' && !ALLOWED_EXTENSIONS.includes(ext)) {
      this.logger.warn(`Unsupported extension: ${ext} for file ${file.originalname}`);
      throw new BadRequestException(`نوع الملف غير مدعوم (${ext}). الأنواع المدعومة: PDF, Word, Excel, صور, ZIP`);
    }

    // 6. Validate MIME type
    if (file.mimetype && !ALLOWED_MIMES.includes(file.mimetype)) {
      this.logger.warn(`Invalid MIME type: ${file.mimetype} for file ${file.originalname}`);
      throw new BadRequestException(`نوع الملف غير مدعوم: ${file.originalname}`);
    }

    // 7. Verify temp file exists and is readable
    if (file.path) {
      try {
        const stat = fs.statSync(file.path);
        if (stat.size === 0) {
          throw new BadRequestException(`الملف تالف أو فارغ: ${file.originalname}`);
        }
      } catch (e: any) {
        if (e instanceof BadRequestException) throw e;
        this.logger.error(`Cannot read temp file: ${file.path}`, e.message);
        throw new BadRequestException(`الملف تالف أو غير قابل للقراءة: ${file.originalname}`);
      }
    }
  }

  async addAttachments(reportId: string, files: Express.Multer.File[], uploaderId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('التقرير غير موجود');

    // Check for duplicate filenames within this report
    const existing = await this.prisma.reportAttachment.findMany({
      where: { reportId },
      select: { originalName: true },
    });
    const existingNames = new Set(existing.map((a) => a.originalName));

    // Validate all files first before uploading any
    for (const file of files) {
      this.validateFile(file);
    }

    // Deduplicate within the batch
    const seenNames = new Set<string>();
    const uniqueFiles: Express.Multer.File[] = [];
    for (const file of files) {
      const name = file.originalname;
      if (seenNames.has(name) || existingNames.has(name)) {
        this.logger.warn(`Duplicate file skipped: ${name} for report ${reportId}`);
        continue;
      }
      seenNames.add(name);
      uniqueFiles.push(file);
    }

    if (uniqueFiles.length === 0) {
      throw new BadRequestException('جميع الملفات المرفقة موجودة مسبقاً في التقرير');
    }

    const attachments: any[] = [];
    const failed: string[] = [];

    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk

    for (const file of uniqueFiles) {
      try {
        // Read file data from temp
        let rawBuffer: Buffer;
        if (file.path) {
          rawBuffer = fs.readFileSync(file.path);
          try { fs.unlinkSync(file.path); } catch {}
        } else if (file.buffer) {
          rawBuffer = file.buffer;
        } else {
          throw new Error('لا يمكن قراءة محتوى الملف');
        }

        const storedName = `${require('crypto').randomUUID()}${extname(file.originalname).toLowerCase()}`;
        const totalChunks = Math.ceil(rawBuffer.length / CHUNK_SIZE);
        this.logger.log(`Upload started: "${file.originalname}" (${rawBuffer.length} bytes, ${totalChunks} chunks)`);

        // Create attachment record immediately
        const att = await this.prisma.reportAttachment.create({
          data: {
            reportId,
            originalName: file.originalname,
            storedName,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storageProvider: 'DB_CHUNKED',
            storagePath: `db://${reportId}/${storedName}`,
            uploadedById: uploaderId,
          },
          select: { ...this.attachmentSelect, id: true },
        });
        this.logger.log(`Attachment record created: ${att.id}`);

        // Store chunks in background (fire-and-forget) so response returns fast
        const attachmentId = att.id;
        const buffer = rawBuffer;
        this.storeChunksAsync(attachmentId, buffer, totalChunks, CHUNK_SIZE, file.originalname).catch((e) => {
          this.logger.error(`Background chunk storage failed for "${file.originalname}": ${e.message}`);
        });

        attachments.push(att);
      } catch (e: any) {
        this.logger.error(`Failed to upload file "${file.originalname}": ${e.message}`);
        failed.push(file.originalname);
        if (file.path) {
          try { fs.unlinkSync(file.path); } catch {}
        }
      }
    }

    if (attachments.length === 0 && failed.length > 0) {
      throw new InternalServerErrorException(`فشل رفع جميع الملفات: ${failed.join(', ')}`);
    }

    this.logger.log(`Response sent: ${attachments.length} attachments for report ${reportId}`);
    return { attachments, failed };
  }

  private async storeChunksAsync(
    attachmentId: string,
    buffer: Buffer,
    totalChunks: number,
    chunkSize: number,
    fileName: string,
  ) {
    this.logger.log(`Chunk storage started: "${fileName}" (${totalChunks} chunks)`);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, buffer.length);
      const chunk = buffer.subarray(start, end);
      await this.prisma.reportFileChunk.create({
        data: {
          attachmentId,
          chunkIndex: i,
          data: new Uint8Array(chunk),
        },
      });
    }
    this.logger.log(`Chunk storage completed: "${fileName}" (${totalChunks} chunks stored)`);
  }

  async getAttachment(attachmentId: string) {
    const att = await this.prisma.reportAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!att) throw new NotFoundException('المرفق غير موجود');
    return att;
  }

  async getAttachmentBuffer(attachmentId: string): Promise<{ buffer: Buffer; attachment: any }> {
    this.logger.log(`Download request for attachment: ${attachmentId}`);

    const att = await this.prisma.reportAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, storageProvider: true, storagePath: true, fileData: true },
    });

    if (!att) {
      this.logger.warn(`Attachment not found in DB: ${attachmentId}`);
      throw new NotFoundException('المرفق غير موجود');
    }

    this.logger.log(`Attachment found: ${att.originalName} | provider: ${att.storageProvider} | hasData: ${!!att.fileData}`);

    // Chunked DB storage — reassemble from chunks
    if (att.storageProvider === 'DB_CHUNKED') {
      const expectedChunks = Math.ceil(att.sizeBytes / (2 * 1024 * 1024));
      const chunks = await this.prisma.reportFileChunk.findMany({
        where: { attachmentId: att.id },
        orderBy: { chunkIndex: 'asc' },
        select: { data: true },
      });
      if (chunks.length === 0) {
        throw new BadRequestException('الملف لا يزال قيد المعالجة، حاول مرة أخرى بعد لحظات');
      }
      if (chunks.length < expectedChunks) {
        this.logger.warn(`Incomplete chunks: ${chunks.length}/${expectedChunks} for ${att.originalName}`);
        throw new BadRequestException(`الملف لا يزال قيد المعالجة (${Math.round(chunks.length / expectedChunks * 100)}%)، حاول مرة أخرى`);
      }
      const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c.data)));
      this.logger.log(`Serving chunked: ${att.originalName} (${chunks.length} chunks, ${buffer.length} bytes)`);
      return { buffer, attachment: att };
    }

    // Old DB storage (single row) — gzip compressed or raw
    if (att.fileData) {
      let buffer = Buffer.from(att.fileData);
      if (att.storageProvider === 'DB_GZ') {
        buffer = Buffer.from(await gunzip(buffer));
      }
      this.logger.log(`Serving from DB: ${att.originalName} (${buffer.length} bytes)`);
      return { buffer, attachment: att };
    }

    // Fallback: try filesystem for old LOCAL files
    if (att.storageProvider === 'LOCAL' && att.storagePath) {
      try {
        if (fs.existsSync(att.storagePath)) {
          const buffer = fs.readFileSync(att.storagePath);
          this.logger.log(`Serving from filesystem: ${att.storagePath} (${buffer.length} bytes)`);
          return { buffer, attachment: att };
        }
      } catch (e: any) {
        this.logger.error(`Filesystem read failed: ${att.storagePath} - ${e.message}`);
      }
    }

    this.logger.warn(`File not found for attachment ${attachmentId}: provider=${att.storageProvider}, path=${att.storagePath}`);
    throw new NotFoundException('الملف غير موجود على الخادم. قد يكون حُذف أثناء تحديث النظام.');
  }

  async deleteAttachment(attachmentId: string) {
    const att = await this.prisma.reportAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) throw new NotFoundException('المرفق غير موجود');

    // Only delete from filesystem if LOCAL provider
    if (att.storageProvider === 'LOCAL') {
      await this.storage.delete(att.storagePath, att.storageProvider).catch(() => {});
    }
    await this.prisma.reportAttachment.delete({ where: { id: attachmentId } });
    this.logger.log(`Deleted attachment ${attachmentId} from report ${att.reportId}`);
    return { message: 'تم حذف المرفق' };
  }

  // ─── AI SUMMARY ───

  private generateAISummary(data: any): string {
    const parts: string[] = [];
    if (data.achievements) {
      const achievementCount = data.achievements.split('\n').filter((l: string) => l.trim()).length;
      parts.push(`تم تسجيل ${achievementCount} إنجاز`);
    }
    if (data.challenges) {
      const challengeCount = data.challenges.split('\n').filter((l: string) => l.trim()).length;
      parts.push(`${challengeCount} تحدي مسجل يحتاج متابعة`);
    }
    if (data.supportNeeded) {
      parts.push('يوجد طلبات دعم تحتاج مراجعة');
    }
    if (data.kpiUpdates) {
      parts.push('تم تحديث مؤشرات الأداء');
    }
    if (data.upcomingTasks) {
      const taskCount = data.upcomingTasks.split('\n').filter((l: string) => l.trim()).length;
      parts.push(`${taskCount} مهمة قادمة مخطط لها`);
    }
    return parts.length > 0
      ? `ملخص تلقائي: ${parts.join(' · ')}`
      : 'لا يوجد ملخص متاح';
  }
}
