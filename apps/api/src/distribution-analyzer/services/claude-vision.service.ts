import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedDistributionData, ExtractedDistributionRow } from '../interfaces/analyzer.types';

/**
 * Vision-based extractor. Takes a screenshot/photo of the platform's
 * "نسبة الإنجاز" table and returns rows shaped exactly like
 * DistributionAchievement so the comparison engine can match without
 * a translation layer.
 *
 * Uses the Anthropic SDK directly (mirrors AttendanceAnalysisService) —
 * the AI-Agent ClaudeService is a tool-loop wrapper that doesn't fit
 * a one-shot vision call.
 */
@Injectable()
export class DistributionVisionService {
  private readonly logger = new Logger(DistributionVisionService.name);
  private client: Anthropic | null = null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.logger.warn('ANTHROPIC_API_KEY not set — distribution vision will return 503');
    }
    // Sonnet 4.5 is the project default and supports vision well in Arabic.
    this.model = config.get<string>('ANTHROPIC_MODEL_DEFAULT') || 'claude-sonnet-4-5';
  }

  async extractFromImage(
    imageBytes: Buffer,
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  ): Promise<ExtractedDistributionData> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'تحليل الذكاء الاصطناعي غير متاح حالياً: ANTHROPIC_API_KEY غير مضبوط على الخادم.',
      );
    }

    const systemPrompt = `أنت مساعد ذكي متخصص في استخراج البيانات الجدولية من صور جداول مسار التوزيع لمشروع بطاقة نُسك (وزارة الحج والعمرة).

الجدول العربي RTL، أعمدته من اليمين لليسار عادةً:
- البطاقات (Total Cards) — عدد البطاقات الموزعة في اليوم
- المركز (Center) — مكة أو المدينة
- الطرود (Parcels) — عدد الطرود
- الشركات (Companies) — عدد الشركات
- الشحنة (Batch) — رقم/معرّف الشحنة
- الموافق (Hijri Date) — التاريخ الهجري
- التاريخ (Gregorian Date) — التاريخ الميلادي
- بطاقة/ساعة (Cards/Hour) — اختياري

قواعد إلزامية:
1. أعِد JSON فقط — بدون markdown، بدون \`\`\`، بدون أي نص قبل أو بعد.
2. التواريخ بصيغة ISO: "YYYY-MM-DD". إذا كان عمود التاريخ هجرياً فقط، اتركه في hijriDate وضع gregorianDate كأقرب تحويل ممكن أو null.
3. الأرقام: حوّل الفواصل العربية (٬) والإنجليزية (,) والنقاط الألفية إلى أرقام صحيحة (integers أو null).
4. center: استخدم القيم الحرفية "makkah" أو "madinah" — لا تستخدم العربي.
5. اليوم الواحد قد يحتوي صفّيْن (مكة + المدينة) — استخرجهما منفصلين.
6. إذا الصف يحتوي مجموع/إجمالي، **لا تضمّنه في rows**، بل ضع الإجماليات في حقل totals.
7. لا تخمّن: أي خانة غير واضحة → null + سطر في uncertainData.
8. confidence: قدّر دقة الاستخراج من 0.0 إلى 1.0.

المخطط الإلزامي:
{
  "rows": [
    {
      "gregorianDate": "2026-04-20",
      "hijriDate": "1447/10/03",
      "batch": "1",
      "companies": 17,
      "parcels": 118,
      "totalCards": 17771,
      "cardsPerHour": null,
      "center": "makkah",
      "notes": null
    }
  ],
  "totals": {
    "companies": 23,
    "parcels": 23401,
    "totalCards": 1497310,
    "batches": 47
  },
  "uncertainData": [{"row": 5, "field": "totalCards", "reason": "الرقم غير واضح"}],
  "confidence": 0.92
}`;

    const base64 = imageBytes.toString('base64');
    const startedAt = Date.now();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text: 'استخرج كل الصفوف والإجماليات من هذا الجدول. أعد JSON فقط مطابقاً للمخطط — بدون أي شرح.',
            },
          ],
        },
      ],
    });

    const text = (response.content.find((b) => b.type === 'text') as any)?.text ?? '';
    const parsed = parseJsonStrict(text);
    if (!parsed) {
      this.logger.warn(`Vision returned unparseable text (first 200 chars): ${text.slice(0, 200)}`);
      throw new Error('الذكاء الاصطناعي أعاد ردّاً غير قابل للقراءة. حاول مرة أخرى أو ارفع صورة أوضح.');
    }

    const result = sanitizeExtracted(parsed);
    this.logger.log(
      `Vision extracted ${result.rows.length} rows in ${Date.now() - startedAt}ms (confidence=${result.confidence ?? 'n/a'})`,
    );

    return {
      ...result,
      source: 'IMAGE',
      modelUsed: this.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

function parseJsonStrict(raw: string): any | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(/[٬,]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function center(v: unknown): 'makkah' | 'madinah' | null {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'makkah' || s === 'مكة' || s === 'مكه' || s === 'مكة المكرمة') return 'makkah';
  if (s === 'madinah' || s === 'medina' || s === 'المدينة' || s === 'المدينه' || s === 'المدينة المنورة')
    return 'madinah';
  return null;
}

function sanitizeExtracted(raw: any): Omit<ExtractedDistributionData, 'source' | 'modelUsed' | 'inputTokens' | 'outputTokens'> {
  const rows: ExtractedDistributionRow[] = Array.isArray(raw?.rows)
    ? raw.rows.slice(0, 500).map((r: any) => ({
        gregorianDate: String(r?.gregorianDate ?? '').slice(0, 10),
        hijriDate: r?.hijriDate ? String(r.hijriDate).slice(0, 16) : null,
        batch: r?.batch != null ? String(r.batch).slice(0, 32) : null,
        companies: int(r?.companies),
        parcels: int(r?.parcels),
        totalCards: int(r?.totalCards),
        cardsPerHour: int(r?.cardsPerHour),
        duration: int(r?.duration),
        specialists: int(r?.specialists),
        center: center(r?.center),
        notes: r?.notes ? String(r.notes).slice(0, 240) : null,
      }))
    : [];

  return {
    rows,
    totals: raw?.totals
      ? {
          companies: int(raw.totals.companies),
          parcels: int(raw.totals.parcels),
          totalCards: int(raw.totals.totalCards),
          batches: int(raw.totals.batches),
        }
      : undefined,
    uncertainData: Array.isArray(raw?.uncertainData)
      ? raw.uncertainData.slice(0, 50).map((u: any) => ({
          row: int(u?.row) ?? 0,
          field: String(u?.field ?? '').slice(0, 32),
          reason: String(u?.reason ?? '').slice(0, 200),
        }))
      : undefined,
    confidence: typeof raw?.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : undefined,
  };
}
