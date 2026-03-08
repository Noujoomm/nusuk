import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as JSZip from 'jszip';
import { PrismaService } from '../common/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { PptxParserService, PptxParseResult, SlideImage } from './pptx-parser.service';

export interface ExtractedUpdate {
  taskTitle: string;
  taskTitleAr?: string;
  status?: string;
  progress?: number;
  notes?: string;
  dueDate?: string;
  challenges?: string;
  matchedTaskId?: string;
  matchedTaskTitle?: string;
  confidence: 'high' | 'medium' | 'low';
  action: 'update' | 'create' | 'skip';
  slideNumber?: number;
  aiReason?: string;
}

export interface FileImportResult {
  format: string;
  extractedText: string;
  extractedUpdates: ExtractedUpdate[];
  trackName: string;
  trackId: string;
  aiAnalysis?: string;
  meta?: { totalSlides?: number; totalRows?: number; hasImages?: boolean; hasTables?: boolean };
}

export interface PptxImportResult {
  parsed: PptxParseResult;
  extractedUpdates: ExtractedUpdate[];
  trackName: string;
  trackId: string;
  aiAnalysis?: string;
}

export interface ApplyResult {
  updated: number;
  created: number;
  skipped: number;
  details: Array<{ taskTitle: string; action: string; success: boolean; error?: string }>;
}

