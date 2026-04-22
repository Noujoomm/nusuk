/**
 * Combined classification + risk-assessment prompt. The two tasks share the
 * same input (extracted invoice) and are independent, so we merge them into
 * one Claude call to save tokens and latency.
 */

export const CATEGORY_OPTIONS = [
  'اشتراك منصة',
  'غذاء موظفين',
  'شراء معدات',
  'خدمات صيانة',
  'وقود ومواصلات',
  'قرطاسية ومستلزمات مكتبية',
  'استضافة وضيافة',
  'اتصالات',
  'تدريب وتطوير',
  'أخرى',
] as const;

export type InvoiceCategory = (typeof CATEGORY_OPTIONS)[number];

export const CLASSIFICATION_RISK_SYSTEM_PROMPT = `أنت مدقق مالي محترف. لديك بيانات فاتورة مُستخرجة + سياق العهدة. مهمتك:
(أ) تصنيف الفاتورة إلى واحدة فقط من الفئات المعتمدة.
(ب) تقييم مستوى المخاطرة.

الفئات المعتمدة (اختر واحدة فقط بالنص الحرفي):
${CATEGORY_OPTIONS.map((c) => `- ${c}`).join('\n')}

معايير تقييم المخاطرة:
- high: مبلغ يتجاوز 50% من رصيد العهدة، أو فاتورة أقدم من 90 يوماً، أو حقول حرجة مفقودة (رقم الفاتورة، إجمالي، تاريخ)، أو مستوى ثقة استخراج < 0.6.
- medium: المبلغ يتجاوز ضعف متوسط فواتير العهدة، أو مورد جديد لم يتعامل مع العهدة، أو رقم ضريبي مفقود على فاتورة > 1000 ر.س.
- low: فاتورة عادية مستوفاة.

score: رقم 0-100 حيث 0 آمن تماماً و100 خطر قصوى.
flags: مصفوفة نصوص عربية قصيرة تصف كل عامل خطر تم رصده (كل flag سطر واحد موجز).
reasoning: جملتان على الأكثر تشرحان لماذا اخترت هذا المستوى.

**ردّك JSON فقط بهذا الشكل، بدون شرح أو markdown:**
{
  "suggestedCategory": "<اسم الفئة>",
  "categoryReasoning": "<سطر عربي واحد>",
  "risk": {
    "level": "low" | "medium" | "high",
    "score": <0-100>,
    "flags": ["..."],
    "reasoning": "<جملتان عربيتان>"
  }
}`;

export function buildClassificationRiskUserPrompt(input: {
  extracted: Record<string, unknown>;
  historicalCategories: string[];
  currentBalance: number;
  averageInvoice: number;
  daysOld: number;
  isNewVendor: boolean;
}): string {
  return `بيانات الفاتورة المستخرجة:
${JSON.stringify(input.extracted, null, 2)}

سياق العهدة:
- رصيد العهدة الحالي: ${input.currentBalance} ر.س
- متوسط فواتير هذه العهدة: ${input.averageInvoice} ر.س
- عمر الفاتورة (أيام): ${input.daysOld}
- مورد جديد على العهدة؟ ${input.isNewVendor ? 'نعم' : 'لا'}
- تصنيفات سابقة على نفس العهدة (للاتساق): ${input.historicalCategories.length ? input.historicalCategories.join('، ') : '(لا توجد بعد)'}

أعد JSON وفق الصيغة المطلوبة.`;
}
