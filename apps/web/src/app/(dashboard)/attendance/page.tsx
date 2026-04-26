'use client';

import { useCallback, useState } from 'react';
import {
  Fingerprint,
  Shield,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  Users,
  Calendar,
  Clock,
  AlertTriangle,
  XCircle,
  Coffee,
  HelpCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/stores/auth';
import { attendanceApi } from '@/lib/api';

interface SeedResult {
  totalRowsRead: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ sheet: string; row: number; reason: string }>;
}

interface UploadResult {
  uploadId: string;
  reportDate: string;
  totalRecords: number;
  matchedCount: number;
  unmatchedCount: number;
  employeesAnalyzed: number;
}

type AttendanceStatus =
  | 'present'
  | 'incomplete_hours'
  | 'check_in_only'
  | 'check_out_only'
  | 'absent'
  | 'exempt';

interface DailySummary {
  id: string;
  reportDate: string;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  totalHours: number | null;
  recordsCount: number;
  status: AttendanceStatus;
  flags: string[];
  employee: {
    id: string;
    fullName: string;
    track: string;
    trackDetail: string | null;
    employeeNumber: string | null;
    shiftType: string;
  };
}

interface UnmatchedRecord {
  id: string;
  rawEmployeeNumber: string;
  rawName: string;
  rawDepartment: string;
  recordTime: string;
  punchType: 'check_in' | 'check_out';
}

interface DailyReport {
  upload: { id: string; reportDate: string; matchedCount: number; unmatchedCount: number };
  summaries: DailySummary[];
  unmatched: UnmatchedRecord[];
}

