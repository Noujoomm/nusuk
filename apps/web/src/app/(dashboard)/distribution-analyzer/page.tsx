'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { distributionAnalyzerApi } from '@/lib/api';

type SessionStatus = 'PENDING' | 'PARSING' | 'EXTRACTING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type CenterCode = 'makkah' | 'madinah' | 'shared';

interface RowComparison {
  rowIdentifier: string;
  gregorianDate: string;
  center: CenterCode | null;
  fieldName?: string;
  fieldLabel?: string;
  extractedValue: string | number | null;
  platformValue: string | number | null;
  difference: number | null;
  percentDifference: number | null;
  severity: Severity;
  type: 'VALUE_MISMATCH' | 'MISSING_IN_PLATFORM' | 'MISSING_IN_UPLOAD';
}

interface ComparisonResult {
  matchPercentage: number;
  totalRows: number;
  matchedRows: number;
  mismatchedRows: number;
  rowComparisons: RowComparison[];
  totals: {
    extracted: { companies?: number; parcels?: number; totalCards?: number; batches?: number };
    platform: { companies?: number; parcels?: number; totalCards?: number; batches?: number };
  };
}

interface SessionData {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: SessionStatus;
  matchPercentage: number | null;
  totalRows: number | null;
  matchedRows: number | null;
  mismatchedRows: number | null;
  comparisonResult: ComparisonResult | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  centerFilter: string | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}

interface SessionListItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: SessionStatus;
  matchPercentage: number | null;
  totalRows: number | null;
  createdAt: string;
}

const CENTER_LABEL: Record<CenterCode, string> = {
  makkah: 'مكة المكرمة',
  madinah: 'المدينة المنورة',
  shared: 'مشترك',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'حرج',
  HIGH: 'عالٍ',
  MEDIUM: 'متوسط',
  LOW: 'منخفض',
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  PENDING: 'في الانتظار',
  PARSING: 'قراءة الملف',
  EXTRACTING: 'استخراج البيانات',
  ANALYZING: 'مطابقة البيانات',
  COMPLETED: 'مكتمل',
  FAILED: 'فشل',
};

