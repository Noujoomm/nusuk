import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { extname } from 'path';
import * as fs from 'fs';
import { PrismaService } from '../common/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { fixMulterFilename } from '../common/fix-filename';
import {
  CreateIntelligenceSessionDto,
  OutputMode,
  UpdateIntelligenceSessionDto,
} from './reports-intelligence.dto';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildSectionRegeneratePrompt,
  NormalizedReport,
  reportToBlock,
  sectionsFor,
  SECTION_KEYS,
  SECTION_TITLES_AR,
  SectionKey,
} from './ai-prompt';
import {
  exportSession,
  ExportFormat,
  SessionExportInput,
} from './exporters';

// Same safe extensions as report attachments.
const BLOCKED_EXTENSIONS = [
  '.exe', '.js', '.sh', '.bat', '.dll', '.apk', '.cmd',
  '.com', '.msi', '.ps1', '.vbs', '.wsf', '.scr', '.pif',
];
const ALLOWED_TEMPLATE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.rtf', '.md',
];
const MAX_TEMPLATE_SIZE = 50 * 1024 * 1024; // 50 MB
const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB, matches ReportFileChunk

const OUTPUT_MODE_LABELS: Record<OutputMode, string> = {
  [OutputMode.executive_summary]: 'ملخص تنفيذي',
  [OutputMode.detailed]: 'تقرير مفصل',
  [OutputMode.track_by_track]: 'ملخص حسب المسارات',
  [OutputMode.template_prep]: 'تحضير للقالب',
  [OutputMode.custom]: 'مخصص',
};

@Injectable()
export class ReportsIntelligenceService {
  private readonly logger = new Logger(ReportsIntelligenceService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
  ) {}

  // ─── Session lifecycle ────────────────────────────────────────────────

  /**
   * Create a session and run the AI pipeline synchronously. Frontend shows
   * a loading state and gets the full result in one response. If the
   * generation fails, the session is still persisted with status='failed'
   * so the user can retry.
   */
  async createSession(dto: CreateIntelligenceSessionDto, userId: string) {
    const reports = await this.collectReports(dto);
    const sources = this.normalize(reports, !!dto.excludeEmpty);

    // If a templateId was provided, verify it exists.
    if (dto.templateId) {
      const tpl = await this.prisma.intelligenceTemplate.findUnique({
        where: { id: dto.templateId },
        select: { id: true },
      });
      if (!tpl) throw new BadRequestException('القالب المرفق غير موجود');
    }

    const session = await this.prisma.intelligenceSession.create({
      data: {
        createdById: userId,
        filters: (dto as unknown) as any,
        outputMode: dto.outputMode,
        customInstructions: dto.customInstructions ?? null,
        sourceReportIds: sources.map((s) => s.id),
        sourceReportCount: sources.length,
        status: 'generating',
        templateId: dto.templateId ?? null,
      },
    });

    try {
      const generated = await this.runGeneration(
        dto.outputMode,
        sources,
        dto.customInstructions,
      );
      return await this.prisma.intelligenceSession.update({
        where: { id: session.id },
        data: {
          generatedContent: generated.content as any,
          modelUsed: generated.modelUsed,
          status: 'ready',
        },
        include: { template: true },
      });
    } catch (e: any) {
      this.logger.error(`Generation failed for ${session.id}: ${e.message}`);
      return await this.prisma.intelligenceSession.update({
        where: { id: session.id },
        data: {
          status: 'failed',
          errorMessage: e.message?.slice(0, 2000) ?? 'Unknown error',
        },
      });
    }
  }

