/**
 * Vision-based PDF parser — استخراج سجلات البصمة عبر Claude API مباشرةً.
 *
 * Claude يقبل PDF كـ document content block، ويقرأ النص العربي بدقة عالية
 * (يحلّ مشاكل pdf-parse مع الأحرف الفارسية، الكلمات المدمجة، RTL artifacts).
 *
 * يرجع نفس بنية ParsedPunch[] كمخرج pdf-text-cleaner.parsePunches، عشان
 * downstream code (matchEmployee, analyzeDay) ما يتأثر.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ParsedPunch } from '../utils/pdf-text-cleaner';

/** نموذج الموديل المستخدم — أحدث Opus متاح للدقة القصوى مع العربي. */
const DEFAULT_MODEL = 'claude-opus-4-5';
const MAX_TOKENS = 16_000;

const EXTRACTION_PROMPT = `أنت محلل بيانات حضور دقيق جداً. أمامك تقرير بصمات من منصة "رؤية" (RTL، عربي).

### بنية الجدول (من اليمين لليسار في الصورة):
رقم الموظف | الاسم الأول | القسم | التاريخ | الوقت | حالة البصمة | رمز العمل | مصدر البيانات

### القواعد الصارمة:
1. اقرأ كل صف بدون تخطي. كل صف = حدث بصمة واحد.
2. الأسماء العربية كاملة بدون أي حذف. لا تدمج كلمتين. لا تخمن. الفرق بين "عبدالله" و "عبد الله" مهم — انسخه كما تراه.
3. الوقت: HH:MM (24h). لو رأيت 1:37 اكتب 01:37.
4. التاريخ: YYYY-MM-DD.
5. حالة البصمة: "check_in" لـ "تسجيل الدخول"، "check_out" لـ "تسجيل الخروج".
6. خانات فارغة → null. لا تخترع بيانات.
7. الأقسام قد تكون كلمتين: "حراس أمن"، "إدارة المشاريع"، "الدعم الفني"، "علاقات الشركات". اقرأها كاملة.
8. تجاهل تماماً: عناوين الأعمدة، رقم الصفحة (مثل 1/2)، تواريخ التقرير في الـ header.

### المخرج (JSON فقط، بدون markdown، بدون أي شرح):
{
  "report_date": "YYYY-MM-DD",
  "records": [
    {
      "employee_number": "11",
      "full_name": "إيهاب إبراهيم بخاري",
      "department": "التوزيع",
      "date": "2026-05-01",
      "time": "01:37",
      "punch_type": "check_in",
      "work_code": "0",
      "data_source": "الجهاز"
    }
  ]
}

ابدأ مباشرة بـ JSON.`;

interface VisionResponse {
  report_date?: string;
  records?: VisionRecord[];
}

interface VisionRecord {
  employee_number?: string | null;
  full_name?: string | null;
  department?: string | null;
  date?: string | null;
  time?: string | null;
  punch_type?: 'check_in' | 'check_out' | null;
  work_code?: string | null;
  data_source?: string | null;
}

export interface VisionParseResult {
  reportDate: Date | null;
  punches: ParsedPunch[];
  warnings: string[];
}

@Injectable()
export class PdfVisionParserService {
  private readonly logger = new Logger(PdfVisionParserService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY غير معرّف — Vision parser لن يعمل. ' +
          'fallback إلى pdf-parse فقط.',
      );
      this.client = null;
    } else {
      this.client = new Anthropic({ apiKey });
    }
    this.model = this.config.get<string>('CLAUDE_PDF_MODEL') || DEFAULT_MODEL;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * يستخرج السجلات من PDF عبر Claude Vision.
   * يرفع Error لو الـ API غير متوفر أو الاستجابة غير قابلة للتحليل.
   */
  async parse(buffer: Buffer): Promise<VisionParseResult> {
    if (!this.client) {
      throw new Error('Vision parser غير متوفر — ANTHROPIC_API_KEY غير معرّف.');
    }

    const base64 = buffer.toString('base64');
    this.logger.log(
      `استدعاء ${this.model} لاستخراج سجلات PDF (${(buffer.length / 1024).toFixed(0)} KB)`,
    );

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('استجابة Vision API لا تحوي نصاً.');
    }

    const data = parseJsonResponse(textBlock.text);
    return mapToParsedPunches(data, this.logger);
  }
}

// ─── Helpers (exported for testing) ──────────────────────────────────

/**
 * يستخرج JSON من النص حتى لو ملفوف بـ ```json ... ```.
 * يرفع Error لو ما قدر يحلل.
 */
export function parseJsonResponse(text: string): VisionResponse {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
  }
  // حالة شائعة: نص قبل الـ JSON. نأخذ من أول { حتى آخر }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned) as VisionResponse;
  } catch (e: any) {
    throw new Error(`JSON غير صالح من Vision API: ${e?.message || e}`);
  }
}

/**
 * يحوّل استجابة Vision إلى ParsedPunch[] متوافقة مع pdf-text-cleaner.
 * صفوف غير مكتملة تُسجَّل كـ warnings وتُتخطى.
 */
export function mapToParsedPunches(
  data: VisionResponse,
  logger: { warn(msg: string): void },
): VisionParseResult {
  const warnings: string[] = [];
  const punches: ParsedPunch[] = [];

  let reportDate: Date | null = null;
  if (data.report_date) {
    const d = parseIsoDate(data.report_date);
    if (d) reportDate = d;
  }

  for (const r of data.records ?? []) {
    const issues: string[] = [];
    if (!r.employee_number) issues.push('emp_number');
    if (!r.full_name) issues.push('name');
    if (!r.date) issues.push('date');
    if (!r.time) issues.push('time');
    if (!r.punch_type) issues.push('punch_type');
    if (issues.length > 0) {
      const w = `سجل ناقص (${issues.join(', ')}): ${JSON.stringify(r)}`;
      warnings.push(w);
      logger.warn(w);
      continue;
    }

    const recordDate = parseIsoDate(r.date!);
    if (!recordDate) {
      warnings.push(`تاريخ غير صالح: ${r.date}`);
      continue;
    }

    if (!isValidTime(r.time!)) {
      warnings.push(`وقت غير صالح: ${r.time}`);
      continue;
    }

    if (r.punch_type !== 'check_in' && r.punch_type !== 'check_out') {
      warnings.push(`نوع بصمة غير معروف: ${r.punch_type}`);
      continue;
    }

    if (!reportDate) reportDate = recordDate;

    punches.push({
      rawEmployeeNumber: String(r.employee_number).trim(),
      rawName: String(r.full_name).trim(),
      rawDepartment: r.department ? String(r.department).trim() : '',
      recordDate,
      recordTime: padTime(r.time!),
      punchType: r.punch_type,
      workCode: r.work_code ? String(r.work_code).trim() : null,
      dataSource: r.data_source ? String(r.data_source).trim() : null,
    });
  }

  return { reportDate, punches, warnings };
}

function parseIsoDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  return isNaN(date.getTime()) ? null : date;
}

function isValidTime(s: string): boolean {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = +m[1];
  const mn = +m[2];
  return h >= 0 && h < 24 && mn >= 0 && mn < 60;
}

function padTime(s: string): string {
  const [h, m] = s.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}
