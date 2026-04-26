'use client';

/**
 * AI Reports Intelligence Center — مركز ذكاء التقارير
 *
 * Restricted to roles: admin, system_manager (enforced server-side and by sidebar).
 * Phase 1: collect reports by filters → AI generate → preview + per-section edit
 *          → export (TXT, MD, DOCX, XLSX, PPTX, PDF-via-print) → history.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Sparkles,
  FileText,
  Upload,
  Loader2,
  RotateCcw,
  Save,
  Download,
  Printer,
  Trash2,
  Clock,
  ShieldCheck,
  ChevronDown,
  FileSpreadsheet,
  Presentation,
  FileCode,
  FileType,
  AlertCircle,
  X,
} from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { intelligenceApi, tracksApi } from '@/lib/api';

const OUTPUT_MODES = [
  { value: 'executive_summary', label: 'ملخص تنفيذي', desc: 'موجز 3–5 أقسام لصنّاع القرار' },
  { value: 'detailed', label: 'تقرير مفصل', desc: 'جميع الأقسام بتفاصيل عملياتية' },
  { value: 'track_by_track', label: 'ملخص حسب المسارات', desc: 'ملخص منفصل لكل مسار' },
  { value: 'template_prep', label: 'تحضير للقالب', desc: 'صياغة قابلة للإدراج في قالب' },
  { value: 'custom', label: 'مخصص', desc: 'اتبع تعليمات المستخدم الإضافية' },
];

const REPORT_TYPES = [
  { value: 'daily', label: 'يومي' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
  { value: 'annual', label: 'سنوي' },
  { value: 'operational', label: 'تشغيلي' },
];

const EXPORT_FORMATS: Array<{
  key: 'txt' | 'md' | 'docx' | 'xlsx' | 'pptx' | 'pdf';
  label: string;
  icon: any;
}> = [
  { key: 'docx', label: 'Word (DOCX)', icon: FileText },
  { key: 'xlsx', label: 'Excel (XLSX)', icon: FileSpreadsheet },
  { key: 'pptx', label: 'PowerPoint (PPTX)', icon: Presentation },
  { key: 'pdf', label: 'PDF (طباعة)', icon: Printer },
  { key: 'md', label: 'Markdown', icon: FileCode },
  { key: 'txt', label: 'Text', icon: FileType },
];

interface Track {
  id: string;
  nameAr: string;
  name: string;
  color?: string;
}

interface Session {
  id: string;
  outputMode: string;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  errorMessage?: string | null;
  filters: any;
  sourceReportCount: number;
  generatedContent?: { sections?: Array<{ key: string; body: string }> } | null;
  editedContent?: { sections?: Array<{ key: string; body: string }> } | null;
  modelUsed?: string | null;
  customInstructions?: string | null;
  createdAt: string;
  updatedAt: string;
  template?: { id: string; originalName: string; mimeType: string; sizeBytes?: number } | null;
}

const SECTION_LABEL: Record<string, string> = {
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

export default function ReportsIntelligencePage() {
  const router = useRouter();
  const { user } = useAuth();

  // ── Access gate (belt + suspenders; server also enforces) ──────────────
  const allowed = user?.role === 'admin' || user?.role === 'system_manager';
  useEffect(() => {
    if (user && !allowed) router.replace('/');
  }, [user, allowed, router]);

  // ── State ──────────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState<Track[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(twoWeeksAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [excludeEmpty, setExcludeEmpty] = useState(true);
  const [outputMode, setOutputMode] = useState('executive_summary');
  const [customInstructions, setCustomInstructions] = useState('');

  const [template, setTemplate] = useState<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  } | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const [generating, setGenerating] = useState(false);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [editedSections, setEditedSections] = useState<Array<{ key: string; body: string }>>([]);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // ── Load tracks + history on mount ─────────────────────────────────────
  useEffect(() => {
    if (!allowed) return;
    tracksApi.list().then(({ data }) => setTracks(data)).catch(() => {});
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  async function refreshHistory() {
    setLoadingHistory(true);
    try {
      const { data } = await intelligenceApi.listSessions({ pageSize: 20 });
      setSessions(data.data || []);
    } catch {
      // silent — empty state handles it
    } finally {
      setLoadingHistory(false);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  function toggleTrack(id: string) {
    setSelectedTracks((xs) =>
      xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id],
    );
  }
  function toggleType(v: string) {
    setSelectedTypes((xs) =>
      xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v],
    );
  }

  async function handleTemplateUpload(file: File) {
    setUploadingTemplate(true);
    try {
      const { data } = await intelligenceApi.uploadTemplate(file);
      setTemplate(data);
      toast.success('تم رفع القالب');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'فشل رفع القالب');
    } finally {
      setUploadingTemplate(false);
      if (templateInputRef.current) templateInputRef.current.value = '';
    }
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setExportMenuOpen(false);
    const toastId = toast.loading('جارٍ تحليل التقارير وإنتاج المخرَج...');
    try {
      const { data } = await intelligenceApi.createSession({
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
        trackIds: selectedTracks.length ? selectedTracks : undefined,
        reportTypes: selectedTypes.length ? selectedTypes : undefined,
        excludeEmpty,
        outputMode,
        customInstructions: customInstructions.trim() || undefined,
        templateId: template?.id,
      });
      if (data.status === 'failed') {
        toast.error(`تعذّر الإنتاج: ${data.errorMessage || 'خطأ غير معروف'}`, { id: toastId });
      } else {
        toast.success(
          `تم إنتاج التقرير من ${data.sourceReportCount} مصدر`,
          { id: toastId },
        );
      }
      setActiveSession(data);
      seedEditableSections(data);
      refreshHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'فشل إنتاج التقرير', { id: toastId });
    } finally {
      setGenerating(false);
    }
  }

  function seedEditableSections(s: Session) {
    const base = s.editedContent?.sections ?? s.generatedContent?.sections ?? [];
    setEditedSections(base.map((x) => ({ key: x.key, body: x.body ?? '' })));
  }

  async function openSession(id: string) {
    try {
      const { data } = await intelligenceApi.getSession(id);
      setActiveSession(data);
      seedEditableSections(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error('تعذّر فتح الجلسة');
    }
  }

  async function handleSaveEdits() {
    if (!activeSession) return;
    setSavingEdits(true);
    try {
      const { data } = await intelligenceApi.updateSession(activeSession.id, {
        editedContent: { sections: editedSections },
      });
      setActiveSession(data);
      toast.success('تم حفظ التعديلات');
    } catch {
      toast.error('فشل الحفظ');
    } finally {
      setSavingEdits(false);
    }
  }

  async function handleRegenerateSection(section: string | null) {
    if (!activeSession) return;
    setRegeneratingKey(section ?? '__all__');
    try {
      const { data } = await intelligenceApi.regenerate(activeSession.id, section ?? undefined);
      setActiveSession(data);
      seedEditableSections(data);
      toast.success(section ? 'تم تحديث القسم' : 'تم إعادة الإنتاج');
    } catch {
      toast.error('تعذّرت إعادة الإنتاج');
    } finally {
      setRegeneratingKey(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('هل تريد حذف هذه الجلسة نهائياً؟')) return;
    try {
      await intelligenceApi.deleteSession(id);
      if (activeSession?.id === id) {
        setActiveSession(null);
        setEditedSections([]);
      }
      refreshHistory();
      toast.success('تم الحذف');
    } catch {
      toast.error('فشل الحذف');
    }
  }

  async function handleExport(format: 'txt' | 'md' | 'docx' | 'xlsx' | 'pptx') {
    if (!activeSession) return;
    setExportMenuOpen(false);
    try {
      const res = await intelligenceApi.downloadExport(activeSession.id, format);
      const disposition = res.headers['content-disposition'] || '';
      const matchStar = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const matchPlain = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = matchStar
        ? decodeURIComponent(matchStar[1])
        : matchPlain?.[1] || `intelligence-report.${format}`;
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('فشل التصدير');
    }
  }

  // ── Loading / auth gate ────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <ShieldCheck className="w-6 h-6 me-2" />
        لا تملك صلاحية للوصول إلى هذه الصفحة
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="glass p-6 rounded-2xl border border-white/10">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-sky-500/20 border border-white/10">
            <Sparkles className="w-6 h-6 text-violet-300" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">مركز ذكاء التقارير</h1>
            <p className="text-sm text-gray-400 mt-1">
              يُجمّع الذكاء الاصطناعي كل التقارير الخاضعة للمعايير المحددة، ويعيد صياغتها في تقرير تنفيذي موحد جاهز للمراجعة والتصدير.
            </p>
          </div>
        </div>
      </div>

      {/* Filters + Generate row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Filters card */}
        <div className="lg:col-span-2 glass p-5 rounded-2xl border border-white/10 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">المعايير</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">من تاريخ</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">المسارات</label>
            <div className="flex flex-wrap gap-2">
              <Pill active={selectedTracks.length === 0} onClick={() => setSelectedTracks([])}>
                كل المسارات
              </Pill>
              {tracks.map((t) => (
                <Pill
                  key={t.id}
                  active={selectedTracks.includes(t.id)}
                  onClick={() => toggleTrack(t.id)}
                >
                  {t.nameAr || t.name}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">أنواع التقارير</label>
            <div className="flex flex-wrap gap-2">
              <Pill active={selectedTypes.length === 0} onClick={() => setSelectedTypes([])}>
                كل الأنواع
              </Pill>
              {REPORT_TYPES.map((t) => (
                <Pill
                  key={t.value}
                  active={selectedTypes.includes(t.value)}
                  onClick={() => toggleType(t.value)}
                >
                  {t.label}
                </Pill>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeEmpty}
              onChange={(e) => setExcludeEmpty(e.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            استبعاد التقارير الفارغة (بدون محتوى)
          </label>
        </div>

        {/* Output mode + template + generate */}
        <div className="glass p-5 rounded-2xl border border-white/10 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">نمط المخرَج</h2>
          <div className="space-y-2">
            {OUTPUT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setOutputMode(m.value)}
                className={`w-full text-start rounded-xl border p-3 transition-colors ${
                  outputMode === m.value
                    ? 'border-brand-500/60 bg-brand-500/10'
                    : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <div className="text-sm font-medium text-white">{m.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>

          {outputMode === 'custom' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">تعليمات إضافية</label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                className="input-field w-full min-h-[80px] resize-y text-sm"
                placeholder="مثلاً: ركّز على المخاطر المالية وادمج المسارات المتشابهة..."
              />
            </div>
          )}

          {/* Template upload */}
          <div className="pt-3 border-t border-white/10">
            <label className="block text-xs text-gray-400 mb-2">قالب (اختياري)</label>
            {template ? (
              <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-2">
                <FileText className="w-4 h-4 text-sky-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white truncate">{template.originalName}</div>
                  <div className="text-[10px] text-gray-500">
                    {(template.sizeBytes / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  onClick={() => setTemplate(null)}
                  className="p-1 rounded hover:bg-white/10 text-gray-400"
                  title="إزالة"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => templateInputRef.current?.click()}
                disabled={uploadingTemplate}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 py-4 text-sm text-gray-400 hover:bg-white/5 disabled:opacity-50"
              >
                {uploadingTemplate ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploadingTemplate ? 'جارٍ الرفع...' : 'رفع قالب (Word, Excel, PPT, PDF)'}
              </button>
            )}
            <input
              ref={templateInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleTemplateUpload(f);
              }}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? 'جارٍ الإنتاج...' : 'إنتاج التقرير'}
          </button>
        </div>
      </div>

      {/* Active session preview */}
      {activeSession && (
        <div className="glass rounded-2xl border border-white/10">
          <div className="flex items-center justify-between p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-sky-300" />
              <div>
                <h2 className="text-lg font-bold text-white">المعاينة والتحرير</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeSession.sourceReportCount} مصدر |{' '}
                  {new Date(activeSession.createdAt).toLocaleString('ar-SA')} |{' '}
                  {activeSession.modelUsed || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 relative">
              <button
                onClick={() => handleRegenerateSection(null)}
                disabled={regeneratingKey === '__all__'}
                className="px-3 py-2 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-50 flex items-center gap-1.5"
              >
                {regeneratingKey === '__all__' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                إعادة إنتاج
              </button>
              <button
                onClick={handleSaveEdits}
                disabled={savingEdits || activeSession.status !== 'ready'}
                className="px-3 py-2 text-xs rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingEdits ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                حفظ التعديلات
              </button>
              <div className="relative">
                <button
                  onClick={() => setExportMenuOpen((x) => !x)}
                  disabled={activeSession.status !== 'ready'}
                  className="px-3 py-2 text-xs rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  تصدير
                  <ChevronDown className="w-3 h-3" />
                </button>
                {exportMenuOpen && (
                  <div className="absolute top-full mt-2 left-0 z-20 min-w-[200px] rounded-xl border border-white/10 bg-[#0f1117] shadow-xl overflow-hidden">
                    {EXPORT_FORMATS.map((f) =>
                      f.key === 'pdf' ? (
                        <a
                          key={f.key}
                          href={`/reports-intelligence/${activeSession.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setExportMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 text-start"
                        >
                          <f.icon className="w-3.5 h-3.5 text-gray-400" />
                          {f.label}
                        </a>
                      ) : (
                        <button
                          key={f.key}
                          onClick={() => handleExport(f.key as Exclude<typeof f.key, 'pdf'>)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 text-start"
                        >
                          <f.icon className="w-3.5 h-3.5 text-gray-400" />
                          {f.label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeSession.status === 'failed' && (
            <div className="m-5 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">فشل الإنتاج</div>
                <div className="text-xs opacity-80 mt-1">
                  {activeSession.errorMessage || 'تحقّق من توفّر مفتاح OpenAI وأعد المحاولة.'}
                </div>
              </div>
            </div>
          )}

          {activeSession.status === 'ready' && editedSections.length === 0 && (
            <div className="p-10 text-center text-sm text-gray-400">
              لا توجد محتويات — قد لا تتوافق أي تقارير مع المعايير المحددة.
            </div>
          )}

          <div className="p-5 space-y-4">
            {editedSections.map((s, idx) => (
              <div key={s.key} className="rounded-xl border border-white/10 bg-white/[0.02]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <h3 className="text-sm font-semibold text-white">
                    {SECTION_LABEL[s.key] || s.key}
                  </h3>
                  <button
                    onClick={() => handleRegenerateSection(s.key)}
                    disabled={regeneratingKey === s.key}
                    className="text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1 disabled:opacity-50"
                  >
                    {regeneratingKey === s.key ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    إعادة صياغة هذا القسم
                  </button>
                </div>
                <textarea
                  value={s.body}
                  onChange={(e) =>
                    setEditedSections((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, body: e.target.value } : p)),
                    )
                  }
                  dir="auto"
                  rows={Math.max(3, Math.min(12, (s.body || '').split('\n').length + 1))}
                  placeholder="(فارغ)"
                  className="w-full bg-transparent border-0 p-4 text-sm text-gray-100 leading-relaxed resize-y focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="glass rounded-2xl border border-white/10">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-200">الجلسات السابقة</h2>
          </div>
        </div>
        <div className="p-5">
          {loadingHistory ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              لا توجد جلسات سابقة بعد
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={activeSession?.id === s.id}
                  onOpen={() => openSession(s.id)}
                  onDelete={() => handleDelete(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
        active
          ? 'border-brand-500/60 bg-brand-500/15 text-brand-200'
          : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function SessionRow({
  session,
  active,
  onOpen,
  onDelete,
}: {
  session: Session;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    draft: { label: 'مسودة', cls: 'bg-gray-500/20 text-gray-300' },
    generating: { label: 'قيد الإنتاج', cls: 'bg-sky-500/20 text-sky-300' },
    ready: { label: 'جاهز', cls: 'bg-emerald-500/20 text-emerald-300' },
    failed: { label: 'فشل', cls: 'bg-red-500/20 text-red-300' },
  };
  const st = statusMap[session.status] || statusMap.draft;
  const modeLabel = OUTPUT_MODES.find((m) => m.value === session.outputMode)?.label || session.outputMode;
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${
        active ? 'border-brand-500/40 bg-brand-500/5' : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <button onClick={onOpen} className="flex-1 text-start">
        <div className="text-sm text-white flex items-center gap-2">
          {modeLabel}
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${st.cls}`}>{st.label}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {new Date(session.createdAt).toLocaleString('ar-SA')} · {session.sourceReportCount} مصدر
          {session.template ? ` · قالب: ${session.template.originalName}` : ''}
        </div>
      </button>
      <button
        onClick={onDelete}
        className="p-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10"
        title="حذف"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