export default function DistributionAnalyzerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [centerFilter, setCenterFilter] = useState<'makkah' | 'madinah' | 'all'>('all');
  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');

  const [working, setWorking] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [history, setHistory] = useState<SessionListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const onPickFile = useCallback((f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    if (f && f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  }, [preview]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await distributionAnalyzerApi.list({ limit: 20 });
      setHistory(res.data.data || []);
    } catch {
      // silent — history is auxiliary
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const runFullAnalysis = async () => {
    if (!file) {
      toast.error('اختر ملفاً أولاً');
      return;
    }
    setWorking(true);
    setSession(null);
    const tid = toast.loading('رفع الملف…');
    try {
      const up = await distributionAnalyzerApi.upload(file, {
        centerFilter,
        dateRangeStart: dateRangeStart || undefined,
        dateRangeEnd: dateRangeEnd || undefined,
      });
      const sessionId = up.data.sessionId as string;
      toast.loading('جارٍ تشغيل التحليل بالذكاء الاصطناعي…', { id: tid });
      const res = await distributionAnalyzerApi.analyze(sessionId);
      setSession(res.data as SessionData);
      toast.success('تم التحليل ✨', { id: tid });
      loadHistory();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'فشل التحليل', { id: tid });
    } finally {
      setWorking(false);
    }
  };

  const openSession = async (id: string) => {
    setWorking(true);
    try {
      const res = await distributionAnalyzerApi.get(id);
      setSession(res.data as SessionData);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error('فشل تحميل الجلسة');
    } finally {
      setWorking(false);
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm('حذف الجلسة نهائياً؟')) return;
    try {
      await distributionAnalyzerApi.delete(id);
      toast.success('تم الحذف');
      if (session?.id === id) setSession(null);
      loadHistory();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <Header />

      <UploadCard
        file={file}
        preview={preview}
        centerFilter={centerFilter}
        dateRangeStart={dateRangeStart}
        dateRangeEnd={dateRangeEnd}
        working={working}
        onPickFile={onPickFile}
        onCenterChange={setCenterFilter}
        onDateStart={setDateRangeStart}
        onDateEnd={setDateRangeEnd}
        onRun={runFullAnalysis}
      />

      {session && <SessionResult session={session} onRefresh={() => openSession(session.id)} />}

      <HistoryCard
        items={history}
        loading={historyLoading}
        onOpen={openSession}
        onDelete={deleteSession}
        onRefresh={loadHistory}
      />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-slate-900/40 to-transparent p-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <Sparkles className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">المحلل الذكي لمسار التوزيع</h1>
          <p className="mt-1 text-sm text-slate-400">
            ارفع صورة أو Excel لجدول "نسبة الإنجاز" وسيقارنها الذكاء الاصطناعي مع البيانات الرسمية في
            منصة رؤية ويحدد الفروقات حسب التاريخ والمركز.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Upload card ─────────────────────────────────────────────────────────

function UploadCard(props: {
  file: File | null;
  preview: string | null;
  centerFilter: 'makkah' | 'madinah' | 'all';
  dateRangeStart: string;
  dateRangeEnd: string;
  working: boolean;
  onPickFile: (f: File | null) => void;
  onCenterChange: (c: 'makkah' | 'madinah' | 'all') => void;
  onDateStart: (s: string) => void;
  onDateEnd: (s: string) => void;
  onRun: () => void;
}) {
  const [drag, setDrag] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) props.onPickFile(f);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          drag ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/15 bg-white/[0.02]'
        }`}
      >
        <Upload className="h-10 w-10 text-emerald-400" />
        <h3 className="text-lg font-bold text-white">اسحب الملف هنا أو اختر</h3>
        <p className="text-xs text-slate-400">صورة (JPG/PNG/WEBP) أو Excel/CSV — حتى 20 ميجابايت</p>
        <label className="cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20">
          اختيار ملف
          <input
            type="file"
            className="hidden"
            accept="image/*,.xlsx,.xls,.csv,.pdf"
            onChange={(e) => props.onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {props.file && (
          <div className="mt-4 flex w-full max-w-md items-start gap-3 rounded-lg bg-slate-900/60 p-3 text-right">
            <FileBadge mime={props.file.type} />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm text-white">{props.file.name}</div>
              <div className="text-[11px] text-slate-400">
                {(props.file.size / 1024).toFixed(1)} كيلوبايت
              </div>
            </div>
            <button
              onClick={() => props.onPickFile(null)}
              className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"
              title="إزالة"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {props.preview && (
          <img
            src={props.preview}
            alt="معاينة"
            className="mt-2 max-h-72 max-w-full rounded-lg border border-white/10"
          />
        )}
      </div>

      {/* Filters */}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="من تاريخ">
          <input
            type="date"
            value={props.dateRangeStart}
            onChange={(e) => props.onDateStart(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="إلى تاريخ">
          <input
            type="date"
            value={props.dateRangeEnd}
            onChange={(e) => props.onDateEnd(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="المركز">
          <select
            value={props.centerFilter}
            onChange={(e) => props.onCenterChange(e.target.value as any)}
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
          >
            <option value="all">الكل</option>
            <option value="makkah">مكة المكرمة</option>
            <option value="madinah">المدينة المنورة</option>
          </select>
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          onClick={props.onRun}
          disabled={!props.file || props.working}
          className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-5 py-2.5 text-sm font-bold text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40"
        >
          {props.working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {props.working ? 'جارٍ التحليل…' : 'بدء التحليل'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function FileBadge({ mime }: { mime: string }) {
  const Icon = mime.startsWith('image/')
    ? FileImage
    : mime.includes('spreadsheet') || mime.includes('csv') || mime.includes('excel')
    ? FileSpreadsheet
    : FileText;
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/30">
      <Icon className="h-4 w-4 text-emerald-300" />
    </div>
  );
}

// ─── Result panel ────────────────────────────────────────────────────────

function SessionResult({ session, onRefresh }: { session: SessionData; onRefresh: () => void }) {
  const cmp = session.comparisonResult;
  const matchPct = session.matchPercentage ?? 0;
  const matchColor = matchPct >= 95 ? 'emerald' : matchPct >= 80 ? 'amber' : 'red';

  if (session.status === 'FAILED') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <h3 className="text-base font-bold text-red-300">فشل التحليل</h3>
        </div>
        <p className="mt-2 text-sm text-slate-300">{session.errorMessage || 'حدث خطأ غير متوقع'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="نسبة المطابقة" value={`${matchPct.toFixed(1)}%`} color={matchColor} />
        <Kpi label="إجمالي الصفوف" value={`${session.totalRows ?? 0}`} color="slate" />
        <Kpi label="مطابق" value={`${session.matchedRows ?? 0}`} color="emerald" />
        <Kpi label="فروقات" value={`${session.mismatchedRows ?? 0}`} color="amber" />
      </div>

      {/* Totals comparison */}
      {cmp && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-3 text-base font-bold text-white">إجماليات الفترة</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-xs text-slate-400">
                  <th className="px-3 py-2 font-normal">الحقل</th>
                  <th className="px-3 py-2 font-normal">الملف المرفوع</th>
                  <th className="px-3 py-2 font-normal">منصة رؤية</th>
                  <th className="px-3 py-2 font-normal">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {(['companies', 'parcels', 'totalCards', 'batches'] as const).map((k) => {
                  const ex = cmp.totals.extracted[k] ?? null;
                  const pf = cmp.totals.platform[k] ?? null;
                  const diff = ex != null && pf != null ? ex - pf : null;
                  const labels = {
                    companies: 'الشركات',
                    parcels: 'الطرود',
                    totalCards: 'البطاقات',
                    batches: 'الشحنات',
                  };
                  return (
                    <tr key={k} className="border-t border-white/5">
                      <td className="px-3 py-2 text-slate-200">{labels[k]}</td>
                      <td className="px-3 py-2 tabular-nums text-white">{fmt(ex)}</td>
                      <td className="px-3 py-2 tabular-nums text-white">{fmt(pf)}</td>
                      <td
                        className={`px-3 py-2 tabular-nums ${
                          diff === 0 ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {diff === null ? '—' : diff === 0 ? '✓' : (diff > 0 ? '+' : '') + diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Discrepancies */}
      {cmp && cmp.rowComparisons.length > 0 && <DiscrepanciesTable rows={cmp.rowComparisons} />}

      {cmp && cmp.rowComparisons.length === 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          <span>تطابق تام بين البيانات المرفوعة وما هو مسجّل في منصة رؤية ضمن الفترة المحددة.</span>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: 'emerald' | 'amber' | 'red' | 'slate' }) {
  const cls = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-300',
    slate: 'border-white/10 bg-white/5 text-slate-300',
  }[color];
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-2xl font-bold tabular-nums text-white">{value}</div>
      <div className="mt-1 text-[11px] opacity-90">{label}</div>
    </div>
  );
}

