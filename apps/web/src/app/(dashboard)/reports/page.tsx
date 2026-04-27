'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import api, { reportsApi, tracksApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import {
  FileText, Plus, Search, ChevronDown, Calendar, Brain,
  Upload, X, Paperclip, Download, Trash2, Loader2, File as FileIcon,
  Pencil, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { VoiceFillButton, VoiceFillResult } from '@/components/reports/voice-fill-button';

// ─── Types ───

interface Track {
  id: string;
  name: string;
  nameAr: string;
}

interface ReportAuthor {
  id: string;
  name: string;
  nameAr: string;
}

interface ReportTrack {
  id: string;
  nameAr: string;
}

interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Report {
  id: string;
  title: string;
  type: 'daily' | 'weekly' | 'monthly' | 'annual' | 'operational';
  reportDate: string;
  achievements: string | null;
  kpiUpdates: string | null;
  challenges: string | null;
  supportNeeded: string | null;
  upcomingTasks: string | null;
  notes: string | null;
  aiSummary: string | null;
  createdAt: string;
  author: ReportAuthor;
  track: ReportTrack;
  attachments?: Attachment[];
}

interface ReportStats {
  total: number;
  daily: number;
  weekly: number;
  monthly: number;
  annual: number;
  operational: number;
}

interface CreateReportForm {
  trackId: string;
  type: 'daily' | 'weekly' | 'monthly' | 'annual' | 'operational';
  title: string;
  achievements: string;
  kpiUpdates: string;
  challenges: string;
  supportNeeded: string;
  upcomingTasks: string;
  notes: string;
  reportDate: string;
}

// ─── Constants ───

const TYPE_LABELS: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  annual: 'سنوي',
  operational: 'تشغيلي',
};

const TYPE_COLORS: Record<string, string> = {
  daily: 'bg-blue-500/20 text-blue-300',
  weekly: 'bg-violet-500/20 text-violet-300',
  monthly: 'bg-amber-500/20 text-amber-300',
  annual: 'bg-emerald-500/20 text-emerald-300',
  operational: 'bg-rose-500/20 text-rose-300',
};

/** تطبيع نص عربي للمقارنة المرنة: ا/أ/إ/آ → ا، ي/ى → ي، ة → ه، ولا تشكيل. */
function normalizeArabic(s: string): string {
  return (s || '')
    .replace(/[ً-ٰٟ]/g, '') // تشكيل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * يطابق اسم مسار من الصوت على قائمة المسارات: تطابق كامل أولاً، ثم
 * احتواء كامل، ثم احتواء بعد التطبيع. يُرجع id المسار أو null.
 */
function findTrackId(spoken: string, tracks: Track[]): string | null {
  const target = normalizeArabic(spoken);
  if (!target) return null;
  // تطابق كامل
  let hit = tracks.find((t) => normalizeArabic(t.nameAr) === target);
  if (hit) return hit.id;
  // المنطوق يحتوي اسم المسار أو العكس
  hit = tracks.find((t) => {
    const n = normalizeArabic(t.nameAr);
    return n.includes(target) || target.includes(n);
  });
  return hit?.id ?? null;
}

const INITIAL_FORM: CreateReportForm = {
  trackId: '',
  type: 'daily',
  title: '',
  achievements: '',
  kpiUpdates: '',
  challenges: '',
  supportNeeded: '',
  upcomingTasks: '',
  notes: '',
  reportDate: new Date().toISOString().split('T')[0],
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📎';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return '📦';
  return '📎';
}

function fixFileName(name: string): string {
  // Fix mojibake: multer stores Arabic UTF-8 as Latin-1 bytes
  try {
    const bytes = new Uint8Array(name.length);
    for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (/[\u0600-\u06FF]/.test(decoded)) return decoded;
  } catch {}
  return name;
}

// ─── File Validation ───

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp',
  '.txt', '.csv', '.rtf', '.zip', '.rar', '.7z',
  '.mp4', '.mp3', '.wav', '.avi', '.mov',
];

const BLOCKED_EXTENSIONS = ['.exe', '.js', '.sh', '.bat', '.dll', '.apk', '.cmd', '.com', '.msi', '.ps1', '.vbs', '.wsf', '.scr'];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB - no practical limit

