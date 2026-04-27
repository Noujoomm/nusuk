import { Injectable, BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';

const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'application/octet-stream', // browsers occasionally send this for blobs
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — Whisper API limit

export interface VoiceFillResult {
  transcription: string;
  detectedLanguage?: string;
  fields: {
    title: string;
    achievements: string;
    kpiUpdates: string;
    challenges: string;
    supportNeeded: string;
    upcomingTasks: string;
    notes: string;
  };
}

const SYSTEM_PROMPT = `أنت مساعد لإدخال تقارير العمل على منصة رؤية (مشروع بطاقة نسك).
يصلك نص عربي (قد يكون بالفصحى أو لهجة سعودية/خليجية/مصرية/شامية/مغربية) من تسجيل صوتي لتقرير عمل.

مهمتك: استخراج محتوى التقرير وتقسيمه على الحقول التالية، وإعادتها كـ JSON صرف بدون أي شرح:

{
  "title": "عنوان مقترح للتقرير، قصير ومعبّر (≤ 80 حرفاً). إذا لم يذكره المستخدم اقترحه من المحتوى.",
  "achievements": "الإنجازات المُنجزة. نص حر بالفصحى، بنقاط (-) إن كان فيه عناصر متعددة. سلسلة فارغة إن لم تُذكر.",
  "kpiUpdates": "تحديثات على المؤشرات والأرقام. حافظ على القيم العددية كما هي.",
  "challenges": "التحديات والعقبات.",
  "supportNeeded": "الدعم المطلوب من الإدارة أو الجهات الأخرى.",
  "upcomingTasks": "المهام والخطوات القادمة.",
  "notes": "ملاحظات إضافية لا تنتمي للحقول السابقة."
}

قواعد:
- لا تخترع محتوى غير موجود — استخدم سلسلة فارغة "" لما لم يُذكر.
- طبّع المصطلحات العامية إلى الفصحى داخل الحقول النصية، لكن احتفظ بالأرقام والأسماء كما نُطقت.
- "ربع مليون" → "250,000"، "أمس" يبقى كما هو، التواريخ المُحدّدة تُكتب YYYY-MM-DD.
- المخرج JSON صالح فقط — لا markdown، لا code fences، لا تعليقات.`;

@Injectable()
export class VoiceFillService {
  private readonly logger = new Logger(VoiceFillService.name);

  constructor(private readonly ai: OpenAIService) {}

  async fillFromAudio(file: Express.Multer.File): Promise<VoiceFillResult> {
    if (!this.ai.isAvailable) {
      throw new ServiceUnavailableException(
        'الإدخال الصوتي غير متاح: OPENAI_API_KEY غير مضبوط على الخادم.',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('لم يتم استلام ملف صوتي.');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('حجم الملف الصوتي يتجاوز 25 ميجابايت.');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`نوع الملف غير مدعوم: ${file.mimetype}`);
    }

    const transcription = await this.ai.transcribeAudio(file.buffer, {
      fileName: file.originalname || 'recording.webm',
      mimeType: file.mimetype,
    });

    if (!transcription.text.trim()) {
      throw new BadRequestException('لم يتم التعرف على أي كلام في التسجيل.');
    }

    const fields = await this.extractFields(transcription.text);

    return {
      transcription: transcription.text,
      detectedLanguage: transcription.language,
      fields,
    };
  }

  private async extractFields(text: string): Promise<VoiceFillResult['fields']> {
    const raw = await this.ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      { temperature: 0.2, maxTokens: 1500 },
    );

    return this.parseFieldsJson(raw);
  }

  private parseFieldsJson(raw: string): VoiceFillResult['fields'] {
    // Defensively peel off code fences if the model added them despite the prompt.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      this.logger.warn(`Failed to parse extraction JSON: ${cleaned.slice(0, 200)}`);
      // Fall back to dumping the whole transcription into "notes" so the user
      // doesn't lose their voice data — they can then split it manually.
      return {
        title: '',
        achievements: '',
        kpiUpdates: '',
        challenges: '',
        supportNeeded: '',
        upcomingTasks: '',
        notes: cleaned,
      };
    }

    const pick = (k: string): string => {
      const v = parsed?.[k];
      if (v == null) return '';
      return typeof v === 'string' ? v : String(v);
    };

    return {
      title: pick('title').slice(0, 200),
      achievements: pick('achievements'),
      kpiUpdates: pick('kpiUpdates'),
      challenges: pick('challenges'),
      supportNeeded: pick('supportNeeded'),
      upcomingTasks: pick('upcomingTasks'),
      notes: pick('notes'),
    };
  }
}
