'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceApi } from '@/lib/api';
import { parseFilenameFromHeaders, triggerBrowserDownload } from '@/lib/download';

interface KeyInsight {
  title: string;
  value: string;
  trend?: 'up' | 'down' | 'stable';
  severity?: string;
}
interface TrackAnalysisRow {
  trackName: string;
  attendanceRate: number;
  absences: number;
  recommendations?: string;
}
interface AbsencePattern {
  pattern: string;
  frequency: string;
  employees?: string[];
  severity?: string;
}
interface PerformerRow {
  name: string;
  score?: string | number;
  reason?: string;
}
interface AttentionRow {
  name: string;
  issue?: string;
  severity?: string;
}
interface RecommendationRow {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionItems?: string[];
}
interface RiskRow {
  type: string;
  level: 'low' | 'medium' | 'high';
  description: string;
  affectedCount: number;
}
interface CityRow {
  city: 'مكة المكرمة' | 'المدينة المنورة' | 'مشترك';
  employeeCount: number;
  attendanceRate: number;
  observation?: string;
}
interface ScheduleDeviation {
  name: string;
  track?: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
}
interface ScheduleCompliance {
  withinSchedule: number;
  outsideSchedule: number;
  complianceRate: number;
  punctualityWithinSchedule: number;
  deviations: ScheduleDeviation[];
  observation?: string;
}

interface AnalysisData {
  id: string;
  uploadId: string;
  executiveSummary: string;
  keyInsights: KeyInsight[];
  attendanceRate: number;
  punctualityRate: number;
  averageWorkHours: number;
  totalLateMinutes: number;
  trackAnalysis: TrackAnalysisRow[];
  absencePatterns: AbsencePattern[];
  topPerformers: PerformerRow[];
  needsAttention: AttentionRow[];
  recommendations: RecommendationRow[];
  riskFlags: RiskRow[];
  byCity?: CityRow[] | null;
  scheduleCompliance?: ScheduleCompliance | null;
  analyzedAt: string;
  version: number;
  isCached: boolean;
}

type Tab = 'insights' | 'cities' | 'charter' | 'tracks' | 'patterns' | 'people' | 'recommendations' | 'risks' | 'reports';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'insights',        label: 'رؤى رئيسية' },
  { key: 'cities',          label: 'حسب المدينة' },
  { key: 'charter',         label: 'الكراسة' },
  { key: 'tracks',          label: 'تحليل المسارات' },
  { key: 'patterns',        label: 'أنماط الغياب' },
  { key: 'people',          label: 'الموظفون' },
  { key: 'recommendations', label: 'التوصيات' },
  { key: 'risks',           label: 'المخاطر' },
  { key: 'reports',         label: 'التقارير' },
];

interface Props {
  uploadId: string | null;
  fileName?: string;
  open: boolean;
  onClose: () => void;
}