function validateFiles(files: File[]): { valid: File[]; errors: string[] } {
  const valid: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');

    // Empty file
    if (file.size === 0) {
      errors.push(`الملف فارغ: ${file.name}`);
      continue;
    }

    // File too large
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`حجم الملف كبير جداً (الحد 500MB): ${file.name}`);
      continue;
    }

    // Blocked extension
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      errors.push(`نوع الملف غير مسموح: ${file.name}`);
      continue;
    }

    // Unsupported extension
    if (ext !== '.' && !ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`نوع الملف غير مدعوم (${ext}): ${file.name}`);
      continue;
    }

    valid.push(file);
  }

  return { valid, errors };
}

// ─── Component ───

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [stats, setStats] = useState<ReportStats>({ total: 0, daily: 0, weekly: 0, monthly: 0, annual: 0, operational: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [filterTrack, setFilterTrack] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');

  // Form
  const [form, setForm] = useState<CreateReportForm>(INITIAL_FORM);

  // File attachments
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pageSize = 20;

  const loadReports = useCallback(async () => {
    try {
      const params: Record<string, any> = { page, pageSize };
      if (filterTrack) params.trackId = filterTrack;
      if (filterType) params.type = filterType;
      const { data } = await reportsApi.list(params);
      setReports(data.data);
      setTotal(data.total);
    } catch {
      toast.error('فشل تحميل التقارير');
    }
  }, [page, filterTrack, filterType]);

  const loadStats = async () => {
    try {
      const { data } = await reportsApi.stats();
      setStats(data);
    } catch {}
  };

  const loadTracks = async () => {
    try {
      const { data } = await tracksApi.list();
      setTracks(data);
    } catch {
      toast.error('فشل تحميل المسارات');
    }
  };

  useEffect(() => {
    Promise.all([loadReports(), loadStats(), loadTracks()]).finally(() =>
      setLoading(false),
    );
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filtered = reports.filter((r) => {
    if (!search) return true;
    return (
      r.title?.includes(search) ||
      r.author?.nameAr?.includes(search) ||
      r.track?.nameAr?.includes(search)
    );
  });

  const totalPages = Math.ceil(total / pageSize);

  // ─── Form handlers ───

  const updateForm = (field: keyof CreateReportForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * يدمج الحقول المستخرجة من الصوت في النموذج الحالي. لا يكتب على حقل إلا
   * لو الموديل أرجع له قيمة فعلية — حتى لو كتب المستخدم شيئاً يدوياً قبل
   * التسجيل لا نمسحه. المسار يُطابَق على القائمة الموجودة بمقارنة نصية
   * مرنة (تطبيع الألف/الياء + احتواء جزئي).
   */
  const handleVoiceFilled = (result: VoiceFillResult) => {
    const f = result.fields;
    const matchedTrackId = f.trackName ? findTrackId(f.trackName, tracks) : null;
    const validType = f.type && (TYPE_LABELS as any)[f.type] ? f.type : null;

    setForm((prev) => ({
      ...prev,
      trackId:        matchedTrackId  || prev.trackId,
      type:           (validType as any) || prev.type,
      reportDate:     f.reportDate    || prev.reportDate,
      title:          f.title         || prev.title,
      achievements:   f.achievements  || prev.achievements,
      kpiUpdates:     f.kpiUpdates    || prev.kpiUpdates,
      challenges:     f.challenges    || prev.challenges,
      supportNeeded:  f.supportNeeded || prev.supportNeeded,
      upcomingTasks:  f.upcomingTasks || prev.upcomingTasks,
      notes:          f.notes         || prev.notes,
    }));

    // ملاحظة للمستخدم لو ذكر مسار لم نتمكن من مطابقته
    if (f.trackName && !matchedTrackId) {
      toast(`لم نتمكّن من مطابقة المسار "${f.trackName}" مع القائمة — اخترْه يدوياً`, {
        icon: '⚠️',
        duration: 4000,
      });
    }
  };

  const handleFilesSelected = (files: FileList | File[]) => {
    const newFiles = Array.from(files);
    const { valid, errors } = validateFiles(newFiles);

    // Show validation errors
    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err, { duration: 4000 }));
    }

    if (valid.length === 0) return;

    // Deduplicate against already pending files
    const existingNames = new Set(pendingFiles.map((f) => f.name));
    const unique = valid.filter((f) => {
      if (existingNames.has(f.name)) {
        toast.error(`الملف مضاف مسبقاً: ${f.name}`);
        return false;
      }
      return true;
    });

    if (unique.length > 0) {
      setPendingFiles((prev) => [...prev, ...unique]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const uploadWithRetry = async (reportId: string, files: File[], maxRetries = 2): Promise<any> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        setUploadProgress(0);
        const form = new FormData();
        files.forEach((file) => form.append('files', file));
        const { data } = await api.post(`/reports/${reportId}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
          onUploadProgress: (e: any) => {
            if (e.total) {
              setUploadProgress(Math.round((e.loaded * 100) / e.total));
            }
          },
        });
        setUploadProgress(100);
        return data;
      } catch (err: any) {
        const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
        if (isNetworkError && attempt < maxRetries) {
          toast.error(`فشل الاتصال، جارٍ إعادة المحاولة... (${attempt + 1}/${maxRetries})`);
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        // Extract server error message
        const serverMsg = err.response?.data?.message;
        const msg = Array.isArray(serverMsg) ? serverMsg[0] : (serverMsg || 'فشل رفع الملفات، حاول مرة أخرى');
        throw new Error(msg);
      }
    }
  };

  const handleEdit = (report: Report) => {
    setEditingReport(report);
    setForm({
      trackId: report.track?.id || '',
      type: report.type,
      title: report.title,
      achievements: report.achievements || '',
      kpiUpdates: report.kpiUpdates || '',
      challenges: report.challenges || '',
      supportNeeded: report.supportNeeded || '',
      upcomingTasks: report.upcomingTasks || '',
      notes: report.notes || '',
      reportDate: report.reportDate ? report.reportDate.split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setPendingFiles([]);
    setShowForm(true);
    setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 0);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await reportsApi.delete(deleteTarget.id);
      toast.success('تم حذف التقرير بنجاح');
      setDeleteTarget(null);
      await Promise.all([loadReports(), loadStats()]);
    } catch {
      toast.error('فشل حذف التقرير');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.trackId) {
      toast.error('يرجى اختيار المسار');
      return;
    }
    if (!form.title.trim()) {
      toast.error('يرجى إدخال عنوان التقرير');
      return;
    }

    setSubmitting(true);
    try {
      // Combine the selected date with the current time to avoid midnight UTC → 3AM Saudi
      const now = new Date();
      const [y, m, d] = form.reportDate.split('-').map(Number);
      const reportDateTime = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
      // Send every text field so clearing a field actually persists.
      // Empty values are sent as null and written to the DB as NULL.
      const body: Record<string, any> = {
        trackId: form.trackId,
        type: form.type,
        title: form.title.trim(),
        reportDate: reportDateTime.toISOString(),
        achievements: form.achievements.trim() || null,
        kpiUpdates: form.kpiUpdates.trim() || null,
        challenges: form.challenges.trim() || null,
        supportNeeded: form.supportNeeded.trim() || null,
        upcomingTasks: form.upcomingTasks.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editingReport) {
        await reportsApi.update(editingReport.id, body);
        if (pendingFiles.length > 0) {
          setUploading(true);
          try {
            const result = await uploadWithRetry(editingReport.id, pendingFiles);
            if (result?.failed?.length > 0) {
              toast.error(`فشل رفع: ${result.failed.join(', ')}`);
            }
          } catch (err: any) {
            toast.error(err.message || 'فشل رفع المرفقات');
          } finally {
            setUploading(false);
            setUploadProgress(0);
          }
        }
        toast.success('تم تحديث التقرير بنجاح');
        setEditingReport(null);
        setForm(INITIAL_FORM);
        setPendingFiles([]);
        setShowForm(false);
        await Promise.all([loadReports(), loadStats()]);
        return;
      }

      const { data: newReport } = await reportsApi.create(body);

      if (pendingFiles.length > 0) {
        setUploading(true);
        try {
          const result = await uploadWithRetry(newReport.id, pendingFiles);
          const uploaded = result?.attachments?.length || pendingFiles.length;
          toast.success(`تم رفع ${uploaded} مرفق بنجاح`);
          if (result?.failed?.length > 0) {
            toast.error(`فشل رفع: ${result.failed.join(', ')}`);
          }
        } catch (err: any) {
          toast.error(err.message || 'تم إنشاء التقرير لكن فشل رفع المرفقات');
        } finally {
          setUploading(false);
          setUploadProgress(0);
        }
      }

      toast.success('تم إنشاء التقرير بنجاح');

      if (newReport.aiSummary) {
        toast.success('تم إنشاء ملخص الذكاء الاصطناعي', { icon: '🤖', duration: 4000 });
      }

      setForm(INITIAL_FORM);
      setPendingFiles([]);
      setShowForm(false);
      setPage(1);
      await Promise.all([loadReports(), loadStats()]);
    } catch {
      toast.error('فشل إنشاء التقرير');
    } finally {
      setSubmitting(false);
    }
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadAttachment = async (att: Attachment) => {
    setDownloadingId(att.id);
    const toastId = toast.loading('جارٍ تحميل الملف...');
    try {
      const { data } = await reportsApi.downloadAttachment(att.id);
      const blob = new Blob([data], { type: att.mimeType || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fixFileName(att.originalName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('تم تحميل الملف', { id: toastId });
    } catch (err: any) {
      let msg = 'تعذر تحميل الملف، حاول مرة أخرى';
      try {
        // Error response might be JSON in a blob
        const errData = err?.response?.data;
        if (errData instanceof Blob) {
          const text = await errData.text();
          const parsed = JSON.parse(text);
          msg = parsed.message || msg;
        } else if (errData?.message) {
          msg = typeof errData.message === 'string' ? errData.message : msg;
        }
      } catch {}
      toast.error(msg, { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteAttachment = async (reportId: string, attId: string) => {
    try {
      await reportsApi.deleteAttachment(attId);
      toast.success('تم حذف المرفق');
      await loadReports();
    } catch {
      toast.error('فشل حذف المرفق');
    }
  };

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">التقارير</h1>
          <p className="text-gray-400 mt-1">{total} تقرير</p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setEditingReport(null);
              setForm(INITIAL_FORM);
              setPendingFiles([]);
            } else {
              setEditingReport(null);
              setForm(INITIAL_FORM);
              setPendingFiles([]);
              setShowForm(true);
            }
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className={`w-4 h-4 transition-transform ${showForm ? 'rotate-45' : ''}`} />
          {showForm ? 'إلغاء' : 'تقرير جديد'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'إجمالي التقارير', value: stats.total, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/20' },
          { label: 'تقارير يومية', value: stats.daily, icon: Calendar, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
          { label: 'تقارير أسبوعية', value: stats.weekly, icon: Calendar, color: 'text-violet-400', bg: 'bg-violet-500/20' },
          { label: 'تقارير شهرية', value: stats.monthly, icon: Calendar, color: 'text-amber-400', bg: 'bg-amber-500/20' },
          { label: 'تقارير سنوية', value: stats.annual, icon: Calendar, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
          { label: 'تقارير تشغيلية', value: stats.operational, icon: Calendar, color: 'text-rose-400', bg: 'bg-rose-500/20' },
        ].map((stat) => (
          <div key={stat.label} className="glass p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold truncate">{stat.value}</p>
                <p className="text-xs text-gray-400">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Report Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-400" />
              {editingReport ? 'تعديل التقرير' : 'إنشاء تقرير جديد'}
            </h2>
            {!editingReport && <VoiceFillButton onFilled={handleVoiceFilled} />}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Track */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">المسار</label>
              <select
                value={form.trackId}
                onChange={(e) => updateForm('trackId', e.target.value)}
                className="input-field w-full"
                required
              >
                <option value="">اختر المسار</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameAr}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">نوع التقرير</label>
              <select
                value={form.type}
                onChange={(e) => updateForm('type', e.target.value)}
                className="input-field w-full"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">عنوان التقرير</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateForm('title', e.target.value)}
                placeholder="أدخل عنوان التقرير..."
                className="input-field w-full"
                required
              />
            </div>

            {/* Report Date */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">تاريخ التقرير</label>
              <input
                type="date"
                value={form.reportDate}
                onChange={(e) => updateForm('reportDate', e.target.value)}
                className="input-field w-full"
                required
              />
            </div>
          </div>

          {/* Attachments Section */}
          <div>
            <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
              <Paperclip className="w-4 h-4" />
              المرفقات
            </label>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-brand-400 bg-brand-500/10'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-2 ${dragOver ? 'text-brand-400' : 'text-gray-500'}`} />
              <p className="text-sm text-gray-400">
                اسحب الملفات هنا أو اضغط للاختيار
              </p>
              <p className="text-xs text-gray-600 mt-1">
                يدعم جميع أنواع الملفات (PDF, Word, Excel, صور, ZIP...)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Add File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-brand-300 hover:bg-brand-500/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              إضافة ملف
            </button>

            {/* Pending Files List */}
            {pendingFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {pendingFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-lg flex-shrink-0">{getFileIcon(file.type)}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-gray-500">
                  {pendingFiles.length} ملف — {formatFileSize(pendingFiles.reduce((s, f) => s + f.size, 0))}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Achievements */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">الإنجازات</label>
              <textarea
                value={form.achievements}
                onChange={(e) => updateForm('achievements', e.target.value)}
                placeholder="ما تم إنجازه خلال الفترة..."
                className="input-field w-full min-h-[100px] resize-y"
                rows={3}
              />
            </div>

            {/* KPI Updates */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">تحديثات مؤشرات الأداء</label>
              <textarea
                value={form.kpiUpdates}
                onChange={(e) => updateForm('kpiUpdates', e.target.value)}
                placeholder="تحديثات مؤشرات الأداء الرئيسية..."
                className="input-field w-full min-h-[100px] resize-y"
                rows={3}
              />
            </div>

            {/* Challenges */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">التحديات</label>
              <textarea
                value={form.challenges}
                onChange={(e) => updateForm('challenges', e.target.value)}
                placeholder="التحديات والعقبات التي واجهتها..."
                className="input-field w-full min-h-[100px] resize-y"
                rows={3}
              />
            </div>

            {/* Support Needed */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">الدعم المطلوب</label>
              <textarea
                value={form.supportNeeded}
                onChange={(e) => updateForm('supportNeeded', e.target.value)}
                placeholder="الدعم والموارد المطلوبة..."
                className="input-field w-full min-h-[100px] resize-y"
                rows={3}
              />
            </div>
          </div>

          {/* Upcoming Tasks */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">المهام القادمة</label>
            <textarea
              value={form.upcomingTasks}
              onChange={(e) => updateForm('upcomingTasks', e.target.value)}
              placeholder="المهام المخطط تنفيذها في الفترة القادمة..."
              className="input-field w-full min-h-[100px] resize-y"
              rows={3}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm('notes', e.target.value)}
              placeholder="ملاحظات إضافية..."
              className="input-field w-full min-h-[80px] resize-y"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || uploading}
              className="btn-primary flex items-center gap-2"
            >
              {(submitting || uploading) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {uploading ? `جارٍ رفع المرفقات${uploadProgress > 0 ? ` (${uploadProgress}%)` : '...'}` : submitting ? (editingReport ? 'جارٍ التحديث...' : 'جارٍ الإنشاء...') : (editingReport ? 'حفظ التعديلات' : 'إنشاء التقرير')}
            </button>
            {uploading && uploadProgress > 0 && (
              <div className="flex-1 max-w-[200px]">
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{uploadProgress}%</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setForm(INITIAL_FORM);
                setPendingFiles([]);
                setEditingReport(null);
                setShowForm(false);
              }}
              className="btn-secondary"
            >
              إلغاء
            </button>
            {pendingFiles.length > 0 && (
              <span className="text-xs text-gray-500 flex items-center gap-1 mr-auto">
                <Paperclip className="w-3 h-3" />
                {pendingFiles.length} مرفق
              </span>
            )}
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث بالعنوان أو الكاتب أو المسار..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pr-10"
          />
        </div>
        <select
          value={filterTrack}
          onChange={(e) => {
            setFilterTrack(e.target.value);
            setPage(1);
          }}
          className="input-field w-auto"
        >
          <option value="">كل المسارات</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nameAr}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(1);
          }}
          className="input-field w-auto"
        >
          <option value="">كل الأنواع</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Reports List */}
      <div className="space-y-3">
        {filtered.map((report) => (
          <div key={report.id} className="glass overflow-hidden">
            {/* Report Header (clickable) */}
            <button
              onClick={() =>
                setExpanded(expanded === report.id ? null : report.id)
              }
              className="w-full flex items-center justify-between p-4 text-right"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-gray-400" />
                </div>
                <div className="text-right min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {report.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400">
                      {report.author?.nameAr}
                    </span>
                    {report.track && (
                      <>
                        <span className="text-gray-600">|</span>
                        <span className="text-xs text-brand-300">
                          {report.track.nameAr}
                        </span>
                      </>
                    )}
                    <span className="text-gray-600">|</span>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(report.reportDate)}
                    </span>
                    {report.attachments && report.attachments.length > 0 && (
                      <>
                        <span className="text-gray-600">|</span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          {report.attachments.length} مرفق
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 mr-3">
                <span
                  className={`badge text-xs ${TYPE_COLORS[report.type] || 'bg-gray-500/20 text-gray-300'}`}
                >
                  {TYPE_LABELS[report.type] || report.type}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); handleEdit(report); }}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors cursor-pointer"
                  title="تعديل"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(report); }}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="حذف"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 transition-transform ${
                    expanded === report.id ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {/* AI Summary (always visible if present) */}
            {report.aiSummary && (
              <div className="px-4 pb-3">
                <div className="flex items-start gap-2 bg-brand-500/10 rounded-lg p-3">
                  <Brain className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-brand-300 mb-1">
                      ملخص الذكاء الاصطناعي
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {report.aiSummary}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Expanded Details */}
            {expanded === report.id && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {report.achievements && (
                    <DetailSection
                      title="الإنجازات"
                      content={report.achievements}
                      color="text-emerald-400"
                      bgColor="bg-emerald-500/10"
                    />
                  )}
                  {report.kpiUpdates && (
                    <DetailSection
                      title="تحديثات مؤشرات الأداء"
                      content={report.kpiUpdates}
                      color="text-blue-400"
                      bgColor="bg-blue-500/10"
                    />
                  )}
                  {report.challenges && (
                    <DetailSection
                      title="التحديات"
                      content={report.challenges}
                      color="text-amber-400"
                      bgColor="bg-amber-500/10"
                    />
                  )}
                  {report.supportNeeded && (
                    <DetailSection
                      title="الدعم المطلوب"
                      content={report.supportNeeded}
                      color="text-red-400"
                      bgColor="bg-red-500/10"
                    />
                  )}
                  {report.upcomingTasks && (
                    <DetailSection
                      title="المهام القادمة"
                      content={report.upcomingTasks}
                      color="text-cyan-400"
                      bgColor="bg-cyan-500/10"
                    />
                  )}
                </div>
                {report.notes && (
                  <DetailSection
                    title="ملاحظات"
                    content={report.notes}
                    color="text-gray-400"
                    bgColor="bg-white/5"
                  />
                )}

                {/* Attachments */}
                {report.attachments && report.attachments.length > 0 && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5" />
                      المرفقات ({report.attachments.length})
                    </p>
                    <div className="space-y-1.5">
                      {report.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-sm flex-shrink-0">{getFileIcon(att.mimeType)}</span>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-300 truncate">{fixFileName(att.originalName)}</p>
                              <p className="text-xs text-gray-600">{formatFileSize(att.sizeBytes)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleDownloadAttachment(att)}
                              disabled={downloadingId === att.id}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
                              title="تحميل"
                            >
                              {downloadingId === att.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleDeleteAttachment(report.id, att.id)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="glass p-8 text-center text-gray-500">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>لا توجد تقارير</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-sm text-gray-400 px-3">
            صفحة {page} من {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary text-sm disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">تأكيد الحذف</h3>
                <p className="text-sm text-gray-400">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 mb-5 border border-white/5">
              <p className="text-sm text-gray-300 line-clamp-2">{deleteTarget.title}</p>
            </div>
            <p className="text-sm text-gray-400 mb-5">
              هل أنت متأكد من حذف هذا التقرير؟ سيتم حذف جميع المرفقات المرتبطة به.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                حذف التقرير
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Section Component ───

function DetailSection({
  title,
  content,
  color,
  bgColor,
}: {
  title: string;
  content: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`rounded-lg p-3 ${bgColor}`}>
      <p className={`text-xs font-medium mb-1 ${color}`}>{title}</p>
      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
