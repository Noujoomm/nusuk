'use client';

/**
 * AI Batch Invoice Analyzer — full-page flow:
 *   1. Drag-drop 1–10 files (PDF / image, ≤10MB each, ≤100MB total).
 *   2. Pre-flight client-side validation with per-file removal.
 *   3. Parallel analysis on the server (Promise.allSettled — one failure
 *      can't kill the others).
 *   4. Editable review cards per success + retry/exclude per failure.
 *   5. Atomic save inside a Prisma transaction (all-or-nothing).
 *
 * Single-invoice flow (../ai-invoice) is unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { aiInvoiceApi } from '@/lib/api';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp';
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_FILES = 10;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

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

type Extracted = {
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
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  confidence: number;
};

type AnalysisResult = {
  success: true;
  extractionId: string;
  fileUrl: string;
  extracted: Extracted;
  classification: { suggestedCategory: string; reasoning: string };
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    score: number;
    flags: string[];
    reasoning: string;
  };
  duplicateCheck: {
    isDuplicate: boolean;
    similarInvoices: Array<{
      id: string;
      vendor: string;
      amount: number;
      date: string;
      similarity: number;
    }>;
  };
  budgetImpact: {
    currentBalance: number;
    afterDeduction: number;
    percentageUsed: number;
    alertLevel: 'ok' | 'warning' | 'critical';
  };
};

type ResultItem =
  | {
      index: number;
      status: 'success';
      fileName: string;
      fileSize: number;
      extractionId: string;
      fileUrl: string;
      analysisResult: AnalysisResult;
      processingTimeMs: number;
    }
  | {
      index: number;
      status: 'error';
      fileName: string;
      fileSize: number;
      error: {
        code: string;
        message: string;
        technical?: string;
        retryable: boolean;
      };
      processingTimeMs: number;
    };

type BatchResponse = {
  batchId: string;
  totalFiles: number;
  successCount: number;
  errorCount: number;
  totalProcessingTimeMs: number;
  results: ResultItem[];
};

type Phase = 'idle' | 'analyzing' | 'review' | 'saving' | 'done';

export default function AIBatchInvoicePage() {
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

  const [phase, setPhase] = useState<Phase>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [editedByIdx, setEditedByIdx] = useState<Record<number, Extracted>>({});
  const [categoryByIdx, setCategoryByIdx] = useState<Record<number, string>>({});
  const [notesByIdx, setNotesByIdx] = useState<Record<number, string>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [retrying, setRetrying] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup any in-flight request if the user navigates away.
  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Pre-flight validation ────────────────────────────────────────────

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const fileError = useCallback((f: File): string | null => {
    if (!ALLOWED_MIME.includes(f.type) && !ACCEPTED.split(',').some((ext) => f.name.toLowerCase().endsWith(ext))) {
      return 'نوع الملف غير مدعوم';
    }
    if (f.size > MAX_BYTES) return 'يتجاوز 10 ميجابايت';
    if (f.size === 0) return 'الملف فارغ';
    return null;
  }, []);

  const filesWithErrors = useMemo(
    () =>
      files.map((f, i) => ({
        index: i,
        file: f,
        validationError: fileError(f),
      })),
    [files, fileError],
  );
  const hasFileErrors = filesWithErrors.some((f) => f.validationError);
  const tooManyFiles = files.length > MAX_BATCH_FILES;
  const tooBigTotal = totalSize > MAX_TOTAL_BYTES;
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
    return new Set(
      Array.from(counts.entries())
        .filter(([, n]) => n > 1)
        .map(([name]) => name),
    );
  }, [files]);

  function addFiles(picked: File[]) {
    const merged = [...files, ...picked];
    if (merged.length > MAX_BATCH_FILES) {
      toast.error(`الحد الأقصى ${MAX_BATCH_FILES} فواتير دفعة واحدة.`);
    }
    setFiles(merged.slice(0, MAX_BATCH_FILES));
    setError(null);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const picked = Array.from(e.dataTransfer.files ?? []);
    if (picked.length) addFiles(picked);
  }

  // ── Analyze ──────────────────────────────────────────────────────────

  async function startAnalyze() {
    if (!files.length || phase === 'analyzing') return;
    if (hasFileErrors || tooManyFiles || tooBigTotal) {
      toast.error('بعض الملفات لا تستوفي الشروط — يرجى المعالجة قبل التحليل.');
      return;
    }
    setPhase('analyzing');
    setError(null);
    abortRef.current = new AbortController();
    try {
      const { data } = await aiInvoiceApi.batchAnalyze(fundId, files);
      const res = data as BatchResponse;
      setBatch(res);
      // Seed editable copies of each successful extraction.
      const eb: Record<number, Extracted> = {};
      const cb: Record<number, string> = {};
      const nb: Record<number, string> = {};
      for (const it of res.results) {
        if (it.status === 'success') {
          eb[it.index] = { ...it.analysisResult.extracted };
          cb[it.index] = it.analysisResult.classification.suggestedCategory;
          nb[it.index] = '';
        }
      }
      setEditedByIdx(eb);
      setCategoryByIdx(cb);
      setNotesByIdx(nb);
      setExcluded(new Set());
      setPhase('review');
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        'تعذّر تحليل الفواتير. حاول مرة أخرى أو قلّل عدد الملفات.';
      setError(msg);
      setPhase('idle');
      toast.error(msg);
    } finally {
      abortRef.current = null;
    }
  }

  function cancelInFlight() {
    abortRef.current?.abort();
    setPhase('idle');
    toast('تم إلغاء التحليل', { icon: 'ℹ️' });
  }

  // ── Retry a single failure ───────────────────────────────────────────

  async function retryOne(index: number) {
    if (!batch) return;
    setRetrying((s) => new Set(s).add(index));
    try {
      const { data } = await aiInvoiceApi.batchRetry(fundId, batch.batchId, [index]);
      const res = data as BatchResponse;
      setBatch(res);
      const it = res.results.find((r) => r.index === index);
      if (it && it.status === 'success') {
        setEditedByIdx((prev) => ({
          ...prev,
          [index]: { ...it.analysisResult.extracted },
        }));
        setCategoryByIdx((prev) => ({
          ...prev,
          [index]: it.analysisResult.classification.suggestedCategory,
        }));
        setNotesByIdx((prev) => ({ ...prev, [index]: prev[index] ?? '' }));
        toast.success('تمت إعادة التحليل بنجاح');
      } else if (it?.status === 'error') {
        toast.error(it.error.message);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'فشلت إعادة المحاولة');
    } finally {
      setRetrying((s) => {
        const n = new Set(s);
        n.delete(index);
        return n;
      });
    }
  }

  // ── Final save ───────────────────────────────────────────────────────

  function toggleExclude(index: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const readyIndices = useMemo(() => {
    if (!batch) return [];
    return batch.results
      .filter((r) => r.status === 'success' && !excluded.has(r.index))
      .map((r) => r.index);
  }, [batch, excluded]);

  async function saveAll() {
    if (!batch || readyIndices.length === 0) return;
    if (!confirm(`سيتم حفظ ${readyIndices.length} فاتورة. هل أنت متأكد؟`)) return;
    setPhase('saving');
    try {
      const { data } = await aiInvoiceApi.batchSave(fundId, {
        batchId: batch.batchId,
        invoices: readyIndices.map((idx) => ({
          index: idx,
          editedData: editedByIdx[idx],
          notes: (notesByIdx[idx] ?? '').trim() || undefined,
          category: categoryByIdx[idx],
        })),
      });
      const saved = (data?.savedCount ?? readyIndices.length) as number;
      toast.success(`تم حفظ ${saved} فاتورة بنجاح`);
      setPhase('done');
      router.push('/support-services');
      router.refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'فشل الحفظ');
      setPhase('review');
    }
  }

  async function discardBatch() {
    if (!batch) {
      resetAll();
      return;
    }
    if (!confirm('سيتم إلغاء جميع نتائج التحليل. هل أنت متأكد؟')) return;
    try {
      await aiInvoiceApi.batchDiscard(fundId, batch.batchId);
    } catch {
      /* ignore */
    }
    resetAll();
  }

  function resetAll() {
    setPhase('idle');
    setFiles([]);
    setBatch(null);
    setEditedByIdx({});
    setCategoryByIdx({});
    setNotesByIdx({});
    setExcluded(new Set());
    setError(null);
  }

  // ── Render ───────────────────────────────────────────────────────────

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
    <div className="space-y-5 pb-32" dir="rtl">
      {/* Header */}
      <div className="glass p-5 rounded-2xl border border-white/10 flex items-start gap-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-brand-500/20 border border-white/10">
          <FileText className="w-5 h-5 text-emerald-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            تسجيل فواتير بالذكاء الاصطناعي
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              دفعة ✨
            </span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            ارفع من 1 إلى {MAX_BATCH_FILES} فواتير (PDF أو صور)، ويتولّى الذكاء
            الاصطناعي استخراج البيانات وتصنيفها وتقييم مخاطرها قبل الحفظ.
          </p>
        </div>
        <Link
          href="/support-services"
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1 shrink-0"
        >
          خدمات المساندة <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Upload phase */}
      {phase === 'idle' && (
        <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
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
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length) addFiles(picked);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
            <Upload className="w-8 h-8 text-emerald-300/80 mx-auto mb-3" />
            <p className="text-sm text-white font-medium">
              اسحب الفواتير هنا أو اضغط للاختيار
            </p>
            <p className="text-xs text-gray-500 mt-1.5">
              PDF · PNG · JPG · WEBP — حد أقصى 10 ميجابايت لكل ملف · حتى{' '}
              {MAX_BATCH_FILES} فواتير
            </p>
          </div>

          {/* Selected files preview */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-gray-400">
                  {files.length} ملف · {(totalSize / (1024 * 1024)).toFixed(1)}{' '}
                  ميجابايت إجمالاً
                </span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-gray-500 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> إفراغ القائمة
                </button>
              </div>
              {filesWithErrors.map(({ file, validationError }, i) => (
                <FilePreviewRow
                  key={`${file.name}-${i}`}
                  file={file}
                  duplicateName={duplicateNames.has(file.name)}
                  validationError={validationError}
                  onRemove={() => removeFile(i)}
                />
              ))}
              {tooManyFiles && (
                <div className="text-xs text-red-300 px-1">
                  لا يمكن تحليل أكثر من {MAX_BATCH_FILES} فواتير دفعة واحدة.
                </div>
              )}
              {tooBigTotal && (
                <div className="text-xs text-red-300 px-1">
                  إجمالي حجم الملفات يتجاوز 100 ميجابايت.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> إضافة ملفات
            </button>
            <button
              onClick={startAnalyze}
              disabled={
                files.length === 0 ||
                hasFileErrors ||
                tooManyFiles ||
                tooBigTotal
              }
              className="px-5 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-2 font-medium"
            >
              ابدأ التحليل ({files.length}{' '}
              {files.length === 1 ? 'فاتورة' : 'فواتير'}) <Upload className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Analyzing phase */}
      {phase === 'analyzing' && (
        <AnalyzingView files={files} onCancel={cancelInFlight} />
      )}

      {/* Review phase — cards grid + sticky save bar */}
      {(phase === 'review' || phase === 'saving') && batch && (
        <ReviewView
          batch={batch}
          editedByIdx={editedByIdx}
          setEditedByIdx={setEditedByIdx}
          categoryByIdx={categoryByIdx}
          setCategoryByIdx={setCategoryByIdx}
          notesByIdx={notesByIdx}
          setNotesByIdx={setNotesByIdx}
          excluded={excluded}
          onToggleExclude={toggleExclude}
          retrying={retrying}
          onRetry={retryOne}
          onSave={saveAll}
          onDiscard={discardBatch}
          saving={phase === 'saving'}
          readyCount={readyIndices.length}
        />
      )}
    </div>
  );
}

// ─── Sub views ───────────────────────────────────────────────────────

function FilePreviewRow({
  file,
  validationError,
  duplicateName,
  onRemove,
}: {
  file: File;
  validationError: string | null;
  duplicateName: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${
        validationError
          ? 'bg-red-500/5 border-red-500/30'
          : 'bg-white/5 border-white/10'
      }`}
    >
      <FileText
        className={`w-4 h-4 shrink-0 ${
          validationError ? 'text-red-300' : 'text-emerald-300'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{file.name}</div>
        <div className="text-[10px] text-gray-500 flex items-center gap-2">
          <span>{(file.size / 1024).toFixed(0)} KB</span>
          {duplicateName && (
            <span className="text-amber-400">· اسم مكرر</span>
          )}
          {validationError && (
            <span className="text-red-300">· {validationError}</span>
          )}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"
        aria-label="إزالة"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function AnalyzingView({
  files,
  onCancel,
}: {
  files: File[];
  onCancel: () => void;
}) {
  return (
    <div className="glass p-8 rounded-2xl border border-white/10">
      <div className="text-center mb-6">
        <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-3">
          <Loader2 className="w-7 h-7 text-emerald-300 animate-spin" />
        </div>
        <p className="text-base text-emerald-300 font-medium">
          يجري تحليل {files.length} فاتورة بالتوازي...
        </p>
        <p className="text-xs text-gray-500 mt-1">
          نستخدم Claude Vision على كل فاتورة على حدة. قد يستغرق هذا حتى 30 ثانية
          للدفعة الكاملة.
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-2">
        {files.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs"
          >
            <Loader2 className="w-3.5 h-3.5 text-emerald-300 animate-spin shrink-0" />
            <span className="flex-1 truncate text-gray-200">{f.name}</span>
            <span className="text-gray-500">
              {(f.size / 1024).toFixed(0)} KB
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-gray-300"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}

function ReviewView(props: {
  batch: BatchResponse;
  editedByIdx: Record<number, Extracted>;
  setEditedByIdx: React.Dispatch<React.SetStateAction<Record<number, Extracted>>>;
  categoryByIdx: Record<number, string>;
  setCategoryByIdx: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  notesByIdx: Record<number, string>;
  setNotesByIdx: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  excluded: Set<number>;
  onToggleExclude: (idx: number) => void;
  retrying: Set<number>;
  onRetry: (idx: number) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
  readyCount: number;
}) {
  const { batch } = props;

  // Errors first, then successes — ordered by index within each group.
  const sorted = useMemo(() => {
    const errs = batch.results.filter((r) => r.status === 'error');
    const oks = batch.results.filter((r) => r.status === 'success');
    return [...errs, ...oks].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'error' ? -1 : 1;
      return a.index - b.index;
    });
  }, [batch.results]);

  return (
    <>
      {/* Summary */}
      <div className="glass p-4 rounded-2xl border border-white/10 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2 text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-medium">{batch.successCount}</span>
          <span className="text-gray-400">ناجحة</span>
        </div>
        {batch.errorCount > 0 && (
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">{batch.errorCount}</span>
            <span className="text-gray-400">فاشلة</span>
          </div>
        )}
        <div className="text-xs text-gray-500 mr-auto">
          {(batch.totalProcessingTimeMs / 1000).toFixed(1)} ثانية للتحليل
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sorted.map((it) => (
          <ResultCard
            key={`${it.status}-${it.index}`}
            item={it}
            edited={props.editedByIdx[it.index]}
            setEdited={(v) =>
              props.setEditedByIdx((prev) => ({ ...prev, [it.index]: v }))
            }
            category={props.categoryByIdx[it.index]}
            setCategory={(c) =>
              props.setCategoryByIdx((prev) => ({ ...prev, [it.index]: c }))
            }
            notes={props.notesByIdx[it.index] ?? ''}
            setNotes={(n) =>
              props.setNotesByIdx((prev) => ({ ...prev, [it.index]: n }))
            }
            excluded={props.excluded.has(it.index)}
            onToggleExclude={() => props.onToggleExclude(it.index)}
            retrying={props.retrying.has(it.index)}
            onRetry={() => props.onRetry(it.index)}
          />
        ))}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-4 inset-x-0 mx-auto max-w-3xl px-4 z-40">
        <div className="glass rounded-2xl border border-emerald-500/30 bg-emerald-950/50 backdrop-blur-md p-3 flex items-center gap-3">
          <span className="text-sm text-gray-200 flex-1">
            <span className="font-semibold text-white">{props.readyCount}</span>
            <span className="text-gray-400"> من </span>
            <span className="font-semibold text-white">
              {batch.totalFiles}
            </span>{' '}
            فاتورة جاهزة للحفظ
            {batch.errorCount > 0 && (
              <span className="text-red-400">
                {' '}
                · {batch.errorCount} فاشلة
              </span>
            )}
          </span>
          <button
            onClick={props.onDiscard}
            disabled={props.saving}
            className="px-3 py-2 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-50"
          >
            إلغاء الدفعة
          </button>
          <button
            onClick={props.onSave}
            disabled={props.readyCount === 0 || props.saving}
            className="px-5 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-2 font-medium"
          >
            {props.saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> جارٍ الحفظ...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> حفظ {props.readyCount} فاتورة
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function ResultCard(props: {
  item: ResultItem;
  edited: Extracted | undefined;
  setEdited: (v: Extracted) => void;
  category: string | undefined;
  setCategory: (c: string) => void;
  notes: string;
  setNotes: (n: string) => void;
  excluded: boolean;
  onToggleExclude: () => void;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { item } = props;

  if (item.status === 'error') {
    return (
      <div className="glass p-4 rounded-2xl border border-red-500/30 bg-red-500/5 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-300 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{item.fileName}</div>
            <div className="text-xs text-red-300 mt-0.5">
              {item.error.message}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              رمز الخطأ: {item.error.code}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {item.error.retryable && (
            <button
              onClick={props.onRetry}
              disabled={props.retrying}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white flex items-center gap-1.5"
            >
              {props.retrying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              إعادة المحاولة
            </button>
          )}
        </div>
      </div>
    );
  }

  // Success card
  const edited = props.edited;
  const result = item.analysisResult;
  const confPct = Math.round((edited?.confidence ?? 0) * 100);
  const confColor =
    confPct >= 80
      ? 'bg-emerald-500'
      : confPct >= 60
      ? 'bg-amber-500'
      : 'bg-red-500';
  const riskCfg =
    result.riskAssessment.level === 'high'
      ? { text: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', label: 'مخاطرة عالية' }
      : result.riskAssessment.level === 'medium'
      ? { text: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', label: 'مخاطرة متوسطة' }
      : { text: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', label: 'مخاطرة منخفضة' };

  if (!edited) return null;

  return (
    <div
      className={`glass rounded-2xl border ${
        props.excluded
          ? 'border-white/5 opacity-50'
          : 'border-white/10'
      } overflow-hidden`}
    >
      <div className="p-4 border-b border-white/5 flex items-start gap-3">
        <FileText className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">{item.fileName}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${riskCfg.bg} ${riskCfg.text} border`}>
              <ShieldAlert className="w-3 h-3 inline -mt-0.5 ml-0.5" />{' '}
              {riskCfg.label}
            </span>
            <a
              href={aiInvoiceApi.previewUrl(item.extractionId)}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-gray-400 hover:text-emerald-300 flex items-center gap-0.5"
            >
              معاينة <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">ثقة النموذج</span>
          <span className="text-[10px] text-gray-300 font-medium">{confPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full ${confColor} transition-all`}
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>

      {/* Editable fields */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <SmallField label="المورد">
          <input
            value={edited.vendorName}
            onChange={(e) =>
              props.setEdited({ ...edited, vendorName: e.target.value })
            }
            className="input-field w-full text-xs"
            dir="auto"
          />
        </SmallField>
        <SmallField label="رقم الفاتورة">
          <input
            value={edited.invoiceNumber}
            onChange={(e) =>
              props.setEdited({ ...edited, invoiceNumber: e.target.value })
            }
            className="input-field w-full text-xs"
            dir="ltr"
          />
        </SmallField>
        <SmallField label="التاريخ">
          <input
            type="date"
            value={edited.invoiceDate}
            onChange={(e) =>
              props.setEdited({ ...edited, invoiceDate: e.target.value })
            }
            className="input-field w-full text-xs"
            dir="ltr"
          />
        </SmallField>
        <SmallField label="الرقم الضريبي">
          <input
            value={edited.vendorTaxNumber ?? ''}
            onChange={(e) =>
              props.setEdited({
                ...edited,
                vendorTaxNumber: e.target.value || null,
              })
            }
            className="input-field w-full text-xs"
            dir="ltr"
            placeholder="—"
          />
        </SmallField>
        <SmallField label="قبل الضريبة">
          <input
            type="number"
            step="0.01"
            value={edited.subtotal}
            onChange={(e) =>
              props.setEdited({
                ...edited,
                subtotal: parseFloat(e.target.value) || 0,
              })
            }
            className="input-field w-full text-xs"
            dir="ltr"
          />
        </SmallField>
        <SmallField label="القيمة المضافة">
          <input
            type="number"
            step="0.01"
            value={edited.vatAmount}
            onChange={(e) =>
              props.setEdited({
                ...edited,
                vatAmount: parseFloat(e.target.value) || 0,
              })
            }
            className="input-field w-full text-xs"
            dir="ltr"
          />
        </SmallField>
        <SmallField label="الإجمالي">
          <input
            type="number"
            step="0.01"
            value={edited.totalAmount}
            onChange={(e) =>
              props.setEdited({
                ...edited,
                totalAmount: parseFloat(e.target.value) || 0,
              })
            }
            className="input-field w-full text-xs font-semibold"
            dir="ltr"
          />
        </SmallField>
        <SmallField label="التصنيف">
          <select
            value={props.category ?? 'أخرى'}
            onChange={(e) => props.setCategory(e.target.value)}
            className="input-field w-full text-xs"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </SmallField>
      </div>

      {/* Risk flags + duplicate warning */}
      {(result.riskAssessment.flags.length > 0 ||
        result.duplicateCheck.similarInvoices.length > 0) && (
        <div className="px-4 pb-3 space-y-2">
          {result.riskAssessment.flags.length > 0 && (
            <div className={`p-2 rounded-lg text-[11px] ${riskCfg.bg} border ${riskCfg.text}`}>
              <div className="font-medium mb-1">عوامل المخاطرة</div>
              <ul className="space-y-0.5 text-gray-200">
                {result.riskAssessment.flags.slice(0, 4).map((f, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-gray-500">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.duplicateCheck.similarInvoices.length > 0 && (
            <div
              className={`p-2 rounded-lg text-[11px] border ${
                result.duplicateCheck.isDuplicate
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <div className="font-medium mb-1">
                {result.duplicateCheck.isDuplicate
                  ? 'تكرار محتمل'
                  : 'فواتير مشابهة'}
              </div>
              <ul className="space-y-0.5 text-gray-200">
                {result.duplicateCheck.similarInvoices.slice(0, 3).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{s.vendor}</span>
                    <span className="text-gray-400">
                      {s.amount.toLocaleString('en-US')} ر.س ·{' '}
                      {(s.similarity * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="px-4 pb-3">
        <SmallField label="ملاحظات (اختياري)">
          <textarea
            value={props.notes}
            onChange={(e) => props.setNotes(e.target.value)}
            rows={1}
            className="input-field w-full text-xs resize-y"
            dir="auto"
          />
        </SmallField>
      </div>

      {/* Footer actions */}
      <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={!props.excluded}
            onChange={props.onToggleExclude}
            className="rounded border-white/20 bg-white/5"
          />
          جاهزة للحفظ
        </label>
        <button
          onClick={props.onToggleExclude}
          className="text-xs text-gray-500 hover:text-red-300 flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          {props.excluded ? 'إعادة الإدراج' : 'استبعاد'}
        </button>
      </div>
    </div>
  );
}

function SmallField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