const STATUS_META: Record<AttendanceStatus, { label: string; cls: string; Icon: any }> = {
  present:          { label: 'حاضر',           cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', Icon: CheckCircle },
  incomplete_hours: { label: 'أقل من 8 ساعات', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30',       Icon: AlertTriangle },
  check_in_only:    { label: 'بدون انصراف',    cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30',    Icon: AlertTriangle },
  check_out_only:   { label: 'بدون حضور',      cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30',    Icon: AlertTriangle },
  absent:           { label: 'غائب',           cls: 'bg-red-500/20 text-red-300 border-red-500/30',             Icon: XCircle },
  exempt:           { label: 'معفى',           cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30',       Icon: Coffee },
};

const TAB_FILTERS: Array<{ key: 'all' | AttendanceStatus | 'flagged'; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'flagged', label: 'تنبيهات' },
  { key: 'present', label: 'حاضر' },
  { key: 'incomplete_hours', label: 'أقل من 8 ساعات' },
  { key: 'absent', label: 'غائب' },
  { key: 'exempt', label: 'معفى' },
];

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [seedUploading, setSeedUploading] = useState(false);
  const [seedDragging, setSeedDragging] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);

  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfDragging, setPdfDragging] = useState(false);
  const [pdfResult, setPdfResult] = useState<UploadResult | null>(null);

  const [report, setReport] = useState<DailyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [filter, setFilter] = useState<typeof TAB_FILTERS[number]['key']>('all');

  // ─── Excel seeder ────────────────────────────────────────────────────
  const handleSeedFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('يجب أن يكون الملف بصيغة Excel (.xlsx أو .xls)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 5 ميجابايت');
      return;
    }
    setSeedUploading(true);
    setSeedResult(null);
    const tid = toast.loading('جاري معالجة ملف الموظفين…');
    try {
      const { data } = await attendanceApi.seedEmployees(file);
      setSeedResult(data);
      toast.success(`تم: ${data.created} موظف جديد، ${data.updated} تحديث`, { id: tid });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل رفع الملف';
      toast.error(typeof msg === 'string' ? msg : 'فشل رفع الملف', { id: tid });
    } finally {
      setSeedUploading(false);
    }
  }, []);

  // ─── PDF upload ──────────────────────────────────────────────────────
  const loadReport = useCallback(async (uploadId: string) => {
    setReportLoading(true);
    try {
      const { data } = await attendanceApi.getReport(uploadId);
      setReport(data);
    } catch {
      toast.error('فشل تحميل التقرير');
    } finally {
      setReportLoading(false);
    }
  }, []);

  const handlePdfFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('يجب أن يكون الملف بصيغة PDF');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 10 ميجابايت');
      return;
    }
    setPdfUploading(true);
    setPdfResult(null);
    setReport(null);
    const tid = toast.loading('جاري قراءة وتحليل الملف…');
    try {
      const { data } = await attendanceApi.uploadPdf(file);
      setPdfResult(data);
      toast.success(
        `تم تحليل ${data.totalRecords} سجل (${data.matchedCount} مطابق، ${data.unmatchedCount} غير مطابق)`,
        { id: tid },
      );
      await loadReport(data.uploadId);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل معالجة ملف PDF';
      toast.error(typeof msg === 'string' ? msg : 'فشل معالجة ملف PDF', { id: tid });
    } finally {
      setPdfUploading(false);
    }
  }, [loadReport]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Shield className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط لمدير النظام</p>
      </div>
    );
  }

  // ─── Counts and filter ───────────────────────────────────────────────
  const counts = {
    all: report?.summaries.length ?? 0,
    present: report?.summaries.filter((s) => s.status === 'present').length ?? 0,
    incomplete_hours: report?.summaries.filter((s) => s.status === 'incomplete_hours').length ?? 0,
    absent: report?.summaries.filter((s) => s.status === 'absent').length ?? 0,
    exempt: report?.summaries.filter((s) => s.status === 'exempt').length ?? 0,
    flagged: report?.summaries.filter((s) => (s.flags?.length ?? 0) > 0 || ['check_in_only', 'check_out_only', 'incomplete_hours'].includes(s.status)).length ?? 0,
  };

  const filtered = report?.summaries.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'flagged') {
      return (s.flags?.length ?? 0) > 0 || ['check_in_only', 'check_out_only', 'incomplete_hours'].includes(s.status);
    }
    return s.status === filter;
  }) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Fingerprint className="w-7 h-7 text-brand-400" />
          الحضور والانصراف
        </h1>
        <p className="text-gray-400 mt-1">
          إدارة بيانات الحضور والانصراف اليومي وتوليد التقارير الرسمية
        </p>
      </div>

      {/* ─── Excel Seeder ─── */}
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-xl bg-brand-500/20 p-2.5">
            <Users className="w-5 h-5 text-brand-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">قائمة الموظفين الرئيسية</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              ارفع ملف Excel "جدول الحضور — كل المسارات" مرة واحدة لتعريف الموظفين في النظام.
            </p>
          </div>
        </div>

        <DropZone
          accept=".xlsx,.xls"
          isDragging={seedDragging}
          isUploading={seedUploading}
          setDragging={setSeedDragging}
          onFile={handleSeedFile}
          hint="يدعم .xlsx و .xls — حتى 5MB"
          inputId="seed-file"
        />

        {seedResult && (
          <div className="mt-5 rounded-xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <CheckCircle className="w-4 h-4" />
              تمت معالجة الملف
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="إجمالي الصفوف" value={seedResult.totalRowsRead} />
              <Stat label="موظف جديد" value={seedResult.created} accent="emerald" />
              <Stat label="تم التحديث" value={seedResult.updated} accent="blue" />
              <Stat label="تم تخطّيه" value={seedResult.skipped} accent={seedResult.skipped > 0 ? 'amber' : undefined} />
            </div>
            {seedResult.errors.length > 0 && (
              <details className="text-xs text-amber-200/90">
                <summary className="cursor-pointer flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {seedResult.errors.length} تنبيه أثناء القراءة
                </summary>
                <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-2">
                  {seedResult.errors.map((e, i) => (
                    <li key={i} className="opacity-80">• [{e.sheet} / صف {e.row}] {e.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* ─── PDF Upload ─── */}
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-xl bg-blue-500/20 p-2.5">
            <FileSpreadsheet className="w-5 h-5 text-blue-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">تقرير PDF اليومي للحضور</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              ارفع ملف PDF اليومي للبصمة لتحليل الحضور والانصراف وإصدار الملخص.
            </p>
          </div>
        </div>

        <DropZone
          accept=".pdf"
          isDragging={pdfDragging}
          isUploading={pdfUploading}
          setDragging={setPdfDragging}
          onFile={handlePdfFile}
          hint="يدعم .pdf — حتى 10MB"
          inputId="pdf-file"
        />

        {pdfResult && (
          <div className="mt-5 rounded-xl bg-white/[0.04] border border-white/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300 mb-3">
              <CheckCircle className="w-4 h-4" />
              تم تحليل التقرير ليوم {pdfResult.reportDate}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="السجلات" value={pdfResult.totalRecords} />
              <Stat label="مطابقة" value={pdfResult.matchedCount} accent="emerald" />
              <Stat label="غير مطابقة" value={pdfResult.unmatchedCount} accent={pdfResult.unmatchedCount > 0 ? 'amber' : undefined} />
              <Stat label="موظفون" value={pdfResult.employeesAnalyzed} accent="blue" />
            </div>
          </div>
        )}
      </div>

      {/* ─── Daily Report Table ─── */}
      {reportLoading && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-12 flex justify-center">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
        </div>
      )}

      {report && !reportLoading && (
        <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-400" />
              <h3 className="font-semibold">تقرير {report.upload.reportDate}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {TAB_FILTERS.map((t) => {
                const count = counts[t.key as keyof typeof counts] ?? 0;
                const active = filter === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setFilter(t.key)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${active ? 'bg-brand-500/30 text-brand-200 border border-brand-400/40' : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'}`}
                  >
                    {t.label} <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-right px-4 py-3">الموظف</th>
                  <th className="text-right px-4 py-3">المسار</th>
                  <th className="text-right px-4 py-3">دخول</th>
                  <th className="text-right px-4 py-3">خروج</th>
                  <th className="text-right px-4 py-3">الساعات</th>
                  <th className="text-right px-4 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((s) => {
                  const meta = STATUS_META[s.status];
                  return (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-gray-200">
                        {s.employee.fullName}
                        {s.employee.employeeNumber && (
                          <span className="text-xs text-gray-500 mr-2">#{s.employee.employeeNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{s.employee.track}{s.employee.trackDetail ? ` — ${s.employee.trackDetail}` : ''}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{s.firstCheckIn ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{s.lastCheckOut ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{s.totalHours != null ? s.totalHours.toFixed(1) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${meta.cls}`}>
                          <meta.Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500 text-sm">لا توجد سجلات في هذا الفلتر</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {report.unmatched.length > 0 && (
            <div className="border-t border-white/10 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300 mb-3">
                <HelpCircle className="w-4 h-4" />
                {report.unmatched.length} سجل لم تتم مطابقتها مع موظف مسجّل
              </div>
              <div className="rounded-lg bg-white/[0.02] border border-white/5 max-h-64 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead className="bg-white/[0.02] text-gray-500 text-[10px] uppercase">
                    <tr>
                      <th className="text-right px-3 py-2">رقم</th>
                      <th className="text-right px-3 py-2">الاسم</th>
                      <th className="text-right px-3 py-2">القسم</th>
                      <th className="text-right px-3 py-2">الوقت</th>
                      <th className="text-right px-3 py-2">النوع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {report.unmatched.map((u) => (
                      <tr key={u.id}>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{u.rawEmployeeNumber}</td>
                        <td className="px-3 py-2 text-gray-300">{u.rawName}</td>
                        <td className="px-3 py-2 text-gray-500">{u.rawDepartment}</td>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{u.recordTime}</td>
                        <td className="px-3 py-2 text-gray-400">{u.punchType === 'check_in' ? 'دخول' : 'خروج'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DropZone({
  accept,
  isDragging,
  isUploading,
  setDragging,
  onFile,
  hint,
  inputId,
}: {
  accept: string;
  isDragging: boolean;
  isUploading: boolean;
  setDragging: (b: boolean) => void;
  onFile: (f: File) => void;
  hint: string;
  inputId: string;
}) {
  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        isDragging ? 'border-brand-400 bg-brand-500/10' : 'border-white/15 hover:border-white/30 bg-white/[0.02]'
      } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        disabled={isUploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {isUploading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-brand-400 animate-spin" />
          <p className="text-sm text-gray-300">جارٍ المعالجة…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <UploadCloud className="w-10 h-10 text-gray-400" />
          <p className="text-sm text-gray-300">
            اسحب الملف هنا أو <span className="text-brand-300">اضغط للاختيار</span>
          </p>
          <p className="text-xs text-gray-500">{hint}</p>
        </div>
      )}
    </label>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'blue' | 'amber';
}) {
  const accentClass =
    accent === 'emerald' ? 'text-emerald-300'
    : accent === 'blue'    ? 'text-blue-300'
    : accent === 'amber'   ? 'text-amber-300'
    : 'text-gray-200';
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accentClass}`}>{value}</div>
    </div>
  );
}
