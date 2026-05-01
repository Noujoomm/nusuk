'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Files,
  Shield,
  Loader2,
  Download,
  Eye,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/stores/auth';
import { attendanceApi } from '@/lib/api';
import { parseFilenameFromHeaders, triggerBrowserDownload } from '@/lib/download';
import { PreviewDialog } from '@/components/attendance/preview-dialog';
import { AnalysisDialog } from '@/components/attendance/analysis-dialog';

interface UploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  reportDate: string;
  status: 'processed' | 'failed' | string;
  totalRecords: number;
  matchedCount: number;
  unmatchedCount: number;
  fileChecksum: string | null;
  uploadedBy: string | null;
  createdAt: string;
  absencesByTrack: Record<string, number>;
  _count: { downloads: number };
}

interface ListResponse {
  items: UploadItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function UploadsHistoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UploadItem | null>(null);
  const [previewItem, setPreviewItem] = useState<UploadItem | null>(null);
  const [analysisItem, setAnalysisItem] = useState<UploadItem | null>(null);
  // upload.id → has cached analysis. Bulk-checked when the page list loads
  // (no per-row request needed).
  const [hasAnalysis, setHasAnalysis] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await attendanceApi.listUploadsPaged({
        from: from || undefined,
        to: to || undefined,
        page,
        limit: 30,
      });
      setData(data);
      // Bulk-check which uploads already have a saved analysis so the
      // sparkle badge can render without N requests.
      const ids: string[] = (data?.items ?? []).map((u: UploadItem) => u.id);
      if (ids.length > 0) {
        try {
          const res = await attendanceApi.hasAnalysisMany(ids);
          setHasAnalysis(res.data || {});
        } catch {
          setHasAnalysis({});
        }
      } else {
        setHasAnalysis({});
      }
    } catch {
      toast.error('فشل تحميل سجل الرفعات');
    } finally {
      setLoading(false);
    }
  }, [from, to, page]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const handleDownload = useCallback(async (u: UploadItem) => {
    setBusyId(u.id);
    const tid = toast.loading('جارٍ تحميل الملف…');
    try {
      const res = await attendanceApi.downloadFile(u.id);
      const filename = parseFilenameFromHeaders(res.headers, u.fileName);
      triggerBrowserDownload(res.data, filename, 'application/pdf');
      toast.success('تم التحميل ✓', { id: tid });
      // Refresh so the downloads counter increments visibly.
      await load();
    } catch {
      toast.error('فشل تحميل الملف', { id: tid });
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const handleDownloadReport = useCallback(async (u: UploadItem, kind: 'docx' | 'xlsx') => {
    setBusyId(u.id);
    const tid = toast.loading(kind === 'docx' ? 'تجهيز ملف Word…' : 'تجهيز ملف Excel…');
    try {
      const res = kind === 'docx'
        ? await attendanceApi.exportDocx(u.id)
        : await attendanceApi.exportXlsx(u.id, 'all');
      const fallback = kind === 'docx' ? 'attendance-report.docx' : 'attendance-report.xlsx';
      const filename = parseFilenameFromHeaders(res.headers, fallback);
      const mime = kind === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      triggerBrowserDownload(res.data, filename, mime);
      toast.success('تم التحميل ✓', { id: tid });
    } catch (err: any) {
      const msg = err?.response?.data?.message || `فشل تحميل ${kind === 'docx' ? 'Word' : 'Excel'}`;
      toast.error(typeof msg === 'string' ? msg : 'فشل التحميل', { id: tid });
    } finally {
      setBusyId(null);
    }
  }, []);

  const handlePreview = useCallback((u: UploadItem) => {
    setPreviewItem(u);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const tid = toast.loading('جارٍ الحذف…');
    try {
      await attendanceApi.deleteUpload(confirmDelete.id);
      toast.success('تم الحذف نهائياً', { id: tid });
      setConfirmDelete(null);
      await load();
    } catch {
      toast.error('فشل الحذف', { id: tid });
    }
  }, [confirmDelete, load]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Shield className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط لمدير النظام</p>
      </div>
    );
  }

  const visible = (data?.items ?? []).filter((u) =>
    !search.trim() ? true : u.fileName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Files className="w-7 h-7 text-brand-400" />
            سجل ملفات الحضور والانصراف
          </h1>
          <p className="text-gray-400 mt-1">
            كل ملفات PDF المرفوعة محفوظة كاملة — يمكن تنزيلها بنفس صيغتها الأصلية أو معاينتها في المتصفح.
          </p>
        </div>
        <Link
          href="/attendance"
          className="text-xs px-3 py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          العودة للوحة الحضور
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الملف…"
            dir="rtl"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 pr-10 text-sm text-gray-200 focus:outline-none focus:border-brand-400/50"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">من تاريخ</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setPage(1); setFrom(e.target.value); }}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-400/50"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setPage(1); setTo(e.target.value); }}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-400/50"
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 text-brand-400 animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">لا توجد رفعات في هذا الفلتر</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-right px-4 py-3">تاريخ التقرير</th>
                  <th className="text-right px-4 py-3">اسم الملف</th>
                  <th className="text-right px-4 py-3">الحجم</th>
                  <th className="text-right px-4 py-3">السجلات</th>
                  <th className="text-right px-4 py-3">الغيابات حسب المسار</th>
                  <th className="text-right px-4 py-3">الحالة</th>
                  <th className="text-right px-4 py-3">تنزيلات</th>
                  <th className="text-right px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visible.map((u) => {
                  const tracks = Object.entries(u.absencesByTrack);
                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 tabular-nums text-gray-200">{u.reportDate.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-gray-300 max-w-md break-all">
                        <Link href={`/attendance?upload=${u.id}`} className="hover:text-brand-300">
                          {u.fileName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{formatBytes(u.fileSize)}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">
                        <span className="text-emerald-300">{u.matchedCount}</span>
                        <span className="text-gray-600"> / </span>
                        <span>{u.totalRecords}</span>
                        {u.unmatchedCount > 0 && (
                          <span className="text-amber-300 mr-2 text-xs">⚠ {u.unmatchedCount}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tracks.length === 0 ? (
                          <span className="text-xs text-emerald-400/70">لا غيابات</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {tracks.slice(0, 4).map(([track, count]) => (
                              <span
                                key={track}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/20"
                                title={`${count} غياب في ${track}`}
                              >
                                {track} <span className="opacity-70">({count})</span>
                              </span>
                            ))}
                            {tracks.length > 4 && (
                              <span className="text-[10px] text-gray-500">+{tracks.length - 4}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{u._count.downloads}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <AnalysisActionButton
                            onClick={() => setAnalysisItem(u)}
                            hasAnalysis={!!hasAnalysis[u.id]}
                          />
                          <ActionButton
                            onClick={() => handleDownloadReport(u, 'docx')}
                            disabled={busyId === u.id}
                            title="تحميل تقرير Word الشامل"
                            Icon={FileText}
                            tone="blue"
                          />
                          <ActionButton
                            onClick={() => handleDownloadReport(u, 'xlsx')}
                            disabled={busyId === u.id}
                            title="تحميل تقرير Excel"
                            Icon={FileSpreadsheet}
                            tone="emerald"
                          />
                          <ActionButton
                            onClick={() => handlePreview(u)}
                            disabled={busyId === u.id}
                            title="معاينة في المتصفح"
                            Icon={Eye}
                          />
                          <ActionButton
                            onClick={() => handleDownload(u)}
                            disabled={busyId === u.id}
                            title="تنزيل الملف الأصلي"
                            Icon={Download}
                          />
                          <ActionButton
                            onClick={() => setConfirmDelete(u)}
                            disabled={busyId === u.id}
                            title="حذف"
                            Icon={Trash2}
                            danger
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="border-t border-white/10 p-3 flex items-center justify-between text-xs text-gray-400">
            <div>{data.total} إجمالي · صفحة {data.page} من {data.totalPages}</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="rounded-md bg-white/5 px-2 py-1 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1"
              >
                <ChevronRight className="w-3 h-3" />
                السابق
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={data.page >= data.totalPages}
                className="rounded-md bg-white/5 px-2 py-1 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1"
              >
                التالي
                <ChevronLeft className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      <PreviewDialog
        open={!!previewItem}
        uploadId={previewItem?.id ?? null}
        reportDate={previewItem?.reportDate?.slice(0, 10) ?? null}
        fallbackFileName={previewItem?.fileName}
        onClose={() => setPreviewItem(null)}
      />

      <AnalysisDialog
        open={!!analysisItem}
        uploadId={analysisItem?.id ?? null}
        fileName={analysisItem?.fileName}
        onClose={() => {
          const closed = analysisItem;
          setAnalysisItem(null);
          // After first analysis the badge needs to flip on. Cheap re-check
          // for that single id only.
          if (closed) {
            attendanceApi
              .hasAnalysis(closed.id)
              .then(({ data }) => setHasAnalysis((prev) => ({ ...prev, [closed.id]: !!data.exists })))
              .catch(() => {});
          }
        }}
      />

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="rounded-xl bg-red-500/20 p-2.5">
                <AlertTriangle className="w-5 h-5 text-red-300" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">تأكيد الحذف</h3>
                <p className="text-sm text-gray-400 mt-1">
                  سيتم حذف <strong className="text-gray-200">{confirmDelete.fileName}</strong> نهائياً
                  مع كل البيانات المرتبطة به (السجلات والملخصات اليومية وسجل التنزيلات).
                  هذا الإجراء لا يمكن التراجع عنه.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg bg-white/5 border border-white/10 text-gray-300 px-4 py-2 text-sm hover:bg-white/10"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-500/30 border border-red-500/40 text-red-200 px-4 py-2 text-sm hover:bg-red-500/40 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                حذف نهائياً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisActionButton({
  onClick,
  hasAnalysis,
}: {
  onClick: () => void;
  hasAnalysis: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={hasAnalysis ? 'عرض التحليل المحفوظ' : 'تحليل ذكي للملف'}
      className="relative p-1.5 rounded-md border border-transparent transition-colors text-emerald-300/80 hover:text-emerald-200 hover:bg-emerald-500/10 hover:border-emerald-500/20"
    >
      <Sparkles className="w-3.5 h-3.5" />
      {hasAnalysis && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900" />
      )}
    </button>
  );
}

function ActionButton({
  onClick,
  disabled,
  title,
  Icon,
  danger,
  tone,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  Icon: any;
  danger?: boolean;
  tone?: 'blue' | 'emerald';
}) {
  const toneCls =
    tone === 'blue'
      ? 'text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/30'
      : tone === 'emerald'
      ? 'text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/30'
      : danger
      ? 'text-red-400 hover:bg-red-500/10 hover:border-red-500/20'
      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md border border-transparent transition-colors disabled:opacity-30 ${toneCls}`}
    >
      {disabled ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta =
    status === 'processed'
      ? { label: 'تم المعالجة', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
      : status === 'failed'
        ? { label: 'فشل', cls: 'bg-red-500/20 text-red-300 border-red-500/30' }
        : { label: status, cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] border ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