export function AnalysisDialog({ uploadId, fileName, open, onClose }: Props) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('insights');

  const load = useCallback(async () => {
    if (!uploadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await attendanceApi.getAnalysis(uploadId);
      setData(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'فشل جلب التحليل');
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  useEffect(() => {
    if (!open || !uploadId) return;
    setData(null);
    setTab('insights');
    load();
  }, [open, uploadId, load]);

  const handleRefresh = async () => {
    if (!uploadId) return;
    setRefreshing(true);
    const tid = toast.loading('جارٍ إعادة التحليل…');
    try {
      const res = await attendanceApi.refreshAnalysis(uploadId);
      setData(res.data);
      toast.success('تم إعادة تحليل الملف ✨', { id: tid });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل إعادة التحليل';
      toast.error(typeof msg === 'string' ? msg : 'فشل إعادة التحليل', { id: tid });
    } finally {
      setRefreshing(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-950/95 backdrop-blur-2xl border border-emerald-500/20 shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-xl border-b border-emerald-500/10 p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">تحليل ذكي للملف</h2>
                {fileName && (
                  <p className="text-sm text-slate-400 mt-0.5 truncate max-w-[440px]">{fileName}</p>
                )}
                {data && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    آخر تحليل: {new Date(data.analyzedAt).toLocaleString('ar-SA')}
                    {data.version > 1 && ` • النسخة ${data.version}`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {data?.isCached && (
                <span className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  تحليل محفوظ
                </span>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                إعادة التحليل
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading && <SkeletonBody />}

          {error && !loading && (
            <div className="py-12 text-center">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-slate-300 mb-3">{error}</p>
              <button
                onClick={load}
                className="text-sm px-3 py-1.5 rounded-lg bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-5">
              {/* Executive summary */}
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
                <h3 className="flex items-center gap-2 text-base font-bold text-emerald-300 mb-2">
                  <Target className="w-4 h-4" />
                  الملخص التنفيذي
                </h3>
                <p className="text-slate-200 leading-relaxed text-sm whitespace-pre-line">
                  {data.executiveSummary}
                </p>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric icon={<Users className="w-4 h-4" />} label="نسبة الحضور" value={`${data.attendanceRate.toFixed(1)}%`} color="emerald" />
                <Metric icon={<Clock className="w-4 h-4" />} label="نسبة الالتزام" value={`${data.punctualityRate.toFixed(1)}%`} color="blue" />
                <Metric icon={<BarChart3 className="w-4 h-4" />} label="متوسط ساعات العمل" value={`${data.averageWorkHours.toFixed(1)} س`} color="purple" />
                <Metric icon={<TrendingDown className="w-4 h-4" />} label="إجمالي دقائق التأخير" value={`${data.totalLateMinutes}`} color="amber" />
              </div>

              {/* Tabs */}
              <div className="border-b border-white/10 -mx-5 px-5 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`text-xs px-3 py-2 rounded-t-lg border-b-2 transition-colors ${
                        tab === t.key
                          ? 'border-emerald-400 text-emerald-300 bg-white/[0.02]'
                          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                {tab === 'insights' && <InsightsTab insights={data.keyInsights} />}
                {tab === 'cities' && <CitiesTab cities={data.byCity || []} />}
                {tab === 'charter' && <CharterTab compliance={data.scheduleCompliance || null} />}
                {tab === 'tracks' && <TracksTab tracks={data.trackAnalysis} />}
                {tab === 'patterns' && <PatternsTab patterns={data.absencePatterns} />}
                {tab === 'people' && (
                  <div className="grid md:grid-cols-2 gap-3">
                    <PeopleSection title="الموظفون المتميزون" icon={<Award className="w-4 h-4" />} variant="success" people={data.topPerformers} />
                    <PeopleSection title="يحتاجون متابعة" icon={<AlertTriangle className="w-4 h-4" />} variant="warning" people={data.needsAttention} />
                  </div>
                )}
                {tab === 'recommendations' && <RecommendationsTab recs={data.recommendations} />}
                {tab === 'risks' && <RisksTab risks={data.riskFlags} />}
                {tab === 'reports' && uploadId && <ReportsTab uploadId={uploadId} fileName={fileName} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────

function Metric({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'emerald' | 'blue' | 'purple' | 'amber';
}) {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-500/15 to-transparent border-emerald-500/20 text-emerald-300',
    blue:    'from-blue-500/15 to-transparent border-blue-500/20 text-blue-300',
    purple:  'from-purple-500/15 to-transparent border-purple-500/20 text-purple-300',
    amber:   'from-amber-500/15 to-transparent border-amber-500/20 text-amber-300',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${colorMap[color]}`}>
      <div className="opacity-80 mb-2">{icon}</div>
      <div className="text-xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function InsightsTab({ insights }: { insights: KeyInsight[] }) {
  if (insights.length === 0) return <Empty message="لا توجد رؤى." />;
  return (
    <div className="space-y-2">
      {insights.map((i, idx) => (
        <div key={idx} className="flex items-start gap-3 rounded-lg bg-slate-900/40 border border-slate-800 p-3">
          <div className="mt-0.5 shrink-0">
            {i.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
            {i.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
            {(!i.trend || i.trend === 'stable') && <BarChart3 className="w-4 h-4 text-blue-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white text-sm">{i.title}</div>
            <div className="text-xs text-slate-400 mt-0.5">{i.value}</div>
          </div>
          {i.severity && <SeverityBadge level={i.severity} />}
        </div>
      ))}
    </div>
  );
}

function TracksTab({ tracks }: { tracks: TrackAnalysisRow[] }) {
  if (tracks.length === 0) return <Empty message="لا توجد بيانات مسارات." />;
  return (
    <div className="space-y-2">
      {tracks.map((t, i) => (
        <div key={i} className="rounded-lg bg-slate-900/40 border border-slate-800 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <h4 className="font-bold text-white text-sm">{t.trackName}</h4>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                {Number(t.attendanceRate).toFixed(1)}% حضور
              </span>
              <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-300 border border-red-500/20">
                {t.absences} غياب
              </span>
            </div>
          </div>
          {t.recommendations && (
            <p className="text-xs text-slate-400 leading-relaxed">{t.recommendations}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function PatternsTab({ patterns }: { patterns: AbsencePattern[] }) {
  if (patterns.length === 0) return <Empty message="لا توجد أنماط ملحوظة." />;
  return (
    <div className="space-y-2">
      {patterns.map((p, i) => (
        <div key={i} className="rounded-lg bg-amber-500/[0.04] border border-amber-500/20 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="font-semibold text-amber-300 text-sm">{p.pattern}</div>
            {p.severity && <SeverityBadge level={p.severity} />}
          </div>
          <div className="text-xs text-slate-300">التكرار: <span className="text-slate-200">{p.frequency}</span></div>
          {p.employees && p.employees.length > 0 && (
            <div className="text-xs text-slate-400 mt-1">
              {p.employees.slice(0, 5).join('، ')}
              {p.employees.length > 5 && <span className="text-slate-500"> +{p.employees.length - 5}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PeopleSection({
  title,
  icon,
  variant,
  people,
}: {
  title: string;
  icon: React.ReactNode;
  variant: 'success' | 'warning';
  people: Array<PerformerRow & AttentionRow>;
}) {
  const cls = variant === 'success'
    ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
    : 'border-amber-500/20 bg-amber-500/[0.03]';
  return (
    <div className={`rounded-xl border ${cls} p-4`}>
      <h4 className="flex items-center gap-2 font-bold text-white text-sm mb-3">
        {icon} {title}
      </h4>
      {people.length === 0 ? (
        <Empty message="لا يوجد." compact />
      ) : (
        <div className="space-y-1.5">
          {people.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-slate-950/40">
              <span className="text-xs text-slate-200 truncate">{p.name}</span>
              <span className="text-[11px] text-slate-400 truncate max-w-[60%] text-left">
                {p.reason || p.issue || (p.score ? String(p.score) : '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecommendationsTab({ recs }: { recs: RecommendationRow[] }) {
  if (recs.length === 0) return <Empty message="لا توجد توصيات." />;
  const colorByPriority: Record<string, string> = {
    high:   'border-red-500/30 bg-red-500/[0.04]',
    medium: 'border-amber-500/30 bg-amber-500/[0.04]',
    low:    'border-blue-500/30 bg-blue-500/[0.04]',
  };
  const priorityLabel: Record<string, string> = {
    high: 'عاجل',
    medium: 'متوسط',
    low: 'منخفض',
  };
  return (
    <div className="space-y-2">
      {recs.map((r, i) => (
        <div key={i} className={`rounded-lg border p-3 ${colorByPriority[r.priority] ?? 'border-slate-800 bg-slate-900/40'}`}>
          <div className="flex items-start gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md bg-white/5 text-slate-200 border border-white/10">
              {priorityLabel[r.priority] ?? r.priority}
            </span>
            <h5 className="font-bold text-white text-sm flex-1">{r.title}</h5>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{r.description}</p>
          {r.actionItems && r.actionItems.length > 0 && (
            <ul className="mt-2 space-y-1">
              {r.actionItems.map((a, k) => (
                <li key={k} className="text-xs text-slate-300 flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function RisksTab({ risks }: { risks: RiskRow[] }) {
  if (risks.length === 0) return <Empty message="لا توجد مخاطر مرصودة." />;
  return (
    <div className="space-y-2">
      {risks.map((r, i) => (
        <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="font-bold text-red-300 text-sm flex-1">{r.type}</span>
            <SeverityBadge level={r.level} />
          </div>
          <p className="text-xs text-slate-300">{r.description}</p>
          <p className="text-[11px] text-slate-500 mt-1.5">عدد المتأثرين: <span className="text-slate-300">{r.affectedCount}</span></p>
        </div>
      ))}
    </div>
  );
}

function CitiesTab({ cities }: { cities: CityRow[] }) {
  if (cities.length === 0) {
    return (
      <Empty message="لم يتم استيراد المدن — ارفع جدول الكراسة من صفحة الحضور لتحديث بيانات الموظفين." />
    );
  }
  const colorByCity: Record<string, string> = {
    'مكة المكرمة':    'border-emerald-500/30 from-emerald-500/15 text-emerald-300',
    'المدينة المنورة': 'border-blue-500/30 from-blue-500/15 text-blue-300',
    'مشترك':           'border-slate-500/30 from-slate-500/15 text-slate-300',
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cities.map((c, i) => (
          <div
            key={i}
            className={`rounded-xl border bg-gradient-to-br to-transparent p-4 ${
              colorByCity[c.city] ?? 'border-slate-500/30 from-slate-500/15 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 opacity-80" />
              <span className="text-sm font-bold text-white">{c.city}</span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">
              {c.employeeCount}
              <span className="text-xs text-slate-400 mr-1">موظف</span>
            </div>
            <div className="text-[11px] mt-1 opacity-90">
              نسبة الحضور: <span className="font-semibold tabular-nums">{c.attendanceRate.toFixed(1)}%</span>
            </div>
            {c.observation && (
              <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">{c.observation}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CharterTab({ compliance }: { compliance: ScheduleCompliance | null }) {
  if (!compliance) {
    return (
      <Empty message="بيانات الكراسة غير متوفرة. ارفع جدول الكراسة (xlsx) من صفحة الحضور أولاً." />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={<ShieldCheck className="w-4 h-4" />} label="ضمن الكراسة" value={`${compliance.withinSchedule}`} color="emerald" />
        <Metric icon={<Users className="w-4 h-4" />} label="خارج الكراسة" value={`${compliance.outsideSchedule}`} color="blue" />
        <Metric icon={<CheckCircle2 className="w-4 h-4" />} label="نسبة الالتزام" value={`${compliance.complianceRate.toFixed(1)}%`} color="purple" />
        <Metric icon={<Clock className="w-4 h-4" />} label="الانضباط الزمني" value={`${compliance.punctualityWithinSchedule.toFixed(1)}%`} color="amber" />
      </div>

      {compliance.observation && (
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-4">
          <h4 className="text-sm font-bold text-emerald-300 mb-1">ملاحظة عامة</h4>
          <p className="text-xs text-slate-200 leading-relaxed">{compliance.observation}</p>
        </div>
      )}

      <div>
        <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          انحرافات عن الجدول الرسمي
        </h4>
        {compliance.deviations.length === 0 ? (
          <Empty message="لا توجد انحرافات ملحوظة عن الكراسة في هذه الفترة." />
        ) : (
          <div className="space-y-2">
            {compliance.deviations.map((d, i) => (
              <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-white truncate">{d.name}</span>
                    {d.track && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 truncate">
                        {d.track}
                      </span>
                    )}
                  </div>
                  <SeverityBadge level={d.severity} />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{d.issue}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportsTab({ uploadId, fileName }: { uploadId: string; fileName?: string }) {
  const [busy, setBusy] = useState<'docx' | 'xlsx' | null>(null);

  const download = async (kind: 'docx' | 'xlsx') => {
    setBusy(kind);
    const tid = toast.loading(kind === 'docx' ? 'تجهيز ملف Word…' : 'تجهيز ملف Excel…');
    try {
      const res = kind === 'docx'
        ? await attendanceApi.exportDocx(uploadId)
        : await attendanceApi.exportXlsx(uploadId, 'all');
      const filename = parseFilenameFromHeaders(
        res.headers,
        kind === 'docx' ? 'attendance-report.docx' : 'attendance-report.xlsx',
      );
      const mime = kind === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      triggerBrowserDownload(res.data, filename, mime);
      toast.success('تم التحميل ✓', { id: tid });
    } catch (err: any) {
      const msg = err?.response?.data?.message || `فشل تحميل ${kind === 'docx' ? 'Word' : 'Excel'}`;
      toast.error(typeof msg === 'string' ? msg : 'فشل التحميل', { id: tid });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-emerald-300 mb-1">
          <Download className="w-4 h-4" />
          تحميل التقرير الشامل
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          يحتوي التقرير على: غلاف، ملخص KPIs، تحليل حسب المسار والمدينة، الالتزام بالكراسة، وصفحة لكل
          موظف بسجله اليومي الكامل.
        </p>
        {fileName && <p className="mt-1 text-[11px] text-slate-500">المصدر: {fileName}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          onClick={() => download('docx')}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/15 px-5 py-4 text-sm font-bold text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
        >
          {busy === 'docx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          تحميل Word (DOCX)
        </button>
        <button
          onClick={() => download('xlsx')}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-5 py-4 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {busy === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          تحميل Excel (XLSX)
        </button>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        تصدير PDF قيد التجهيز — استخدم Word مؤقتاً (قابل للحفظ كـ PDF من داخل Word).
      </p>
    </div>
  );
}

function SeverityBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    high:     'bg-red-500/15 text-red-300 border-red-500/30',
    critical: 'bg-red-500/20 text-red-200 border-red-500/40',
    medium:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
    warning:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
    low:      'bg-blue-500/15 text-blue-300 border-blue-500/30',
    info:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
  };
  const cls = map[level] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${cls}`}>{level}</span>;
}

function Empty({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className={`text-center text-slate-500 ${compact ? 'py-2 text-xs' : 'py-8 text-sm'}`}>{message}</div>
  );
}

function SkeletonBody() {
  return (
    <div className="space-y-4 py-2">
      <div className="h-28 rounded-xl bg-slate-800/40 animate-pulse" />
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-800/40 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-slate-800/30 animate-pulse" />
      <div className="flex items-center justify-center text-slate-500 gap-2 py-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        جارٍ تشغيل الذكاء الاصطناعي…
      </div>
    </div>
  );
}