@Injectable()
export class PptxImportService {
  private readonly logger = new Logger('PptxImportService');

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
    private pptxParser: PptxParserService,
  ) {}

  // ─── Universal File Extraction ───

  async extractFromFile(base64Content: string, trackId: string, fileName: string): Promise<FileImportResult> {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new BadRequestException('Track not found');

    const buffer = Buffer.from(base64Content, 'base64');
    const ext = (fileName.split('.').pop() || '').toLowerCase();

    // Detect format and extract text
    let extractedText = '';
    let format = ext;
    let meta: FileImportResult['meta'] = {};

    switch (ext) {
      case 'pptx': {
        const parsed = await this.pptxParser.parse(buffer);
        extractedText = parsed.fullText;
        meta = { totalSlides: parsed.totalSlides, hasImages: parsed.hasImages, hasTables: parsed.hasTables };

        // For PPTX, use the full multi-pass with images
        const existingTasks = await this.getExistingTasks(trackId);
        const taskList = this.buildTaskList(existingTasks);

        let extractedUpdates: ExtractedUpdate[];
        let aiAnalysis: string | undefined;

        if (this.openai.isAvailable) {
          const result = await this.aiExtractMultiPass(parsed, taskList, existingTasks, track);
          extractedUpdates = result.updates;
          aiAnalysis = result.summary;
        } else {
          extractedUpdates = this.heuristicExtract(parsed, existingTasks);
        }

        return { format: 'pptx', extractedText, extractedUpdates, trackName: track.nameAr || track.name, trackId, aiAnalysis, meta };
      }

      case 'xml': {
        extractedText = buffer.toString('utf-8');
        // Strip XML namespaces for readability
        extractedText = extractedText
          .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '')
          .replace(/<(\/?)\w+:/g, '<$1');
        format = 'xml';
        break;
      }

      case 'csv':
      case 'txt': {
        extractedText = buffer.toString('utf-8').replace(/^\uFEFF/, ''); // strip BOM
        const lines = extractedText.split('\n').filter(l => l.trim());
        meta = { totalRows: lines.length };
        format = ext;
        break;
      }

      case 'json': {
        extractedText = buffer.toString('utf-8');
        try {
          const parsed = JSON.parse(extractedText);
          extractedText = JSON.stringify(parsed, null, 2);
        } catch { /* keep raw */ }
        format = 'json';
        break;
      }

      case 'xlsx':
      case 'xls': {
        try {
          const ExcelJS = require('exceljs');
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          const lines: string[] = [];
          workbook.eachSheet((sheet: any) => {
            lines.push(`--- Sheet: ${sheet.name} ---`);
            sheet.eachRow((row: any, rowNum: number) => {
              const values = row.values?.slice(1) || []; // ExcelJS is 1-indexed
              lines.push(values.map((v: any) => v?.toString?.() || '').join(' | '));
            });
          });
          extractedText = lines.join('\n');
          meta = { totalRows: lines.length, hasTables: true };
        } catch (e) {
          this.logger.error('Excel parse failed', e);
          throw new BadRequestException('Failed to parse Excel file');
        }
        format = 'xlsx';
        break;
      }

      case 'docx': {
        try {
          const zip = await JSZip.loadAsync(buffer);
          const docXml = await zip.file('word/document.xml')?.async('text');
          if (docXml) {
            // Strip XML tags, keep text
            const clean = docXml
              .replace(/<\/?[a-zA-Z]+:/g, (m) => m.replace(/[a-zA-Z]+:/, ''))
              .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '');
            const texts: string[] = [];
            const paragraphs = clean.match(/<p[\s>][\s\S]*?<\/p>/g) || [];
            for (const p of paragraphs) {
              const tMatches = p.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
              const lineText = tMatches.map(t => t.replace(/<t[^>]*>([\s\S]*?)<\/t>/, '$1')).join('').trim();
              if (lineText) texts.push(lineText);
            }
            extractedText = texts.join('\n');
          }
        } catch (e) {
          this.logger.error('DOCX parse failed', e);
          throw new BadRequestException('Failed to parse Word file');
        }
        format = 'docx';
        break;
      }

      default:
        // For any other format, try reading as UTF-8 text
        try {
          extractedText = buffer.toString('utf-8');
        } catch {
          throw new BadRequestException(`Unsupported file format: .${ext}`);
        }
        format = ext || 'text';
    }

    // For non-PPTX formats: use AI to analyze the extracted text
    const existingTasks = await this.getExistingTasks(trackId);
    const taskList = this.buildTaskList(existingTasks);

    let extractedUpdates: ExtractedUpdate[];
    let aiAnalysis: string | undefined;

    if (this.openai.isAvailable) {
      const result = await this.aiExtractFromText(extractedText, format, taskList, existingTasks, track);
      extractedUpdates = result.updates;
      aiAnalysis = result.summary;
    } else {
      extractedUpdates = [];
    }

    return { format, extractedText, extractedUpdates, trackName: track.nameAr || track.name, trackId, aiAnalysis, meta };
  }

  private async getExistingTasks(trackId: string) {
    return this.prisma.task.findMany({
      where: { trackId, isDeleted: false },
      select: {
        id: true, title: true, titleAr: true, status: true, progress: true,
        dueDate: true, notes: true, priority: true,
      },
    });
  }

  private buildTaskList(existingTasks: Array<{ id: string; title: string; titleAr: string; status: string; progress: number; dueDate: Date | null; priority: string }>) {
    return existingTasks
      .map(t => `- ID: ${t.id} | "${t.title}" | "${t.titleAr}" | Status: ${t.status} | Progress: ${t.progress}% | Priority: ${t.priority}${t.dueDate ? ` | Due: ${t.dueDate.toISOString().split('T')[0]}` : ''}`)
      .join('\n');
  }

  // ─── AI Text Extraction (for non-PPTX formats) ───

  private async aiExtractFromText(
    text: string,
    format: string,
    taskList: string,
    existingTasks: Array<{ id: string; title: string; titleAr: string; status: string; progress: number }>,
    track: { name: string; nameAr: string },
  ): Promise<{ updates: ExtractedUpdate[]; summary: string }> {
    const formatDescriptions: Record<string, string> = {
      xml: 'XML document (possibly MS Project, task list, or structured data)',
      csv: 'CSV spreadsheet with tabular data',
      xlsx: 'Excel spreadsheet with tabular data',
      json: 'JSON data file',
      docx: 'Word document',
      txt: 'Plain text file',
    };

    const systemPrompt = `You are an expert project management AI assistant that analyzes files uploaded by Track Leaders.
The file is a ${formatDescriptions[format] || format + ' file'} containing information about tasks in track "${track.nameAr}" (${track.name}).

Your job is to:
1. Understand the file content regardless of format
2. Extract task updates and match them to existing tasks
3. Detect task names, statuses, progress, dates, and any challenges

You understand Arabic and English perfectly.

Return ONLY a valid JSON object:
{
  "summary": "Brief Arabic summary of the file content (2-3 sentences)",
  "updates": [
    {
      "taskTitle": "Title in English or original language",
      "taskTitleAr": "Arabic title if available",
      "status": "pending|in_progress|under_review|completed|delayed|cancelled",
      "progress": 0-100,
      "notes": "Key details from the file",
      "challenges": "Any challenges or blockers mentioned",
      "dueDate": "YYYY-MM-DD if mentioned, null otherwise",
      "matchedTaskId": "ID from existing tasks if matched, null otherwise",
      "confidence": "high|medium|low",
      "action": "update|create|skip",
      "aiReason": "Brief explanation"
    }
  ]
}`;

    // Truncate very large text to avoid token limits
    const maxTextLen = 30000;
    const truncatedText = text.length > maxTextLen
      ? text.substring(0, maxTextLen) + `\n\n... [truncated, ${text.length - maxTextLen} more characters]`
      : text;

    try {
      const response = await this.openai.chat([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `EXISTING TASKS IN TRACK "${track.nameAr}":
${taskList || '(No existing tasks yet)'}

FILE CONTENT (${format.toUpperCase()}):
${truncatedText}

EXTRACTION RULES:
1. Match updates to existing tasks using title similarity (Arabic or English).
2. Extract status keywords: "مكتمل/completed" = completed, "قيد التنفيذ/in progress" = in_progress, "متأخر/delayed" = delayed, "مراجعة/review" = under_review.
3. Extract progress percentages.
4. Extract dates and deadlines.
5. Extract challenges/blockers.
6. For XML: look for <Task>, <Name>, <PercentComplete>, <Start>, <Finish> elements.
7. For CSV/Excel: each row may represent a task update.
8. For JSON: look for task objects with name/status/progress fields.
9. For Word/Text: look for task mentions, bullet points, status updates.
10. If data is clearly not task-related, set action to "skip".`,
        },
      ], { temperature: 0.1, maxTokens: 8192, model: 'gpt-4o' });

      const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      const summary = parsed.summary || '';
      const updates = (parsed.updates || []) as ExtractedUpdate[];

      // Validate task IDs
      const validUpdates = updates.map(u => {
        if (u.matchedTaskId) {
          const matched = existingTasks.find(t => t.id === u.matchedTaskId);
          if (matched) {
            u.matchedTaskTitle = `${matched.titleAr} (${matched.title})`;
          } else {
            const fuzzyMatch = this.fuzzyMatchTask(u.taskTitle, u.taskTitleAr, existingTasks);
            if (fuzzyMatch) {
              u.matchedTaskId = fuzzyMatch.id;
              u.matchedTaskTitle = `${fuzzyMatch.titleAr} (${fuzzyMatch.title})`;
              u.confidence = u.confidence === 'high' ? 'medium' : 'low';
            } else {
              u.matchedTaskId = undefined;
              u.confidence = 'low';
              if (u.action === 'update') u.action = 'create';
            }
          }
        } else if (u.action === 'update') {
          const fuzzyMatch = this.fuzzyMatchTask(u.taskTitle, u.taskTitleAr, existingTasks);
          if (fuzzyMatch) {
            u.matchedTaskId = fuzzyMatch.id;
            u.matchedTaskTitle = `${fuzzyMatch.titleAr} (${fuzzyMatch.title})`;
          } else {
            u.action = 'create';
            u.confidence = 'low';
          }
        }
        return u;
      });

      return { updates: validUpdates, summary };
    } catch (error) {
      this.logger.error('AI text extraction failed', error);
      return { updates: [], summary: '' };
    }
  }

  // ─── PPTX-specific extraction (backward compat) ───

  async extractFromPptx(base64Content: string, trackId: string): Promise<PptxImportResult> {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new BadRequestException('Track not found');

    const buffer = Buffer.from(base64Content, 'base64');
    const parsed = await this.pptxParser.parse(buffer);

    if (parsed.totalSlides === 0) {
      throw new BadRequestException('No slides found in the uploaded file');
    }

    // Get existing tasks for matching
    const existingTasks = await this.prisma.task.findMany({
      where: { trackId, isDeleted: false },
      select: {
        id: true, title: true, titleAr: true, status: true, progress: true,
        dueDate: true, notes: true, priority: true,
      },
    });

    const taskList = existingTasks
      .map(t => `- ID: ${t.id} | "${t.title}" | "${t.titleAr}" | Status: ${t.status} | Progress: ${t.progress}% | Priority: ${t.priority}${t.dueDate ? ` | Due: ${t.dueDate.toISOString().split('T')[0]}` : ''}`)
      .join('\n');

    let extractedUpdates: ExtractedUpdate[];
    let aiAnalysis: string | undefined;

    if (this.openai.isAvailable) {
      const result = await this.aiExtractMultiPass(parsed, taskList, existingTasks, track);
      extractedUpdates = result.updates;
      aiAnalysis = result.summary;
    } else {
      extractedUpdates = this.heuristicExtract(parsed, existingTasks);
    }

    return {
      parsed,
      extractedUpdates,
      trackName: track.nameAr || track.name,
      trackId,
      aiAnalysis,
    };
  }

  // ─── AI Multi-Pass Analysis ───

  private async aiExtractMultiPass(
    parsed: PptxParseResult,
    taskList: string,
    existingTasks: Array<{ id: string; title: string; titleAr: string; status: string; progress: number; dueDate: Date | null; notes: string | null; priority: string }>,
    track: { name: string; nameAr: string },
  ): Promise<{ updates: ExtractedUpdate[]; summary: string }> {

    // Collect all images from all slides (limit to first 10 for API cost)
    const allImages: Array<{ slideNum: number; image: SlideImage }> = [];
    for (const slide of parsed.slides) {
      for (const img of slide.images) {
        if (allImages.length < 10) {
          allImages.push({ slideNum: slide.slideNumber, image: img });
        }
      }
    }

    // ─── Pass 1: If there are images, analyze them with GPT-4o Vision ───
    let imageAnalysis = '';
    if (allImages.length > 0) {
      try {
        imageAnalysis = await this.analyzeImages(allImages, track);
      } catch (err) {
        this.logger.warn('Image analysis failed, continuing with text only', err);
      }
    }

    // ─── Pass 2: Main extraction with full context ───
    const systemPrompt = `You are an expert project management AI assistant that analyzes PowerPoint presentations from Track Leaders.
Your job is to extract structured task updates from the presentation and match them to existing tasks.

You understand Arabic and English perfectly. The track name is "${track.nameAr}" (${track.name}).

You must return ONLY a valid JSON object with this structure:
{
  "summary": "Brief Arabic summary of the presentation content (2-3 sentences)",
  "updates": [
    {
      "taskTitle": "Title in English or original language",
      "taskTitleAr": "Arabic title if available",
      "status": "pending|in_progress|under_review|completed|delayed|cancelled",
      "progress": 0-100,
      "notes": "Key findings, details, or updates from the slide",
      "challenges": "Any mentioned challenges, risks, or blockers",
      "dueDate": "YYYY-MM-DD if mentioned, null otherwise",
      "matchedTaskId": "ID from existing tasks if matched, null otherwise",
      "confidence": "high|medium|low",
      "action": "update|create|skip",
      "slideNumber": 1,
      "aiReason": "Brief explanation of why this match/action was chosen"
    }
  ]
}`;

    const userContent: any[] = [];

    // Add the main text prompt
    userContent.push({
      type: 'text',
      text: `EXISTING TASKS IN TRACK "${track.nameAr}":
${taskList || '(No existing tasks yet)'}

${imageAnalysis ? `IMAGE ANALYSIS RESULTS:\n${imageAnalysis}\n` : ''}
SLIDE CONTENT:
${parsed.fullText}

EXTRACTION RULES:
1. Match updates to existing tasks using title similarity (Arabic or English). Be smart about partial matches, abbreviations, and synonyms.
2. Extract status from keywords: "مكتمل/مكتملة/done/completed" = completed, "قيد التنفيذ/جاري العمل/in progress" = in_progress, "متأخر/delayed/تأخير" = delayed, "مراجعة/review" = under_review, "معلق/pending" = pending, "ملغي/cancelled" = cancelled.
3. Extract progress percentages from text like "50%", "نسبة الإنجاز 75%", "اكتمل بنسبة 80%".
4. Extract dates mentioned: "الموعد المتوقع", "تاريخ التسليم", "deadline", etc.
5. Extract challenges/blockers mentioned: "تحديات", "معوقات", "مخاطر", "challenges", "risks".
6. If a slide is a title/agenda/thank-you slide, set action to "skip".
7. One slide may contain multiple task updates — extract each one separately.
8. If tables contain task data (task name, status, progress), extract each row as a separate update.
9. For confidence: "high" = exact or near-exact title match, "medium" = partial match or context-based, "low" = inferred.
10. Progress mapping when not explicitly stated: pending=0, in_progress=50, under_review=80, completed=100, delayed=keep current.
11. If a task is mentioned but isn't in the existing task list, mark action as "create" only if it clearly describes a specific task (not general commentary).
12. Combine information from slide text, notes, tables, and image analysis for the most complete picture.`,
    });

    // Add images directly for GPT-4o vision (up to 5 most relevant)
    const imagesToSend = allImages.slice(0, 5);
    for (const { slideNum, image } of imagesToSend) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: image.base64,
          detail: 'low', // Use low detail to save tokens
        },
      });
    }

    try {
      const response = await this.openai.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ], { temperature: 0.1, maxTokens: 8192, model: 'gpt-4o' });

      const jsonStr = response
        .replace(/```json\n?|\n?```/g, '')
        .trim();

      const parsed2 = JSON.parse(jsonStr);
      const summary = parsed2.summary || '';
      const updates = (parsed2.updates || []) as ExtractedUpdate[];

      // Validate matched task IDs
      const validUpdates = updates.map(u => {
        if (u.matchedTaskId) {
          const matched = existingTasks.find(t => t.id === u.matchedTaskId);
          if (matched) {
            u.matchedTaskTitle = `${matched.titleAr} (${matched.title})`;
          } else {
            // AI hallucinated an ID — try fuzzy match by title
            const fuzzyMatch = this.fuzzyMatchTask(u.taskTitle, u.taskTitleAr, existingTasks);
            if (fuzzyMatch) {
              u.matchedTaskId = fuzzyMatch.id;
              u.matchedTaskTitle = `${fuzzyMatch.titleAr} (${fuzzyMatch.title})`;
              u.confidence = u.confidence === 'high' ? 'medium' : 'low';
            } else {
              u.matchedTaskId = undefined;
              u.confidence = 'low';
              if (u.action === 'update') u.action = 'create';
            }
          }
        } else if (u.action === 'update') {
          // No ID but marked as update — try to find a match
          const fuzzyMatch = this.fuzzyMatchTask(u.taskTitle, u.taskTitleAr, existingTasks);
          if (fuzzyMatch) {
            u.matchedTaskId = fuzzyMatch.id;
            u.matchedTaskTitle = `${fuzzyMatch.titleAr} (${fuzzyMatch.title})`;
          } else {
            u.action = 'create';
            u.confidence = 'low';
          }
        }
        return u;
      });

      return { updates: validUpdates, summary };
    } catch (error) {
      this.logger.error('AI extraction failed, falling back to heuristic', error);
      return {
        updates: this.heuristicExtract(
          { slides: parsed.slides, totalSlides: parsed.totalSlides, fullText: parsed.fullText, hasImages: false, hasTables: false },
          existingTasks,
        ),
        summary: '',
      };
    }
  }

  // ─── Image Analysis with GPT-4o Vision ───

  private async analyzeImages(
    images: Array<{ slideNum: number; image: SlideImage }>,
    track: { name: string; nameAr: string },
  ): Promise<string> {
    const content: any[] = [
      {
        type: 'text',
        text: `These images are from a PowerPoint presentation for track "${track.nameAr}".
Analyze each image and extract any visible:
- Task names or project names
- Status indicators (colors, checkmarks, X marks)
- Progress bars or percentages
- Dates or timelines
- Charts showing progress or status
- Table data with tasks and their status
Return a brief structured analysis for each image.`,
      },
    ];

    for (const { slideNum, image } of images) {
      content.push({
        type: 'text',
        text: `[Image from Slide ${slideNum}]:`,
      });
      content.push({
        type: 'image_url',
        image_url: {
          url: image.base64,
          detail: 'low',
        },
      });
    }

    const response = await this.openai.chat([
      { role: 'system', content: 'You analyze project management presentation images. Extract task data visible in charts, tables, and diagrams. Respond in Arabic.' },
      { role: 'user', content },
    ], { temperature: 0.1, maxTokens: 2048, model: 'gpt-4o' });

    return response;
  }

  // ─── Fuzzy Match Helper ───

  private fuzzyMatchTask(
    title?: string,
    titleAr?: string,
    existingTasks: Array<{ id: string; title: string; titleAr: string }> = [],
  ): { id: string; title: string; titleAr: string } | null {
    if (!title && !titleAr) return null;

    const normalize = (s: string) => s.toLowerCase().trim()
      .replace(/[^\w\u0600-\u06FF\s]/g, '') // keep arabic + latin + spaces
      .replace(/\s+/g, ' ');

    const searchTerms = [
      title ? normalize(title) : '',
      titleAr ? normalize(titleAr) : '',
    ].filter(Boolean);

    let bestMatch: { task: typeof existingTasks[0]; score: number } | null = null;

    for (const task of existingTasks) {
      const taskTerms = [normalize(task.title), normalize(task.titleAr)];

      for (const search of searchTerms) {
        for (const taskTerm of taskTerms) {
          if (!search || !taskTerm) continue;

          // Exact match
          if (search === taskTerm) return task;

          // Contains match
          if (taskTerm.includes(search) || search.includes(taskTerm)) {
            const score = Math.min(search.length, taskTerm.length) / Math.max(search.length, taskTerm.length);
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { task, score };
            }
          }

          // Word overlap match
          const searchWords = new Set(search.split(' '));
          const taskWords = new Set(taskTerm.split(' '));
          const overlap = [...searchWords].filter(w => taskWords.has(w)).length;
          const totalWords = Math.max(searchWords.size, taskWords.size);
          if (totalWords > 0) {
            const score = overlap / totalWords;
            if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
              bestMatch = { task, score };
            }
          }
        }
      }
    }

    return bestMatch && bestMatch.score >= 0.4 ? bestMatch.task : null;
  }

  // ─── Heuristic Fallback ───

  private heuristicExtract(
    parsed: PptxParseResult,
    existingTasks: Array<{ id: string; title: string; titleAr: string; status: string; progress: number }>,
  ): ExtractedUpdate[] {
    const updates: ExtractedUpdate[] = [];

    for (const slide of parsed.slides) {
      // Extract from tables first (higher quality structured data)
      if (slide.tables.length > 0) {
        for (const row of slide.tables) {
          if (row.length < 2) continue;
          const rowText = row.join(' ').toLowerCase();
          // Skip header rows
          if (rowText.includes('اسم المهمة') || rowText.includes('task name') || rowText.includes('الحالة')) continue;

          const taskName = row[0];
          if (!taskName || taskName.length < 2) continue;

          const matched = this.fuzzyMatchTask(taskName, taskName, existingTasks);
          const allText = row.join(' ').toLowerCase();
          const { status, progress } = this.detectStatusProgress(allText);

          updates.push({
            taskTitle: taskName,
            status,
            progress,
            notes: row.slice(1).filter(c => c.length > 0).join(' | '),
            matchedTaskId: matched?.id,
            matchedTaskTitle: matched ? `${matched.titleAr} (${matched.title})` : undefined,
            confidence: matched ? 'medium' : 'low',
            action: matched ? 'update' : 'create',
            slideNumber: slide.slideNumber,
          });
        }
      }

      // Extract from text
      if (slide.bullets.length === 0 && !slide.title) continue;

      const titleLower = slide.title.toLowerCase().trim();
      // Skip obvious non-task slides
      if (this.isSkipSlide(titleLower)) continue;

      const matched = this.fuzzyMatchTask(slide.title, slide.title, existingTasks);
      const allText = [slide.title, ...slide.bullets, slide.notes].join(' ').toLowerCase();
      const { status, progress } = this.detectStatusProgress(allText);

      if (matched) {
        updates.push({
          taskTitle: slide.title || matched.title,
          status,
          progress,
          notes: slide.bullets.join(' | '),
          matchedTaskId: matched.id,
          matchedTaskTitle: `${matched.titleAr} (${matched.title})`,
          confidence: 'medium',
          action: 'update',
          slideNumber: slide.slideNumber,
        });
      } else if (slide.title && slide.bullets.length > 0) {
        updates.push({
          taskTitle: slide.title,
          status: status || 'pending',
          progress: progress || 0,
          notes: slide.bullets.join(' | '),
          confidence: 'low',
          action: 'create',
          slideNumber: slide.slideNumber,
        });
      }
    }

    return updates;
  }

  private isSkipSlide(title: string): boolean {
    const skipWords = [
      'agenda', 'جدول الأعمال', 'شكر', 'thank', 'محتويات',
      'table of contents', 'q&a', 'أسئلة', 'questions',
      'المقدمة', 'introduction', 'overview', 'نظرة عامة',
    ];
    return skipWords.some(w => title.includes(w));
  }

  private detectStatusProgress(text: string): { status?: string; progress?: number } {
    let status: string | undefined;
    let progress: number | undefined;

    if (text.includes('مكتمل') || text.includes('completed') || text.includes('done') || text.includes('انتهى') || text.includes('100%')) {
      status = 'completed'; progress = 100;
    } else if (text.includes('متأخر') || text.includes('delayed') || text.includes('تأخير') || text.includes('تأخر')) {
      status = 'delayed';
    } else if (text.includes('قيد التنفيذ') || text.includes('in progress') || text.includes('جاري') || text.includes('يتم العمل')) {
      status = 'in_progress'; progress = 50;
    } else if (text.includes('مراجعة') || text.includes('review') || text.includes('تدقيق')) {
      status = 'under_review'; progress = 80;
    } else if (text.includes('ملغي') || text.includes('cancelled') || text.includes('إلغاء')) {
      status = 'cancelled';
    } else if (text.includes('معلق') || text.includes('pending') || text.includes('لم يبدأ') || text.includes('not started')) {
      status = 'pending'; progress = 0;
    }

    // Extract explicit percentage
    const pctMatch = text.match(/(\d{1,3})\s*%/);
    if (pctMatch) {
      const pct = parseInt(pctMatch[1]);
      if (pct >= 0 && pct <= 100) progress = pct;
    }

    return { status, progress };
  }

  // ─── Apply Updates ───

  async applyUpdates(
    trackId: string,
    updates: ExtractedUpdate[],
    userId: string,
  ): Promise<ApplyResult> {
    const result: ApplyResult = { updated: 0, created: 0, skipped: 0, details: [] };

    for (const update of updates) {
      if (update.action === 'skip') {
        result.skipped++;
        result.details.push({ taskTitle: update.taskTitle, action: 'skip', success: true });
        continue;
      }

      try {
        if (update.action === 'update' && update.matchedTaskId) {
          const data: any = {};
          if (update.status) data.status = update.status;
          if (update.progress !== undefined) data.progress = update.progress;
          if (update.notes) data.notes = update.notes;

          // Auto-set progress based on status if not explicitly set
          if (update.status && update.progress === undefined) {
            const statusProgress: Record<string, number> = {
              pending: 0, in_progress: 50, under_review: 80, completed: 100,
            };
            if (statusProgress[update.status] !== undefined) {
              data.progress = statusProgress[update.status];
            }
          }

          if (update.status === 'completed') {
            data.completionDate = new Date();
          }

          if (update.dueDate) {
            data.dueDate = new Date(update.dueDate);
          }

          await this.prisma.task.update({
            where: { id: update.matchedTaskId },
            data,
          });

          // Build update content with details
          const updateParts = ['[تحديث من استيراد ملف]'];
          if (update.status) updateParts.push(`الحالة: ${update.status}`);
          if (update.progress !== undefined) updateParts.push(`التقدم: ${update.progress}%`);
          if (update.notes) updateParts.push(update.notes);
          if (update.challenges) updateParts.push(`التحديات: ${update.challenges}`);

          await this.prisma.taskUpdate.create({
            data: {
              taskId: update.matchedTaskId,
              content: updateParts.join(' | '),
              authorId: userId,
            },
          });

          result.updated++;
          result.details.push({ taskTitle: update.taskTitle, action: 'update', success: true });
        } else if (update.action === 'create') {
          await this.prisma.task.create({
            data: {
              title: update.taskTitle,
              titleAr: update.taskTitleAr || update.taskTitle,
              trackId,
              status: (update.status as any) || 'pending',
              progress: update.progress || 0,
              notes: update.notes,
              dueDate: update.dueDate ? new Date(update.dueDate) : undefined,
              createdById: userId,
            },
          });

          result.created++;
          result.details.push({ taskTitle: update.taskTitle, action: 'create', success: true });
        }
      } catch (error: any) {
        result.details.push({
          taskTitle: update.taskTitle,
          action: update.action,
          success: false,
          error: error.message,
        });
      }
    }

    return result;
  }
}