function DiscrepanciesTable({ rows }: { rows: RowComparison[] }) {
  // Sort: severity (CRITICAL first) → date.
  const sevOrder: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = useMemo(
    () => [...rows].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.gregorianDate.localeCompare(b.gregorianDate)),
    [rows],
  );
  const summary = useMemo(() => {
    const acc: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    rows.forEach((r) => (acc[r.severity] += 1));
    return acc;
  }, [rows]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-white">الفروقات والتنبيهات</h3>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <SevBadge sev="CRITICAL" count={summary.CRITICAL} />
          <SevBadge sev="HIGH" count={summary.HIGH} />
          <SevBadge sev="MEDIUM" count={summary.MEDIUM} />
          <SevBadge sev="LOW" count={summary.LOW} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="text-[11px] text-slate-400">
              <th className="px-2 py-2 font-normal">التاريخ</th>
              <th className="px-2 py-2 font-normal">المركز</th>
              <th className="px-2 py-2 font-normal">الحقل</th>
              <th className="px-2 py-2 font-normal">المرفوع</th>
              <th className="px-2 py-2 font-normal">المنصة</th>
              <th className="px-2 py-2 font-normal">الفرق</th>
              <th className="px-2 py-2 font-normal">الشدة</th>
              <th className="px-2 py-2 font-normal">النوع</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((r, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-2 py-2 tabular-nums text-slate-200">{r.gregorianDate || '—'}</td>
                <td className="px-2 py-2 text-slate-200">{r.center ? CENTER_LABEL[r.center] : '—'}</td>
                <td className="px-2 py-2 text-slate-200">{r.fieldLabel ?? '—'}</td>
                <td className="px-2 py-2 tabular-nums text-white">{fmt(r.extractedValue)}</td>
                <td className="px-2 py-2 tabular-nums text-white">{fmt(r.platformValue)}</td>
                <td className={`px-2 py-2 tabular-nums ${
                  r.difference === null ? 'text-slate-500' : r.difference === 0 ? 'text-emerald-300' : 'text-amber-300'
                }`}>
                  {r.difference === null ? '—' : (r.difference > 0 ? '+' : '') + r.difference}
                  {r.percentDifference != null && (
                    <span className="ml-1 text-[10px] opacity-80">({r.percentDifference}%)</span>
                  )}
                </td>
                <td className="px-2 py-2"><SevBadge sev={r.severity} /></td>
                <td className="px-2 py-2 text-[11px] text-slate-400">
                  {r.type === 'MISSING_IN_PLATFORM' && 'ناقص في المنصة'}
                  {r.type === 'MISSING_IN_UPLOAD' && 'ناقص في الملف'}
                  {r.type === 'VALUE_MISMATCH' && 'قيمة مختلفة'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 200 && (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            عُرضت أول 200 فرق فقط. الباقي محفوظ في الجلسة ويظهر في تقرير التصدير.
          </p>
        )}
      </div>
    </div>
  );
}

function SevBadge({ sev, count }: { sev: Severity; count?: number }) {
  const cls = {
    CRITICAL: 'border-red-500/40 bg-red-500/15 text-red-300',
    HIGH: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
    MEDIUM: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    LOW: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  }[sev];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] ${cls}`}>
      {SEVERITY_LABEL[sev]}
      {count != null && <span className="tabular-nums opacity-80">({count})</span>}
    </span>
  );
}

// ─── History ─────────────────────────────────────────────────────────────

function HistoryCard({
  items,
  loading,
  onOpen,
  onDelete,
  onRefresh,
}: {
  items: SessionListItem[];
  loading: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-white">جلسات التحليل السابقة</h3>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          {loading ? 'جارٍ التحميل…' : 'لا توجد جلسات سابقة بعد.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => {
            const pct = s.matchPercentage ?? 0;
            const color = s.status === 'FAILED'
              ? 'red'
              : s.status !== 'COMPLETED'
              ? 'slate'
              : pct >= 95 ? 'emerald' : pct >= 80 ? 'amber' : 'red';
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <FileBadge mime={s.fileType} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{s.fileName}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(s.createdAt).toLocaleString('ar-SA')} • {s.totalRows ?? 0} صف
                  </div>
                </div>
                <span className={`rounded-md border px-2 py-0.5 text-[11px] ${
                  color === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : color === 'amber' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : color === 'red' ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-white/10 bg-white/5 text-slate-300'
                }`}>
                  {s.status === 'COMPLETED'
                    ? `مطابقة ${pct.toFixed(0)}%`
                    : STATUS_LABEL[s.status]}
                </span>
                <button
                  onClick={() => onOpen(s.id)}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                >
                  عرض
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  title="حذف"
                  className="rounded-md p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

function fmt(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('ar-SA');
  return v;
}
