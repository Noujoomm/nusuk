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
  AlertTriangle,
  XCircle,
  Coffee,
  HelpCircle,
  Phone,
  Wifi,
  RefreshCw,
  Mail,
  Copy,
  Check,
  Download,
  Eye,
  ChevronDown,
  MapPin,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useAuth } from '@/stores/auth';
import { attendanceApi } from '@/lib/api';
import { parseFilenameFromHeaders, triggerBrowserDownload } from '@/lib/download';
import { PreviewDialog } from '@/components/attendance/preview-dialog';

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
  | 'on_call_present'
  | 'on_call_no_visit'
  | 'on_call_check_in_only'
  | 'on_call_check_out_only'
  | 'online'
  | 'unscheduled'
  | 'exempt'; // legacy — re-analyze replaces it

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
    center: 'makkah' | 'madinah' | 'shared' | null;
    worksByCharter: boolean;
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

interface OfficialLetter {
  text: string;
  html: string;
  metadata: {
    generatedAt: string;
    totalAbsences: number;
    uniqueEmployees: number;
    period: string;
  };
}

const DEFAULT_RECIPIENT = 'الدكتور/ حسام فقيها';

const STATUS_META: Record<
  AttendanceStatus,
  { label: string; cls: string; Icon: any; group: 'regular' | 'on_call' | 'other' }
