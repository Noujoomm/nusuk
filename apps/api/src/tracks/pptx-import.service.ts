import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { PptxParserService, PptxParseResult } from './pptx-parser.service';

export interface ExtractedUpdate {
  taskTitle: string;
  taskTitleAr?: string;
  status?: string;
  progress?: number;
  notes?: string;
  matchedTaskId?: string;
  matchedTaskTitle?: string;
  confidence: 'high' | 'medium' | 'low';
  action: 'update' | 'create' | 'skip';
}

export interface PptxImportResult {
  parsed: PptxParseResult;
  extractedUpdates: ExtractedUpdate[];
  trackName: string;
  trackId: string;
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

  async extractFromPptx(base64Content: string, trackId: string): Promise<PptxImportResult> {
    // Validate track exists
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new BadRequestException('Track not found');

    // Parse the PPTX
    const buffer = Buffer.from(base64Content, 'base64');
    const parsed = await this.pptxParser.parse(buffer);

    if (parsed.totalSlides === 0) {
      throw new BadRequestException('No slides found in the uploaded file');
    }

    // Get existing tasks for this track to enable matching
    const existingTasks = await this.prisma.task.findMany({
      where: { trackId, isDeleted: false },
      select: { id: true, title: true, titleAr: true, status: true, progress: true },
    });

    const taskList = existingTasks
      .map(t => `- ID: ${t.id} | Title: ${t.title} | TitleAr: ${t.titleAr} | Status: ${t.status} | Progress: ${t.progress}%`)
      .join('\n');

    // Use AI to extract structured updates
    let extractedUpdates: ExtractedUpdate[];

    if (this.openai.isAvailable) {
      extractedUpdates = await this.aiExtract(parsed.fullText, taskList, existingTasks);
    } else {
      extractedUpdates = this.heuristicExtract(parsed, existingTasks);
    }

    return {
      parsed,
      extractedUpdates,
      trackName: track.nameAr || track.name,
      trackId,
    };
  }

  private async aiExtract(
    slideText: string,
    taskList: string,
    existingTasks: Array<{ id: string; title: string; titleAr: string; status: string; progress: number }>,
  ): Promise<ExtractedUpdate[]> {
    const prompt = `You are analyzing a PowerPoint presentation from a Track Leader in a project management system.
The presentation contains status updates about tasks in their track.

EXISTING TASKS IN THIS TRACK:
${taskList || '(No existing tasks)'}

SLIDE CONTENT:
${slideText}

INSTRUCTIONS:
1. Extract each task update mentioned in the slides
2. Match each update to an existing task if possible (by title similarity in English or Arabic)
3. Determine the appropriate status and progress percentage
4. If a slide mentions a new task not in the existing list, mark action as "create"

Valid statuses: pending, in_progress, under_review, completed, delayed, cancelled

Return a JSON array of objects with this structure:
[
  {
    "taskTitle": "English title",
    "taskTitleAr": "Arabic title if found",
    "status": "one of the valid statuses",
    "progress": 0-100,
    "notes": "any additional details from the slide",
    "matchedTaskId": "ID from existing tasks if matched, null otherwise",
    "confidence": "high|medium|low",
    "action": "update|create|skip"
  }
]

IMPORTANT:
- Only return the JSON array, no other text
- If a slide is just a title slide or agenda, skip it
- Progress should reflect the described state (completed=100, in_progress=50 unless specific % mentioned)
- Set confidence to "high" if title match is exact, "medium" if partial, "low" if inferred`;

    try {
      const response = await this.openai.chat([
        { role: 'system', content: 'You extract structured task updates from presentation content. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.1, maxTokens: 4096 });

      // Parse the AI response
      const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
      const updates = JSON.parse(jsonStr) as ExtractedUpdate[];

      // Validate and fill matched task titles
      return updates.map(u => {
        if (u.matchedTaskId) {
          const matched = existingTasks.find(t => t.id === u.matchedTaskId);
          if (matched) {
            u.matchedTaskTitle = matched.title;
          } else {
            u.matchedTaskId = undefined;
            u.confidence = 'low';
          }
        }
        return u;
      });
    } catch (error) {
      this.logger.error('AI extraction failed, falling back to heuristic', error);
      return this.heuristicExtract(
        { slides: [], totalSlides: 0, fullText: '' },
        existingTasks,
      );
    }
  }

  private heuristicExtract(
    parsed: PptxParseResult,
    existingTasks: Array<{ id: string; title: string; titleAr: string; status: string; progress: number }>,
  ): ExtractedUpdate[] {
    const updates: ExtractedUpdate[] = [];

    for (const slide of parsed.slides) {
      if (slide.bullets.length === 0 && !slide.title) continue;

      // Try to match slide title to an existing task
      const titleLower = slide.title.toLowerCase().trim();
      const matched = existingTasks.find(t =>
        t.title.toLowerCase().includes(titleLower) ||
        titleLower.includes(t.title.toLowerCase()) ||
        t.titleAr.includes(slide.title),
      );

      // Check bullets for progress/status hints
      let progress: number | undefined;
      let status: string | undefined;
      const allText = [slide.title, ...slide.bullets, slide.notes].join(' ').toLowerCase();

      if (allText.includes('مكتمل') || allText.includes('completed') || allText.includes('done') || allText.includes('100%')) {
        status = 'completed'; progress = 100;
      } else if (allText.includes('متأخر') || allText.includes('delayed') || allText.includes('تأخير')) {
        status = 'delayed';
      } else if (allText.includes('قيد التنفيذ') || allText.includes('in progress') || allText.includes('جاري')) {
        status = 'in_progress'; progress = 50;
      } else if (allText.includes('مراجعة') || allText.includes('review')) {
        status = 'under_review'; progress = 80;
      }

      // Extract percentage from text
      const pctMatch = allText.match(/(\d{1,3})\s*%/);
      if (pctMatch) progress = parseInt(pctMatch[1]);

      if (matched) {
        updates.push({
          taskTitle: slide.title || matched.title,
          status,
          progress,
          notes: slide.bullets.join(' | '),
          matchedTaskId: matched.id,
          matchedTaskTitle: matched.title,
          confidence: 'medium',
          action: 'update',
        });
      } else if (slide.title && slide.bullets.length > 0) {
        updates.push({
          taskTitle: slide.title,
          status: status || 'pending',
          progress: progress || 0,
          notes: slide.bullets.join(' | '),
          confidence: 'low',
          action: 'create',
        });
      }
    }

    return updates;
  }

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

          await this.prisma.task.update({
            where: { id: update.matchedTaskId },
            data,
          });

          // Create a task update record
          await this.prisma.taskUpdate.create({
            data: {
              taskId: update.matchedTaskId,
              content: `[تحديث من PowerPoint] ${update.notes || 'تم التحديث'}`,
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
