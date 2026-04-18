/**
 * Arabic-first prompt engineering for the AI Reports Intelligence Center.
 *
 * Every prompt is designed to:
 *   1. Produce strict JSON so the UI can render per-section with confidence.
 *   2. Use formal executive Arabic (فصحى تنفيذية) — not conversational.
 *   3. Never fabricate: empty/missing information stays empty.
 *   4. Merge semantically-similar items and drop noise.
 */

import { OutputMode } from './reports-intelligence.dto';

/** Canonical section keys the UI renders and the exporters map over. */
export const SECTION_KEYS = [
  'executive_summary',
  'overall_status',
  'key_achievements',
  'challenges',
  'risks',
  'blockers',
  'recommendations',
  'notes',
  'track_notes',
  'management_attention',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_TITLES_AR: Record<SectionKey, string> = {
  executive_summary: 'الملخص التنفيذي',
  overall_status: 'الحالة العامة',
  key_achievements: 'أبرز الإنجازات',
  challenges: 'التحديات',
  risks: 'المخاطر',
  blockers: 'المعوقات والتأخيرات',
  recommendations: 'التوصيات',
  notes: 'ملاحظات مهمة',
  track_notes: 'ملخص حسب المسار',
  management_attention: 'بنود تستدعي اهتمام الإدارة',
};

const OUTPUT_MODE_SECTIONS: Record<OutputMode, SectionKey[]> = {
  [OutputMode.executive_summary]: [
    'executive_summary',
    'overall_status',
    'key_achievements',
    'risks',
    'recommendations',
    'management_attention',
  ],
  [OutputMode.detailed]: [
    'executive_summary',
    'overall_status',
    'key_achievements',
    'challenges',
    'risks',
    'blockers',
    'recommendations',
    'notes',
    'track_notes',
    'management_attention',
  ],
  [OutputMode.track_by_track]: [
    'executive_summary',
    'track_notes',
    'management_attention',
  ],
  [OutputMode.template_prep]: [
    'executive_summary',
    'key_achievements',
    'challenges',
    'recommendations',
    'track_notes',
  ],
  [OutputMode.custom]: [
    'executive_summary',
    'overall_status',
    'key_achievements',
    'challenges',
    'risks',
    'recommendations',
    'track_notes',
  ],
};

export function sectionsFor(mode: OutputMode): SectionKey[] {
  return OUTPUT_MODE_SECTIONS[mode] ?? OUTPUT_MODE_SECTIONS[OutputMode.detailed];
}

export interface NormalizedReport {
  id: string;
  trackName: string;
  type: string;
  dateIso: string;
  title: string;
  achievements?: string;
  kpiUpdates?: string;
  challenges?: string;
  supportNeeded?: string;
  upcomingTasks?: string;
  notes?: string;
  authorNameAr?: string;
}

/** Render one report into a compact, labelled block for the model. */
export function reportToBlock(r: NormalizedReport): string {
  const lines: string[] = [
    `— تقرير (${r.type}) | المسار: ${r.trackName} | التاريخ: ${r.dateIso.slice(0, 10)} | العنوان: ${r.title}`,
  ];
  if (r.achievements) lines.push(`الإنجازات:\n${r.achievements}`);
  if (r.kpiUpdates) lines.push(`مؤشرات الأداء:\n${r.kpiUpdates}`);
  if (r.challenges) lines.push(`التحديات:\n${r.challenges}`);
  if (r.supportNeeded) lines.push(`الدعم المطلوب:\n${r.supportNeeded}`);
  if (r.upcomingTasks) lines.push(`المهام القادمة:\n${r.upcomingTasks}`);
  if (r.notes) lines.push(`ملاحظات:\n${r.notes}`);
  return lines.join('\n');
}

function sectionsListForPrompt(sections: SectionKey[]): string {
  return sections.map((k) => `  - ${k}: "${SECTION_TITLES_AR[k]}"`).join('\n');
}

const BASE_SYSTEM_PROMPT = `أنت محلل تنفيذي متخصص في صياغة التقارير الإدارية لمنصة "رؤية".

مهمتك:
- قراءة مجموعة تقارير إدارية واستخلاص تقرير تنفيذي واحد بلغة عربية فصحى احترافية.
- دمج البنود المتشابهة، وإزالة التكرار، وحذف الحشو والعبارات الضعيفة.
- صياغة كل بند بأسلوب قيادي موجز ومباشر.
- **عدم اختلاق أي معلومة غير موجودة في المصادر.** إذا لم تتوفر معلومات لقسم معين، اترك نصه فارغاً.
- الالتزام بأسماء الأقسام المطلوبة بدقة.

قواعد المخرَج:
1. ردّ **بصيغة JSON صالحة فقط** — بدون أي شرح قبلها أو بعدها، وبدون علامات Markdown.
2. شكل المخرَج:
   { "sections": [ { "key": "<section_key>", "body": "<نص عربي>" }, ... ] }
3. استخدم الأقسام المطلوبة **بالترتيب** المذكور ودون إضافة أقسام أخرى.
4. النص داخل "body" نص عربي عادي (قد يحتوي على قوائم بأسطر جديدة أو "-"). لا تضع HTML أو JSON داخله.
5. إذا لم تتوفر معلومات لقسم، اجعل قيمته نصاً فارغاً "".

جودة الصياغة:
- لغة عربية تنفيذية فصحى، لا عامية.
- جمل قصيرة مباشرة، بدون تكرار.
- استخدم صياغات مثل "أُنجز"، "يُلاحظ"، "يوصى بـ"، "يستدعي الاهتمام"، وابتعد عن التعبيرات العاطفية.`;

const MODE_GUIDANCE: Record<OutputMode, string> = {
  [OutputMode.executive_summary]:
    'الأسلوب: تنفيذي مكثّف. الملخص التنفيذي 3–5 أسطر. كل قسم لا يتجاوز 6 أسطر. ركّز على ما يحتاجه متخذ القرار.',
  [OutputMode.detailed]:
    'الأسلوب: تقرير عملياتي مفصّل. حافظ على التفاصيل المهمة، ودمج المتشابه، واستعرض النقاط بقوائم عند الحاجة.',
  [OutputMode.track_by_track]:
    'الأسلوب: ملخص مقسّم حسب المسارات. قسم "track_notes" يجب أن يحتوي على ملخص لكل مسار على حدة بعنوان المسار في سطر ثم نقاطه تحته.',
  [OutputMode.template_prep]:
    'الأسلوب: مناسب للتعبئة في قوالب مستندات. صياغة مضغوطة يمكن إدراجها مباشرة في حقول نموذج.',
  [OutputMode.custom]:
    'الأسلوب: اتبع تعليمات المستخدم الإضافية مع الحفاظ على الصياغة التنفيذية الفصحى.',
};

export function buildSystemPrompt(
  mode: OutputMode,
  customInstructions?: string,
): string {
  const sections = sectionsFor(mode);
  const guidance = MODE_GUIDANCE[mode];
  const custom = customInstructions?.trim()
    ? `\nتعليمات إضافية من المستخدم (لا تتعارض مع القواعد أعلاه):\n${customInstructions.trim()}`
    : '';
  return `${BASE_SYSTEM_PROMPT}

الأقسام المطلوبة لهذا التقرير (بنفس الترتيب وبنفس المفاتيح):
${sectionsListForPrompt(sections)}

توجيه الأسلوب: ${guidance}${custom}`;
}

export function buildUserPrompt(blocks: string[]): string {
  const header =
    blocks.length === 0
      ? 'لا توجد تقارير ضمن المعايير المحددة.'
      : `عدد التقارير: ${blocks.length}.`;
  return `${header}

فيما يلي مصادر التقارير الخام. حلّلها وادمجها ثم أنتج JSON المطلوب:

${blocks.join('\n\n---\n\n')}`;
}

/** Prompt for regenerating a single section in isolation. */
export function buildSectionRegeneratePrompt(
  section: SectionKey,
  currentBody: string,
  mode: OutputMode,
  blocks: string[],
): { system: string; user: string } {
  const system = `${BASE_SYSTEM_PROMPT}

أعد صياغة قسم واحد فقط هو "${section}" (${SECTION_TITLES_AR[section]}).
توجيه الأسلوب: ${MODE_GUIDANCE[mode]}

ردّ بصيغة JSON بالشكل التالي بدون أي نص إضافي:
{ "section": "${section}", "body": "<نص عربي>" }`;
  const user = `الصياغة الحالية لهذا القسم (إن وُجدت) — لا تكررها حرفياً بل حسّنها:
${currentBody || '(فارغ)'}

المصادر الأصلية:

${blocks.join('\n\n---\n\n')}`;
  return { system, user };
}