> = {
  present:                { label: 'حاضر',                cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', Icon: CheckCircle,    group: 'regular' },
  incomplete_hours:       { label: 'أقل من 8 ساعات',      cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30',       Icon: AlertTriangle,  group: 'regular' },
  check_in_only:          { label: 'دخول بدون خروج',      cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30',    Icon: AlertTriangle,  group: 'regular' },
  check_out_only:         { label: 'خروج بدون دخول',      cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30',    Icon: AlertTriangle,  group: 'regular' },
  absent:                 { label: 'غائب',                cls: 'bg-red-500/20 text-red-300 border-red-500/30',             Icon: XCircle,        group: 'regular' },
  on_call_present:        { label: 'On Call — حضر',       cls: 'bg-sky-500/20 text-sky-300 border-sky-500/30',             Icon: Phone,          group: 'on_call' },
  on_call_no_visit:       { label: 'On Call — لم يحضر',   cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30',       Icon: Phone,          group: 'on_call' },
  on_call_check_in_only:  { label: 'On Call — بدون خروج', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30',       Icon: AlertTriangle,  group: 'on_call' },
  on_call_check_out_only: { label: 'On Call — بدون دخول', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30',       Icon: AlertTriangle,  group: 'on_call' },
  online:                 { label: 'أونلاين',             cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30',    Icon: Wifi,           group: 'other' },
  unscheduled:            { label: 'بدون وقت محدد',       cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30',       Icon: Coffee,         group: 'other' },
  exempt:                 { label: 'معفى (قديم)',          cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30',       Icon: Coffee,         group: 'other' },
};

const ALERT_STATUSES: AttendanceStatus[] = [
  'incomplete_hours',
  'check_in_only',
  'check_out_only',
  'on_call_check_in_only',
  'on_call_check_out_only',
];

const TAB_FILTERS: Array<{ key: string; label: string; match: (s: DailySummary) => boolean }> = [
  { key: 'all',      label: 'الكل',         match: () => true },
  { key: 'alerts',   label: 'تنبيهات ⚠',    match: (s) => ALERT_STATUSES.includes(s.status) || (s.flags?.length ?? 0) > 0 },
  { key: 'present',  label: 'حاضر',         match: (s) => s.status === 'present' },
  { key: 'absent',   label: 'غائب',         match: (s) => s.status === 'absent' },
  { key: 'on_call',  label: 'On Call 📱',    match: (s) => s.status.startsWith('on_call_') },
];

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [seedUploading, setSeedUploading] = useState(false);
  const [seedDragging, setSeedDragging] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);

  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfDraggingMakkah, setPdfDraggingMakkah] = useState(false);
  const [pdfDraggingMadinah, setPdfDraggingMadinah] = useState(false);
  const [pdfDraggingAuto, setPdfDraggingAuto] = useState(false);
  const [pdfResult, setPdfResult] = useState<UploadResult | null>(null);

  const [report, setReport] = useState<DailyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [filter, setFilter] = useState('all');

  const [recipient, setRecipient] = useState(DEFAULT_RECIPIENT);
  const [letter, setLetter] = useState<OfficialLetter | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterCopied, setLetterCopied] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [rosterOnly, setRosterOnly] = useState(true);

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

  const handlePdfFile = useCallback(async (file: File, centerOverride?: 'makkah' | 'madinah') => {
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
    const cityLabel = centerOverride === 'makkah' ? 'مكة' : centerOverride === 'madinah' ? 'المدينة' : 'تلقائي';
    const tid = toast.loading(`جاري قراءة وتحليل الملف (${cityLabel})…`);
    try {
      const { data } = await attendanceApi.uploadPdf(file, centerOverride);
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

  const handleReanalyze = useCallback(async () => {
    if (!report?.upload.id) return;
    setReanalyzing(true);
    const tid = toast.loading('جارٍ إعادة تحليل الرفعة…');
    try {
      const { data } = await attendanceApi.reanalyze(report.upload.id);
      toast.success(`تم تحديث ${data.summariesWritten} ملخص`, { id: tid });
      await loadReport(report.upload.id);
    } catch {
      toast.error('فشل إعادة التحليل', { id: tid });
    } finally {
      setReanalyzing(false);
    }
  }, [report, loadReport]);

  const handleGenerateLetter = useCallback(async () => {
    if (!report?.upload.id) return;
    setLetterLoading(true);
    setLetter(null);
    setLetterCopied(false);
    try {
      const { data } = await attendanceApi.dailyLetter(report.upload.id, recipient.trim() || undefined);
      setLetter(data);
    } catch {
      toast.error('فشل توليد الخطاب');
    } finally {
      setLetterLoading(false);
    }
  }, [report, recipient]);

  const handleCopyLetter = useCallback(async () => {
    if (!letter) return;
    try {
      await navigator.clipboard.writeText(letter.text);
      setLetterCopied(true);
      toast.success('تم نسخ الخطاب بنجاح ✓');
      setTimeout(() => setLetterCopied(false), 2500);
    } catch {
      toast.error('تعذّر النسخ — انسخ النص يدوياً من الصندوق');
    }
  }, [letter]);

  const handleDownloadOriginal = useCallback(async () => {
    if (!report?.upload.id) return;
    const tid = toast.loading('جارٍ تحميل الملف…');
    try {
      const res = await attendanceApi.downloadFile(report.upload.id);
      // Pull the filename from Content-Disposition (RFC 5987) so we keep the
      // original Arabic name. Falls back to the upload's fileName.
      const fallback = `attendance-${report.upload.reportDate}.pdf`;
      const filename = parseFilenameFromHeaders(res.headers, fallback);
      triggerBrowserDownload(res.data, filename, 'application/pdf');
      toast.success('تم التحميل ✓', { id: tid });
    } catch {
      toast.error('فشل تحميل الملف', { id: tid });
    }
  }, [report]);

  const handlePreviewOriginal = useCallback(() => {
    if (!report?.upload.id) return;
    setPreviewOpen(true);
  }, [report]);

  const handleExport = useCallback(
    async (scope: 'all' | 'track' | 'center', filter?: string) => {
      if (!report?.upload.id) return;
      setExportMenuOpen(false);
      const tid = toast.loading('جارٍ تجهيز ملف Excel…');
      try {
        const res = await attendanceApi.exportXlsx(report.upload.id, scope, filter, rosterOnly);
        const fallback = `الحضور_${report.upload.reportDate}.xlsx`;
        const filename = parseFilenameFromHeaders(res.headers, fallback);
        triggerBrowserDownload(
          res.data,
          filename,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        toast.success('تم التحميل ✓', { id: tid });
      } catch (err: any) {
        const msg = err?.response?.data?.message || 'فشل التصدير';
        toast.error(typeof msg === 'string' ? msg : 'فشل التصدير', { id: tid });
      }
    },
    [report, rosterOnly],
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Shield className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط لمدير النظام</p>
      </div>
    );
  }

  // ─── Group counts ────────────────────────────────────────────────────
  const allSummaries = report?.summaries ?? [];
  // الفلتر "ضمن الكراسة" مستقل ويُجمَّع مع الـ tab الحالي. كل العدّادات
  // والإحصائيات تحت ينطبق عليها هذا الفلتر — حتى الأرقام تتحدّث مع التبديل.
  const summaries = rosterOnly ? allSummaries.filter((s) => s.employee.worksByCharter) : allSummaries;
  const rosterCount = allSummaries.filter((s) => s.employee.worksByCharter).length;
  const outOfRosterCount = allSummaries.length - rosterCount;
  const regular = {
    total:           summaries.filter((s) => STATUS_META[s.status]?.group === 'regular').length,
    present:         summaries.filter((s) => s.status === 'present').length,
    incompleteHours: summaries.filter((s) => s.status === 'incomplete_hours').length,
    checkInOnly:     summaries.filter((s) => s.status === 'check_in_only').length,
    checkOutOnly:    summaries.filter((s) => s.status === 'check_out_only').length,
    absent:          summaries.filter((s) => s.status === 'absent').length,
  };
  const onCall = {
    total:        summaries.filter((s) => STATUS_META[s.status]?.group === 'on_call').length,
    present:      summaries.filter((s) => s.status === 'on_call_present').length,
    noVisit:      summaries.filter((s) => s.status === 'on_call_no_visit').length,
    checkInOnly:  summaries.filter((s) => s.status === 'on_call_check_in_only').length,
    checkOutOnly: summaries.filter((s) => s.status === 'on_call_check_out_only').length,
  };
  const tabCounts = TAB_FILTERS.reduce((acc, t) => {
    acc[t.key] = summaries.filter(t.match).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = summaries.filter(TAB_FILTERS.find((t) => t.key === filter)?.match ?? (() => true));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Fingerprint className="w-7 h-7 text-brand-400" />
            الحضور والانصراف
          </h1>
          <p className="text-gray-400 mt-1">
            إدارة بيانات الحضور والانصراف اليومي وتوليد التقارير الرسمية
          </p>
        </div>
        <Link
          href="/attendance/uploads"
          className="text-xs px-3 py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          سجل الملفات السابقة
        </Link>
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
              ارفع كل مدينة في مكانها — هذا يضمن أن موظفي المدينة الأخرى لا يُسجَّلون "غائبين"
              بالخطأ في يوم خصصته لمدينة واحدة. الخيار التلقائي يستنتج المدينة من أسماء الموظفين
              في الملف.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Makkah */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-300">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-[11px]">🕋</span>
              <span>حضور مكة المكرمة</span>
            </div>
            <DropZone
              accept=".pdf"
              isDragging={pdfDraggingMakkah}
              isUploading={pdfUploading}
              setDragging={setPdfDraggingMakkah}
              onFile={(f) => handlePdfFile(f, 'makkah')}
              hint=".pdf — يُسجَّل تحت تصنيف مكة"
              inputId="pdf-file-makkah"
            />
          </div>

          {/* Madinah */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-300">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15 text-[11px]">🕌</span>
              <span>حضور المدينة المنورة</span>
            </div>
            <DropZone
              accept=".pdf"
              isDragging={pdfDraggingMadinah}
              isUploading={pdfUploading}
              setDragging={setPdfDraggingMadinah}
              onFile={(f) => handlePdfFile(f, 'madinah')}
              hint=".pdf — يُسجَّل تحت تصنيف المدينة"
              inputId="pdf-file-madinah"
            />
          </div>
        </div>

        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
            رفع تلقائي (لا تعرف المدينة؟ النظام يستنتجها من الأسماء)
          </summary>
          <div className="mt-2">
            <DropZone
              accept=".pdf"
              isDragging={pdfDraggingAuto}
              isUploading={pdfUploading}
              setDragging={setPdfDraggingAuto}
              onFile={(f) => handlePdfFile(f)}
              hint=".pdf — يُستنتج التصنيف من المدينة الغالبة للموظفين"
              inputId="pdf-file-auto"
            />
          </div>
        </details>

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

      {/* ─── Stats Cards (Regular | On Call) ─── */}
      {report && !reportLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-5">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-300">
              <Users className="w-4 h-4 text-brand-400" />
              الموظفون العاديون <span className="text-gray-500">({regular.total})</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="حاضر"           value={regular.present}         tone="emerald" Icon={CheckCircle} />
              <MiniStat label="غائب"            value={regular.absent}          tone="red"     Icon={XCircle} />
              <MiniStat label="< 8 ساعات"        value={regular.incompleteHours} tone="amber"   Icon={AlertTriangle} />
              <MiniStat label="بصمة ناقصة"     value={regular.checkInOnly + regular.checkOutOnly} tone="orange" Icon={AlertTriangle} />
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-5">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-300">
              <Phone className="w-4 h-4 text-sky-400" />
              On Call <span className="text-gray-500">({onCall.total})</span>
              <span className="text-[10px] text-gray-500 mr-auto">لا يدخلون الغياب أو تنبيه &lt;8 ساعات</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="حضر"             value={onCall.present}      tone="sky"     Icon={CheckCircle} />
              <MiniStat label="لم يحضر"         value={onCall.noVisit}      tone="slate"   Icon={Coffee} />
              <MiniStat label="بدون خروج"       value={onCall.checkInOnly}  tone="amber"   Icon={AlertTriangle} />
              <MiniStat label="بدون دخول"       value={onCall.checkOutOnly} tone="amber"   Icon={AlertTriangle} />
            </div>
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setRosterOnly(!rosterOnly)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 border ${
                  rosterOnly
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                    : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10'
                }`}
                title={rosterOnly
                  ? `عرض الموظفين ضمن الكراسة فقط (${rosterCount}). اضغط لإظهار الجميع.`
                  : `عرض جميع الموظفين (${rosterCount + outOfRosterCount}). اضغط لإظهار من ضمن الكراسة فقط.`}
              >
                <span>{rosterOnly ? '✓' : '○'}</span>
                <span>حسب الكراسة</span>
                <span className="opacity-60">({rosterCount})</span>
              </button>
              <span className="w-px h-5 bg-white/10" />
              {TAB_FILTERS.map((t) => {
                const active = filter === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setFilter(t.key)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${active ? 'bg-brand-500/30 text-brand-200 border border-brand-400/40' : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'}`}
                  >
                    {t.label} <span className="opacity-60">({tabCounts[t.key] ?? 0})</span>
                  </button>
                );
              })}
              <ExportMenu
                open={exportMenuOpen}
                setOpen={setExportMenuOpen}
                tracks={Array.from(new Set(summaries.map((s) => s.employee.track).filter(Boolean)))}
                rosterOnly={rosterOnly}
                setRosterOnly={setRosterOnly}
                onExport={handleExport}
              />
              <button
                onClick={handlePreviewOriginal}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 flex items-center gap-1.5"
                title="معاينة ملف PDF الأصلي في المتصفح"
              >
                <Eye className="w-3 h-3" />
                معاينة
              </button>
              <button
                onClick={handleDownloadOriginal}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 flex items-center gap-1.5"
                title="تنزيل ملف PDF الأصلي بنفس الاسم"
              >
                <Download className="w-3 h-3" />
                تنزيل
              </button>
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
                title="إعادة حساب الـ statuses بالـ analyzer الحالي (مفيد بعد تحديثات النظام)"
              >
                <RefreshCw className={`w-3 h-3 ${reanalyzing ? 'animate-spin' : ''}`} />
                إعادة تحليل
              </button>
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
                  const meta = STATUS_META[s.status] ?? STATUS_META.unscheduled;
                  return (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-gray-200">
                        <span className="inline-flex items-center gap-1.5">
                          {s.employee.worksByCharter && (
                            <span
                              className="text-emerald-400"
                              title="ضمن الكراسة الرسمية"
                            >
                              ✓
                            </span>
                          )}
                          {s.employee.fullName}
                        </span>
                        {s.employee.employeeNumber && (
                          <span className="text-xs text-gray-500 mr-2">#{s.employee.employeeNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {s.employee.track}
                        {s.employee.trackDetail ? ` — ${s.employee.trackDetail}` : ''}
                      </td>
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
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500 text-sm">
                      لا توجد سجلات في هذا الفلتر
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {report.unmatched.length > 0 && (
            <div className="border-t border-white/10 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300 mb-3">
                <HelpCircle className="w-4 h-4" />
                {report.unmatched.length} سجل لم تتم مطابقته مع موظف مسجّل
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

      {/* ─── Official Letter ─── */}
      {report && !reportLoading && (
        <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="rounded-xl bg-amber-500/20 p-2.5">
              <Mail className="w-5 h-5 text-amber-300" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">الخطاب الرسمي للغياب</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                يحتوي فقط الموظفين بحالة "غائب" لتاريخ {report.upload.reportDate}.
                موظفو On Call ومن لديه بصمة ناقصة لا يدخلون.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end mb-4">
            <div>
              <label htmlFor="recipient" className="block text-xs text-gray-400 mb-1.5">المرسل إليه</label>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                dir="rtl"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-400/50"
              />
            </div>
            <button
              onClick={handleGenerateLetter}
              disabled={letterLoading}
              className="rounded-lg bg-brand-500/30 border border-brand-400/40 text-brand-200 px-4 py-2 text-sm hover:bg-brand-500/40 disabled:opacity-50 flex items-center gap-2"
            >
              {letterLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              توليد الخطاب
            </button>
          </div>

          {letter && (
            <div className="space-y-3">
              <div
                dir="rtl"
                className="rounded-xl bg-white/[0.05] border border-white/10 p-6 text-gray-100 leading-loose font-[IBM_Plex_Sans_Arabic] whitespace-pre-wrap text-sm"
                dangerouslySetInnerHTML={{ __html: letter.html }}
              />
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-gray-500">
                <span>
                  {letter.metadata.uniqueEmployees > 0
                    ? `${letter.metadata.uniqueEmployees} موظف · ${letter.metadata.totalAbsences} غياب`
                    : 'لا توجد غيابات'}
                </span>
                <button
                  onClick={handleCopyLetter}
                  className="rounded-lg bg-white/5 border border-white/10 text-gray-300 px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-1.5"
                >
                  {letterCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  {letterCopied ? 'تم النسخ ✓' : 'نسخ النص'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <PreviewDialog
        open={previewOpen}
        uploadId={report?.upload.id ?? null}
        reportDate={report?.upload.reportDate ?? null}
        onClose={() => setPreviewOpen(false)}
      />
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

function MiniStat({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'red' | 'amber' | 'orange' | 'sky' | 'slate';
  Icon: any;
}) {
  const toneText: Record<string, string> = {
    emerald: 'text-emerald-300',
    red: 'text-red-300',
    amber: 'text-amber-300',
    orange: 'text-orange-300',
    sky: 'text-sky-300',
    slate: 'text-slate-300',
  };
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 flex items-center gap-3">
      <Icon className={`w-5 h-5 ${toneText[tone]}`} />
      <div>
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className={`text-xl font-bold tabular-nums ${toneText[tone]}`}>{value}</div>
      </div>
    </div>
  );
}

function ExportMenu({
  open,
  setOpen,
  tracks,
  rosterOnly,
  setRosterOnly,
  onExport,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  tracks: string[];
  rosterOnly: boolean;
  setRosterOnly: (b: boolean) => void;
  onExport: (scope: 'all' | 'track' | 'center', filter?: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 flex items-center gap-1.5"
        title="تصدير التقرير إلى Excel"
      >
        <FileSpreadsheet className="w-3 h-3" />
        تصدير Excel
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 left-0 z-40 min-w-[260px] max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0f1117] shadow-xl">
            <label className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-200 hover:bg-white/5 cursor-pointer border-b border-white/5">
              <input
                type="checkbox"
                checked={rosterOnly}
                onChange={(e) => setRosterOnly(e.target.checked)}
                className="rounded border-white/20 bg-white/5"
                onClick={(e) => e.stopPropagation()}
              />
              <span>الموظفون ضمن الكراسة فقط (✓)</span>
            </label>
            <div className="p-1.5">
              <button
                onClick={() => onExport('all')}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 rounded-md text-start"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                التقرير الشامل
              </button>
            </div>
            <div className="border-t border-white/5 p-1.5">
              <div className="px-3 py-1 text-[10px] uppercase text-gray-500 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                حسب المركز
              </div>
              {[
                { key: 'makkah', label: 'مكة المكرمة' },
                { key: 'madinah', label: 'المدينة المنورة' },
                { key: 'shared', label: 'مشترك' },
              ].map((c) => (
                <button
                  key={c.key}
                  onClick={() => onExport('center', c.key)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 rounded-md text-start"
                >
                  {c.label}
                </button>
              ))}
            </div>
            {tracks.length > 0 && (
              <div className="border-t border-white/5 p-1.5">
                <div className="px-3 py-1 text-[10px] uppercase text-gray-500">حسب المسار</div>
                {tracks.map((t) => (
                  <button
                    key={t}
                    onClick={() => onExport('track', t)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 rounded-md text-start"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