  async listMine(userId: string, params: { page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));
    const [data, total] = await Promise.all([
      this.prisma.intelligenceSession.findMany({
        where: { createdById: userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          template: { select: { id: true, originalName: true, mimeType: true } },
        },
      }),
      this.prisma.intelligenceSession.count({ where: { createdById: userId } }),
    ]);
    return { data, total, page, pageSize };
  }

  async findById(id: string, userId: string) {
    const session = await this.prisma.intelligenceSession.findUnique({
      where: { id },
      include: {
        template: {
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
        },
        createdBy: { select: { id: true, nameAr: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (session.createdById !== userId) {
      // Session data is executive-level; lock down cross-user access even for admins.
      throw new ForbiddenException('لا يمكنك الوصول إلى جلسة مستخدم آخر');
    }
    return session;
  }

  async updateEdited(
    id: string,
    userId: string,
    dto: UpdateIntelligenceSessionDto,
  ) {
    await this.findById(id, userId); // auth check
    return this.prisma.intelligenceSession.update({
      where: { id },
      data: { editedContent: (dto.editedContent ?? null) as any },
      include: { template: true },
    });
  }

  async delete(id: string, userId: string) {
    await this.findById(id, userId);
    await this.prisma.intelligenceSession.delete({ where: { id } });
    return { message: 'تم حذف الجلسة' };
  }

  /**
   * Regenerate the whole document, or a single named section in place.
   * When a single section regenerates, other sections stay untouched.
   */
  async regenerate(id: string, userId: string, section?: string) {
    const session = await this.findById(id, userId);
    const reports = await this.collectReports(session.filters as any);
    const filters = session.filters as any;
    const sources = this.normalize(reports, !!filters?.excludeEmpty);

    if (!section) {
      try {
        const generated = await this.runGeneration(
          session.outputMode as OutputMode,
          sources,
          session.customInstructions ?? undefined,
        );
        return await this.prisma.intelligenceSession.update({
          where: { id },
          data: {
            generatedContent: generated.content as any,
            modelUsed: generated.modelUsed,
            status: 'ready',
            errorMessage: null,
          },
          include: { template: true },
        });
      } catch (e: any) {
        return await this.prisma.intelligenceSession.update({
          where: { id },
          data: {
            status: 'failed',
            errorMessage: e.message?.slice(0, 2000) ?? 'Unknown error',
          },
        });
      }
    }

    if (!SECTION_KEYS.includes(section as SectionKey)) {
      throw new BadRequestException('القسم غير معروف');
    }

    const current =
      ((session.editedContent as any)?.sections ??
        (session.generatedContent as any)?.sections ??
        []) as Array<{ key: string; body: string }>;
    const currentBody = current.find((s) => s.key === section)?.body ?? '';

    const blocks = sources.map(reportToBlock);
    const prompts = buildSectionRegeneratePrompt(
      section as SectionKey,
      currentBody,
      session.outputMode as OutputMode,
      blocks,
    );

    const raw = await this.openai.chat(
      [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user },
      ],
      { temperature: 0.3, maxTokens: 1500 },
    );
    const parsed = this.parseJsonLoosely<{ section: string; body: string }>(raw);
    const newBody = (parsed?.body ?? '').trim();

    const nextSections = sectionsFor(session.outputMode as OutputMode).map(
      (key) => {
        const fromCurrent = current.find((s) => s.key === key);
        if (key === section) return { key, body: newBody };
        return fromCurrent ?? { key, body: '' };
      },
    );

    return await this.prisma.intelligenceSession.update({
      where: { id },
      data: {
        generatedContent: { sections: nextSections } as any,
        status: 'ready',
      },
      include: { template: true },
    });
  }

  // ─── Template upload ──────────────────────────────────────────────────

  async uploadTemplate(file: Express.Multer.File, uploaderId: string) {
    if (!file) throw new BadRequestException('لم يتم اختيار ملف');
    fixMulterFilename(file);

    const ext = extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(`نوع الملف غير مسموح: ${ext}`);
    }
    if (ext && !ALLOWED_TEMPLATE_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `نوع القالب غير مدعوم (${ext}). الأنواع المدعومة: PDF, Word, Excel, PowerPoint, TXT`,
      );
    }
    if (!file.size || file.size === 0) {
      throw new BadRequestException('الملف فارغ');
    }
    if (file.size > MAX_TEMPLATE_SIZE) {
      throw new BadRequestException('حجم القالب يتجاوز الحد الأقصى (50MB)');
    }

    // Read buffer; clean up temp file.
    let buffer: Buffer;
    if (file.path) {
      buffer = fs.readFileSync(file.path);
      try { fs.unlinkSync(file.path); } catch { /* best-effort */ }
    } else if (file.buffer) {
      buffer = file.buffer;
    } else {
      throw new BadRequestException('لا يمكن قراءة محتوى الملف');
    }

    const storedName = `${require('crypto').randomUUID()}${ext}`;
    const template = await this.prisma.intelligenceTemplate.create({
      data: {
        uploadedById: uploaderId,
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        storageProvider: 'DB_CHUNKED',
      },
    });

    // Write chunks synchronously — templates are small (<50MB).
    const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.length);
      await this.prisma.intelligenceTemplateChunk.create({
        data: {
          templateId: template.id,
          chunkIndex: i,
          data: new Uint8Array(buffer.subarray(start, end)),
        },
      });
    }

    return {
      id: template.id,
      originalName: template.originalName,
      mimeType: template.mimeType,
      sizeBytes: template.sizeBytes,
      createdAt: template.createdAt,
    };
  }

  async downloadTemplate(templateId: string) {
    const tpl = await this.prisma.intelligenceTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
      },
    });
    if (!tpl) throw new NotFoundException('القالب غير موجود');

    const chunks = await this.prisma.intelligenceTemplateChunk.findMany({
      where: { templateId: tpl.id },
      orderBy: { chunkIndex: 'asc' },
      select: { data: true },
    });
    if (chunks.length === 0) {
      throw new BadRequestException('محتوى القالب غير متوفر');
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c.data)));
    return { buffer, template: tpl };
  }

  // ─── Export ───────────────────────────────────────────────────────────

  async export(sessionId: string, userId: string, format: ExportFormat) {
    const session = await this.findById(sessionId, userId);
    const sections =
      ((session.editedContent as any)?.sections ??
        (session.generatedContent as any)?.sections ??
        []) as Array<{ key: string; body: string }>;
    if (!sections.length) {
      throw new BadRequestException('لا يوجد محتوى قابل للتصدير بعد');
    }

    const input: SessionExportInput = {
      title: this.titleFor(session),
      createdAtIso: new Date(session.createdAt).toISOString(),
      createdByName: (session as any).createdBy?.nameAr || (session as any).createdBy?.name,
      outputModeAr: OUTPUT_MODE_LABELS[session.outputMode as OutputMode] ?? session.outputMode,
      filtersSummaryAr: this.describeFilters(session.filters as any),
      sections,
    };
    return await exportSession(format, input);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async collectReports(filters: any) {
    const where: any = {};
    if (filters?.dateFrom || filters?.dateTo) {
      where.reportDate = {};
      if (filters.dateFrom) where.reportDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.reportDate.lte = new Date(filters.dateTo);
    }
    if (filters?.trackIds?.length) {
      where.trackId = { in: filters.trackIds };
    }
    if (filters?.reportTypes?.length) {
      where.type = { in: filters.reportTypes };
    }

    return this.prisma.report.findMany({
      where,
      orderBy: [{ reportDate: 'desc' }],
      include: {
        track: { select: { id: true, nameAr: true, name: true } },
        author: { select: { id: true, nameAr: true, name: true } },
      },
      take: 500, // hard cap to protect the prompt budget
    });
  }

  private normalize(
    reports: Array<any>,
    excludeEmpty: boolean,
  ): NormalizedReport[] {
    const out: NormalizedReport[] = [];
    for (const r of reports) {
      const n: NormalizedReport = {
        id: r.id,
        trackName: r.track?.nameAr || r.track?.name || '—',
        type: r.type,
        dateIso: (r.reportDate instanceof Date
          ? r.reportDate.toISOString()
          : String(r.reportDate)) as string,
        title: r.title || '',
        achievements: clean(r.achievements),
        kpiUpdates: clean(r.kpiUpdates),
        challenges: clean(r.challenges),
        supportNeeded: clean(r.supportNeeded),
        upcomingTasks: clean(r.upcomingTasks),
        notes: clean(r.notes),
        authorNameAr: r.author?.nameAr || r.author?.name || undefined,
      };
      if (
        excludeEmpty &&
        !n.achievements &&
        !n.kpiUpdates &&
        !n.challenges &&
        !n.supportNeeded &&
        !n.upcomingTasks &&
        !n.notes
      ) {
        continue;
      }
      out.push(n);
    }
    return out;
  }

  private async runGeneration(
    mode: OutputMode,
    sources: NormalizedReport[],
    customInstructions?: string,
  ): Promise<{ content: { sections: Array<{ key: string; body: string }> }; modelUsed: string }> {
    const system = buildSystemPrompt(mode, customInstructions);
    const blocks = sources.map(reportToBlock);
    const user = buildUserPrompt(blocks);

    const raw = await this.openai.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.35, maxTokens: 4000 },
    );

    const parsed =
      this.parseJsonLoosely<{ sections: Array<{ key: string; body: string }> }>(raw);
    const sections = this.coerceSections(parsed?.sections ?? [], mode);
    return {
      content: { sections },
      modelUsed: process.env.OPENAI_MODEL || 'gpt-4o',
    };
  }

  /** Tolerant JSON parser — models sometimes wrap output in code fences. */
  private parseJsonLoosely<T>(raw: string): T | null {
    if (!raw) return null;
    const stripped = raw
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    try {
      return JSON.parse(stripped) as T;
    } catch {
      // Fallback: find the first { and last } and retry.
      const first = stripped.indexOf('{');
      const last = stripped.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(stripped.slice(first, last + 1)) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /** Always return exactly the sections the mode requires, in order. */
  private coerceSections(
    got: Array<{ key?: string; body?: string }>,
    mode: OutputMode,
  ): Array<{ key: string; body: string }> {
    const byKey = new Map<string, string>();
    for (const s of got) {
      if (s && typeof s.key === 'string') {
        byKey.set(s.key, (s.body ?? '').toString());
      }
    }
    return sectionsFor(mode).map((key) => ({
      key,
      body: (byKey.get(key) ?? '').trim(),
    }));
  }

  private titleFor(session: { outputMode: string; createdAt: Date }): string {
    const label =
      OUTPUT_MODE_LABELS[session.outputMode as OutputMode] ?? session.outputMode;
    const d = new Date(session.createdAt).toISOString().slice(0, 10);
    return `مركز ذكاء التقارير — ${label} — ${d}`;
  }

  private describeFilters(f: any): string {
    if (!f) return 'جميع التقارير';
    const parts: string[] = [];
    if (f.dateFrom || f.dateTo) {
      parts.push(
        `الفترة: ${f.dateFrom?.slice(0, 10) ?? '—'} إلى ${f.dateTo?.slice(0, 10) ?? '—'}`,
      );
    }
    if (f.trackIds?.length) parts.push(`المسارات: ${f.trackIds.length}`);
    if (f.reportTypes?.length)
      parts.push(`الأنواع: ${f.reportTypes.join('، ')}`);
    if (f.excludeEmpty) parts.push('باستثناء التقارير الفارغة');
    return parts.length ? parts.join(' | ') : 'جميع التقارير';
  }
}

function clean(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}
