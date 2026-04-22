'use client';

/**
 * AI Invoice Analyzer — full-page flow:
 *   1. Upload zone (drag-drop PDF/image, 10MB cap).
 *   2. 4-phase progress while Claude Vision extracts + classifies.
 *   3. Editable preview with classification + risk + budget + duplicate cards.
 *   4. Confirm → promotes to a real CustodyInvoice via the existing service.
 *
 * Roles: admin, system_manager, pm, track_lead. Others see a 403 card —
 * the backend re-checks too, so client-side gating is for UX only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Upload,
  FileText,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  RotateCcw,
  ShieldCheck,
  FileWarning,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { aiInvoiceApi } from '@/lib/api';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 10 * 1024 * 1024;

const CATEGORY_OPTIONS = [
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
];

const PHASES = [
  'جارٍ رفع الفاتورة...',
  'يقوم الذكاء الاصطناعي بقراءة الفاتورة...',
  'استخراج البيانات وتصنيفها...',
  'تقييم المخاطر والتحقق من التكرار...',
];

type AnalyzeResult = {
  success: true;
  extractionId: string;
  fileUrl: string;
  extracted: {
    vendorName: string;
    vendorTaxNumber: string | null;
    invoiceNumber: string;
    invoiceDate: string;
    hijriDate: string | null;
    subtotal: number;
    vatAmount: number;
    vatPercentage: number;
    totalAmount: number;
    currency: 'SAR' | 'USD' | 'EUR' | 'AED';
    paymentMethod: string | null;
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    confidence: number;
  };
  classification: { suggestedCategory: string; reasoning: string };
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    score: number;
    flags: string[];
    reasoning: string;
  };
  duplicateCheck: {
    isDuplicate: boolean;
    similarInvoices: Array<{ id: string; vendor: string; amount: number; date: string; similarity: number }>;
  };
  budgetImpact: {
    currentBalance: number;
    afterDeduction: number;
    percentageUsed: number;
    alertLevel: 'ok' | 'warning' | 'critical';
  };
};

export default function AIInvoiceAnalyzerPage() {
  const router = useRouter();
  const { fundId } = useParams<{ fundId: string }>();
  const { user } = useAuth();

  const allowed =
    user?.role === 'admin' ||
    user?.role === 'system_manager' ||
    user?.role === 'pm' ||
    user?.role === 'track_lead';

  useEffect(() => {
    if (user && !allowed) router.replace('/support-services');
  }, [user, allowed, router]);

  // State machine: idle → uploading → ready → confirming → done | failed
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'ready' | 'confirming' | 'failed'>('idle');
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [edited, setEdited] = useState<AnalyzeResult['extracted'] | null>(null);
  const [category, setCategory] = useState<string>('أخرى');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    };
  }, []);

  const pickFile = useCallback((f: File) => {
    if (f.size > MAX_BYTES) {
      toast.error('حجم الملف يتجاوز 10 ميجابايت.');
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function analyze() {
    if (!file || phase === 'analyzing') return;
    setPhase('analyzing');
    setError(null);
    setPhaseIndex(0);
    // Visual phase ticker. Cosmetic only — real progress is server-side.
    phaseTimerRef.current = setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, PHASES.length - 1));
    }, 2500);

    try {
      const { data } = await aiInvoiceApi.analyze(fundId, file);
      const res = data as AnalyzeResult;
      setResult(res);
      setEdited(res.extracted);
      setCategory(res.classification.suggestedCategory);
      setPhase('ready');
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        'تعذّر تحليل الفاتورة. جرّب مرة أخرى أو أدخل البيانات يدوياً.';
      setError(msg);
      setPhase('failed');
      toast.error(msg);
    } finally {
      if (phaseTimerRef.current) {
        clearInterval(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }
    }
  }

  async function confirm() {
    if (!result || !edited) return;
    setPhase('confirming');
    try {
      await aiInvoiceApi.confirm(fundId, {
        extractionId: result.extractionId,
        editedData: edited,
        notes: notes.trim() || undefined,
        category,
      });
      toast.success('تم حفظ الفاتورة بنجاح');
      router.push('/support-services');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'فشل الحفظ';
      toast.error(msg);
      setPhase('ready');
    }
  }

  async function cancel() {
    if (result) {
      try { await aiInvoiceApi.cancel(fundId, result.extractionId); } catch { /* ignore */ }
    }
    resetAll();
  }

  function resetAll() {
    setFile(null);
    setResult(null);
    setEdited(null);
    setCategory('أخرى');
    setNotes('');
    setPhase('idle');
    setError(null);
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <ShieldCheck className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">لا تملك صلاحية استخدام هذه الأداة</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="glass p-5 rounded-2xl border border-white/10 flex items-start gap-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-brand-500/20 border border-white/10">
          <FileText className="w-5 h-5 text-emerald-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            تسجيل فاتورة بالذكاء الاصطناعي
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              تجريبي ✨
            </span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            ارفع صورة أو PDF للفاتورة، ويتولّى الذكاء الاصطناعي استخراج البيانات وتصنيفها وتقييم مخاطرها قبل الحفظ.
          </p>
        </div>
        <Link
          href="/support-services"
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1 shrink-0"
        >
          خدمات المساندة <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Upload / analyzing phase */}
      {phase === 'idle' || phase === 'analyzing' || phase === 'failed' ? (
        <div className="glass p-6 rounded-2xl border border-white/10">
          {phase === 'analyzing' ? (
            <AnalyzingView phaseIndex={phaseIndex} fileName={file?.name ?? ''} />
          ) : (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-emerald-500/60 bg-emerald-500/5'
                    : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickFile(f);
                  }}
                />
                <Upload className="w-8 h-8 text-emerald-300/80 mx-auto mb-3" />
                <p className="text-sm text-white font-medium">
                  اسحب الفاتورة هنا أو اضغط للاختيار
                </p>
                <p className="text-xs text-gray-500 mt-1.5">
                  PDF · PNG · JPG · WEBP — حد أقصى 10 ميجابايت
                </p>
              </div>

              {file && (
                <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <FileText className="w-4 h-4 text-emerald-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{file.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {(file.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-5">
                {file && (
                  <button
                    onClick={() => setFile(null)}
                    className="px-4 py-2 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-gray-300"
                  >
                    إلغاء
                  </button>
                )}
                <button
                  onClick={analyze}
                  disabled={!file}
                  className="px-5 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-2 font-medium"
                >
                  ابدأ التحليل <Upload className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Preview + edit */}
      {phase === 'ready' && result && edited && (
        <ReadyView
          result={result}
          edited={edited}
          setEdited={setEdited}
          category={category}
          setCategory={setCategory}
          notes={notes}
          setNotes={setNotes}
          onConfirm={confirm}
          onReset={cancel}
          confirming={false}
        />
      )}

      {phase === 'confirming' && result && edited && (
        <ReadyView
          result={result}
          edited={edited}
          setEdited={setEdited}
          category={category}
          setCategory={setCategory}
          notes={notes}
          setNotes={setNotes}
          onConfirm={() => {}}
          onReset={() => {}}
          confirming
        />
      )}
    </div>
  );
}

// ─── Sub views ─────────────────────────────────────────────────────────

function AnalyzingView({ phaseIndex, fileName }: { phaseIndex: number; fileName: string }) {
  return (
    <div className="py-12 text-center">
      <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
        <Loader2 className="w-8 h-8 text-emerald-300 animate-spin" />
      </div>
      <p className="text-sm text-white mb-2">{fileName}</p>
      <p className="text-base text-emerald-300 font-medium">{PHASES[phaseIndex]}</p>
      <div className="mt-6 max-w-md mx-auto space-y-2">
        {PHASES.map((p, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                i < phaseIndex
                  ? 'bg-emerald-500/30 text-emerald-200'
                  : i === phaseIndex
                  ? 'bg-emerald-500/20 text-emerald-300 animate-pulse'
                  : 'bg-white/5 text-gray-500'
              }`}
            >
              {i < phaseIndex ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
            </div>
            <span className={i <= phaseIndex ? 'text-gray-200' : 'text-gray-500'}>{p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadyView({
  result,
  edited,
  setEdited,
  category,
  setCategory,
  notes,
  setNotes,
  onConfirm,
  onReset,
  confirming,
}: {
  result: AnalyzeResult;
  edited: AnalyzeResult['extracted'];
  setEdited: (v: AnalyzeResult['extracted']) => void;
  category: string;
  setCategory: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onConfirm: () => void;
  onReset: () => void;
  confirming: boolean;
}) {
  const confPct = Math.round(edited.confidence * 100);
  const confColor =
    confPct >= 80
      ? 'bg-emerald-500'
      : confPct >= 60
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Main column */}
      <div className="xl:col-span-2 space-y-4">
        {/* Confidence bar */}
        <div className="glass p-4 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">ثقة النموذج في الاستخراج</span>
            <span className="text-xs text-white font-medium">{confPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full ${confColor} transition-all`} style={{ width: `${confPct}%` }} />
          </div>
        </div>

        {/* Editable form */}
        <div className="glass p-5 rounded-2xl border border-white/10 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-1">البيانات المستخرجة</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المورد / الجهة">
              <input
                value={edited.vendorName}
                onChange={(e) => setEdited({ ...edited, vendorName: e.target.value })}
                className="input-field w-full"
                dir="auto"
              />
            </Field>
            <Field label="الرقم الضريبي">
              <input
                value={edited.vendorTaxNumber ?? ''}
                onChange={(e) =>
                  setEdited({ ...edited, vendorTaxNumber: e.target.value || null })
                }
                className="input-field w-full"
                dir="ltr"
                placeholder="—"
              />
            </Field>
            <Field label="رقم الفاتورة">
              <input
                value={edited.invoiceNumber}
                onChange={(e) => setEdited({ ...edited, invoiceNumber: e.target.value })}
                className="input-field w-full"
                dir="ltr"
              />
            </Field>
            <Field label="تاريخ الفاتورة">
              <input
                type="date"
                value={edited.invoiceDate}
                onChange={(e) => setEdited({ ...edited, invoiceDate: e.target.value })}
                className="input-field w-full"
                dir="ltr"
              />
            </Field>
            <Field label="المبلغ قبل الضريبة">
              <input
                type="number"
                step="0.01"
                value={edited.subtotal}
                onChange={(e) =>
                  setEdited({ ...edited, subtotal: parseFloat(e.target.value) || 0 })
                }
                className="input-field w-full"
                dir="ltr"
              />
            </Field>
            <Field label="ضريبة القيمة المضافة">
              <input
                type="number"
                step="0.01"
                value={edited.vatAmount}
                onChange={(e) =>
                  setEdited({ ...edited, vatAmount: parseFloat(e.target.value) || 0 })
                }
                className="input-field w-full"
                dir="ltr"
              />
            </Field>
            <Field label="الإجمالي (شامل الضريبة)">
              <input
                type="number"
                step="0.01"
                value={edited.totalAmount}
                onChange={(e) =>
                  setEdited({ ...edited, totalAmount: parseFloat(e.target.value) || 0 })
                }
                className="input-field w-full font-semibold"
                dir="ltr"
              />
            </Field>
            <Field label="العملة">
              <select
                value={edited.currency}
                onChange={(e) =>
                  setEdited({ ...edited, currency: e.target.value as AnalyzeResult['extracted']['currency'] })
                }
                className="input-field w-full"
              >
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="USD">دولار (USD)</option>
                <option value="EUR">يورو (EUR)</option>
                <option value="AED">درهم (AED)</option>
              </select>
            </Field>
          </div>

          <Field label="ملاحظات إضافية (اختياري)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input-field w-full resize-y"
              placeholder="أي ملاحظات للتسجيل على الفاتورة..."
              dir="auto"
            />
          </Field>

          {/* Items mini-table */}
          {edited.items.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">البنود</label>
              <div className="rounded-xl border border-white/10 overflow-hidden text-xs">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/5 text-gray-400">
                  <div className="col-span-6">الوصف</div>
                  <div className="col-span-2 text-center">الكمية</div>
                  <div className="col-span-2 text-center">السعر</div>
                  <div className="col-span-2 text-center">الإجمالي</div>
                </div>
                {edited.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-white/5 text-gray-200">
                    <div className="col-span-6 truncate">{item.description}</div>
                    <div className="col-span-2 text-center">{item.quantity}</div>
                    <div className="col-span-2 text-center">{item.unitPrice.toFixed(2)}</div>
                    <div className="col-span-2 text-center font-medium">{item.total.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onReset}
            disabled={confirming}
            className="px-4 py-2 text-sm rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            إعادة رفع
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="px-5 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-2 font-medium"
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {confirming ? 'جارٍ الحفظ...' : 'تأكيد والحفظ'}
          </button>
        </div>
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        {/* Preview */}
        <div className="glass p-4 rounded-2xl border border-white/10">
          <label className="block text-xs text-gray-400 mb-2">معاينة الفاتورة</label>
          <a
            href={aiInvoiceApi.previewUrl(result.extractionId)}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-gray-400 hover:bg-white/5 transition-colors"
          >
            <FileText className="w-8 h-8 mx-auto mb-2 text-gray-500" />
            فتح الملف الأصلي في نافذة جديدة
          </a>
        </div>

        {/* Classification card */}
        <div className="glass p-4 rounded-2xl border border-white/10">
          <label className="block text-xs text-gray-400 mb-2">التصنيف المقترح</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field w-full text-sm"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {result.classification.reasoning && (
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              {result.classification.reasoning}
            </p>
          )}
        </div>

        {/* Risk card */}
        <RiskCard risk={result.riskAssessment} />

        {/* Budget card */}
        <BudgetCard budget={result.budgetImpact} invoiceAmount={edited.totalAmount} />

        {/* Duplicate card */}
        {result.duplicateCheck.similarInvoices.length > 0 && (
          <DuplicateCard dup={result.duplicateCheck} />
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function RiskCard({ risk }: { risk: AnalyzeResult['riskAssessment'] }) {
  const cfg =
    risk.level === 'high'
      ? { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', label: 'مخاطرة عالية' }
      : risk.level === 'medium'
      ? { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', label: 'مخاطرة متوسطة' }
      : { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', label: 'مخاطرة منخفضة' };
  return (
    <div className={`p-4 rounded-2xl border ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`w-4 h-4 ${cfg.text}`} />
          <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
        </div>
        <span className={`text-xs font-semibold ${cfg.text}`}>{risk.score}/100</span>
      </div>
      {risk.flags.length > 0 && (
        <ul className="text-xs text-gray-300 space-y-1 mb-2">
          {risk.flags.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-gray-500 mt-1">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {risk.reasoning && (
        <p className="text-xs text-gray-400 leading-relaxed">{risk.reasoning}</p>
      )}
    </div>
  );
}

function BudgetCard({
  budget,
  invoiceAmount,
}: {
  budget: AnalyzeResult['budgetImpact'];
  invoiceAmount: number;
}) {
  const cfg =
    budget.alertLevel === 'critical'
      ? { border: 'border-red-500/30', bar: 'bg-red-500', text: 'text-red-300', label: 'تجاوز حرج' }
      : budget.alertLevel === 'warning'
      ? { border: 'border-amber-500/30', bar: 'bg-amber-500', text: 'text-amber-300', label: 'تجاوز 80%' }
      : { border: 'border-white/10', bar: 'bg-emerald-500', text: 'text-emerald-300', label: 'ضمن الميزانية' };
  return (
    <div className={`glass p-4 rounded-2xl border ${cfg.border}`}>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-400">أثر الفاتورة على العهدة</label>
        <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="space-y-2 text-xs">
        <Row label="الرصيد الحالي" value={`${budget.currentBalance.toLocaleString('en-US')} ر.س`} />
        <Row label="مبلغ الفاتورة" value={`${invoiceAmount.toLocaleString('en-US')} ر.س`} />
        <Row label="الرصيد بعد الخصم" value={`${budget.afterDeduction.toLocaleString('en-US')} ر.س`} />
        <div className="h-2 rounded-full bg-white/5 overflow-hidden mt-2">
          <div
            className={`h-full ${cfg.bar} transition-all`}
            style={{ width: `${Math.min(100, budget.percentageUsed)}%` }}
          />
        </div>
        <div className="text-center text-[10px] text-gray-500">
          مستخدَم: {budget.percentageUsed}%
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100 font-medium">{value}</span>
    </div>
  );
}

function DuplicateCard({ dup }: { dup: AnalyzeResult['duplicateCheck'] }) {
  return (
    <div
      className={`p-4 rounded-2xl border ${
        dup.isDuplicate ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <FileWarning
          className={`w-4 h-4 ${dup.isDuplicate ? 'text-red-300' : 'text-amber-300'}`}
        />
        <span
          className={`text-sm font-medium ${dup.isDuplicate ? 'text-red-300' : 'text-amber-300'}`}
        >
          {dup.isDuplicate ? 'تكرار محتمل' : 'فواتير مشابهة'}
        </span>
      </div>
      <ul className="text-xs text-gray-200 space-y-1.5">
        {dup.similarInvoices.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {s.vendor} · {new Date(s.date).toLocaleDateString('en-GB')}
            </span>
            <span className="text-gray-400 font-medium shrink-0">
              {s.amount.toLocaleString('en-US')} ر.س · {(s.similarity * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
