'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ListChecks, Clock, CheckCircle, AlertTriangle, BarChart3,
  TrendingUp, RefreshCw, Users, Eye, FileBarChart,
  Trophy, Target, Activity, Zap, Lightbulb, AlertCircle,
  UserCheck, CalendarCheck, PieChart as PieChartIcon,
} from 'lucide-react';
import { tasksApi, analyticsApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber, formatPercent, TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, AreaChart, Area,
  CartesianGrid, Legend,
} from 'recharts';

// ─── Types ─────────────────────────────────────────
interface TrackStat {
  trackId: string;
  track: { id: string; nameAr: string; color: string } | null;
  count: number;
  completed: number;
  completionRate: number;
  avgProgress: number;
}

interface ExecStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: number;
  completionRate: number;
  trackStats: TrackStat[];
  recentUpdates: any[];
}

interface TimelinePoint { date: string; count: number }
interface ChartItem { name: string; color: string; value: number }
interface Insight { type: 'success' | 'warning' | 'info'; icon: string; title_ar: string; description_ar: string }
interface TrackPerf {
  id: string; name_ar: string; color: string;
  total_tasks: number; completed_tasks: number; overdue_tasks: number;
  recent_updates: number; employee_count: number; task_completion_rate: number;
}

interface Analytics {
  reports: {
    total_reports: number; total_ai_reports: number; completed_ai_reports: number;
    pending_ai_reports: number; failed_ai_reports: number;
    reports_by_track: ChartItem[]; reports_by_type: { name: string; value: number }[];
    reports_timeline: TimelinePoint[];
  };
  achievements: {
    total_achievements: number; total_deliverables: number;
    completed_deliverables: number; pending_deliverables: number;
    deliverables_by_track: ChartItem[]; achievements_by_track: ChartItem[];
    top_contributors: { name: string; completed_tasks: number }[];
  };
  performance: {
    task_completion_rate: number; avg_completion_days: number;
    active_users: number; total_users: number; engagement_rate: number;
    overdue_tasks: number; total_tasks: number; completed_tasks: number;
    tasks_by_status: Record<string, number>; tasks_by_priority: Record<string, number>;
    tasks_completed_by_track: ChartItem[]; updates_timeline: TimelinePoint[];
  };
  insights: Insight[];
  track_performance: TrackPerf[];
}

const BRAND_COLORS = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B', '#F43F5E', '#14B8A6', '#84CC16', '#6366f1'];
const AUTO_REFRESH_INTERVAL = 10_000;

// ─── Helper Components ─────────────────────────────
function SectionTitle({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      <div className="p-2 rounded-xl bg-white/5">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, subtitle }: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; bg: string; subtitle?: string;
}) {
  return (
    <div className="analytics-card group">
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl transition-transform group-hover:scale-110', bg)}>
          <Icon className={cn('w-5 h-5', color)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold truncate">{value}</p>
          <p className="text-xs text-gray-400">{label}</p>
          {subtitle && <p className="text-[10px] text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold">{value}%</span>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const iconMap: Record<string, React.ElementType> = {
    trophy: Trophy, 'alert-triangle': AlertTriangle, 'alert-circle': AlertCircle,
    'check-circle': CheckCircle, lightbulb: Lightbulb, clock: Clock,
  };
  const colorMap: Record<string, { text: string; bg: string; border: string }> = {
    success: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-r-emerald-500' },
    warning: { text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-r-amber-500' },
    info: { text: 'text-sky-300', bg: 'bg-sky-500/15', border: 'border-r-sky-500' },
  };
  const Icon = iconMap[insight.icon] || Lightbulb;
  const c = colorMap[insight.type] || colorMap.info;

  return (
    <div className={cn('analytics-card border-r-[3px]', c.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-xl shrink-0', c.bg)}>
          <Icon className={cn('w-4 h-4', c.text)} />
        </div>
        <div>
          <p className="text-sm font-medium">{insight.title_ar}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{insight.description_ar}</p>
        </div>
      </div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: 'rgba(17,24,39,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  color: '#e5e7eb',
  direction: 'rtl' as const,
  backdropFilter: 'blur(8px)',
};

// ─── Main Dashboard ────────────────────────────────
export default function ExecutiveDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ExecStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'performance' | 'insights'>('overview');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAdminOrPm = user?.role === 'admin' || user?.role === 'pm';

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        tasksApi.executiveStats(),
        analyticsApi.dashboard(),
      ]);
      setStats(statsRes.data);
      setAnalytics(analyticsRes.data);
      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdminOrPm) return;
    loadStats();
  }, [isAdminOrPm, loadStats]);

  useEffect(() => {
    if (!isAdminOrPm || !autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => loadStats(true), AUTO_REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAdminOrPm, autoRefresh, loadStats]);

  if (!isAdminOrPm) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <BarChart3 className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط للإدارة ومديري المشاريع</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">جارٍ تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  if (!stats || !analytics) return null;

  // Prepare chart data
  const trackChartData = stats.trackStats.map((ts) => ({
    name: ts.track?.nameAr || 'غير معروف',
    'نسبة الإنجاز': ts.completionRate,
    color: ts.track?.color || '#6366f1',
  }));

  const taskStatusDonut = Object.entries(analytics.performance.tasks_by_status)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: TASK_STATUS_LABELS[k] || k, value: v }));

  const taskPriorityDonut = Object.entries(analytics.performance.tasks_by_priority)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: PRIORITY_LABELS[k] || k, value: v }));

  const tabs = [
    { key: 'overview' as const, label: 'نظرة عامة', icon: BarChart3 },
    { key: 'reports' as const, label: 'التقارير', icon: FileBarChart },
    { key: 'performance' as const, label: 'الأداء', icon: Activity },
    { key: 'insights' as const, label: 'التحليلات الذكية', icon: Zap },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">لوحة القيادة التنفيذية</h1>
          <p className="text-gray-400 mt-1">تحليلات متقدمة ومؤشرات الأداء الرئيسية</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-gray-500" dir="ltr">
              {lastRefresh.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn('rounded-xl px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5',
              autoRefresh ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400')}>
            <RefreshCw className={cn('h-3.5 w-3.5', autoRefresh && 'animate-spin')} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            {autoRefresh ? 'تحديث تلقائي' : 'تلقائي'}
          </button>
          <button onClick={() => loadStats()} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06] w-fit">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              activeTab === tab.key ? 'bg-brand-500/15 text-brand-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/*  OVERVIEW TAB                              */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="إجمالي المهام" value={formatNumber(stats.total)} icon={ListChecks} color="text-blue-400" bg="bg-blue-500/20" />
            <StatCard label="قيد التنفيذ" value={formatNumber(stats.byStatus?.in_progress || 0)} icon={Clock} color="text-blue-400" bg="bg-blue-500/20" />
            <StatCard label="تحت المراجعة" value={formatNumber(stats.byStatus?.under_review || 0)} icon={Eye} color="text-orange-400" bg="bg-orange-500/20" />
            <StatCard label="مكتملة" value={formatNumber(stats.byStatus?.completed || 0)} icon={CheckCircle} color="text-emerald-400" bg="bg-emerald-500/20" />
            <StatCard label="متأخرة" value={formatNumber(stats.overdue || 0)} icon={AlertTriangle} color="text-red-400" bg="bg-red-500/20" />
            <StatCard label="نسبة الإنجاز" value={formatPercent(stats.completionRate || 0)} icon={TrendingUp} color="text-brand-400" bg="bg-brand-500/20" />
          </div>

          {/* Track Performance Cards */}
          <SectionTitle title="أداء المسارات" icon={Target} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analytics.track_performance.map((t) => (
              <div key={t.id} className="analytics-card" style={{ borderRight: `3px solid ${t.color}` }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">{t.name_ar}</h3>
                  <ProgressRing value={t.task_completion_rate} color={t.color} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: t.completed_tasks, l: 'مكتمل' },
                    { v: t.total_tasks, l: 'إجمالي' },
                    { v: t.overdue_tasks, l: 'متأخر', danger: t.overdue_tasks > 0 },
                    { v: t.employee_count, l: 'موظف' },
                  ].map((s, i) => (
                    <div key={i} className="text-center p-2 rounded-lg bg-white/[0.03]">
                      <p className={cn('text-base font-bold', s.danger && 'text-red-400')}>{s.v}</p>
                      <p className="text-[10px] text-gray-500">{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {trackChartData.length > 0 && (
              <div className="glass p-5">
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-gray-300">
                  <BarChart3 className="w-4 h-4 text-brand-400" />مقارنة إنجاز المسارات
                </h2>
                <ResponsiveContainer width="100%" height={Math.max(200, trackChartData.length * 45)}>
                  <BarChart data={trackChartData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(value: any, name: any) => [name === 'نسبة الإنجاز' ? `${value}%` : value, name]} />
                    <Bar dataKey="نسبة الإنجاز" radius={[0, 6, 6, 0]} barSize={18}>
                      {trackChartData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="glass p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-gray-300">
                <TrendingUp className="w-4 h-4 text-brand-400" />أداء المسارات
              </h2>
              {stats.trackStats.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">لا توجد بيانات مسارات</p>
              ) : (
                <div className="space-y-3">
                  {stats.trackStats.map((ts) => (
                    <div key={ts.trackId} className="bg-white/5 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ts.track?.color || '#6366f1' }} />
                          <span className="text-xs font-medium text-white">{ts.track?.nameAr || 'غير معروف'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                          <span>{formatNumber(ts.count)} مهمة</span>
                          <span>{formatNumber(ts.completed)} مكتملة</span>
                          <span className={cn('font-medium', ts.completionRate >= 70 ? 'text-emerald-400' : ts.completionRate >= 40 ? 'text-amber-400' : 'text-red-400')}>
                            {formatPercent(ts.completionRate)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${ts.completionRate}%`, backgroundColor: ts.track?.color || '#6366f1' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Insights */}
          {analytics.insights.length > 0 && (
            <>
              <SectionTitle title="تنبيهات ذكية" icon={Zap} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.insights.slice(0, 3).map((ins, i) => (
                  <InsightCard key={i} insight={ins} />
                ))}
              </div>
            </>
          )}

          {/* Recent Updates */}
          <div className="glass p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-gray-300">
              <RefreshCw className="w-4 h-4 text-brand-400" />آخر التحديثات
            </h2>
            {stats.recentUpdates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">لا توجد تحديثات حديثة</p>
            ) : (
              <div className="space-y-3">
                {stats.recentUpdates.slice(0, 10).map((upd: any) => (
                  <div key={upd.id} className="bg-white/5 rounded-xl p-3 flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/30 text-xs font-bold text-brand-200 shrink-0">
                      {upd.author?.nameAr?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-white">{upd.author?.nameAr || upd.author?.name}</span>
                        <span className="text-[10px] text-gray-500 shrink-0" dir="ltr">
                          {new Date(upd.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">في: <span className="text-gray-300">{upd.task?.titleAr || '---'}</span></p>
                      <p className="text-sm text-gray-300 mt-1 line-clamp-2">{upd.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/*  REPORTS TAB                               */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="إجمالي التقارير" value={formatNumber(analytics.reports.total_reports)} icon={FileBarChart} color="text-sky-400" bg="bg-sky-500/20" />
            <StatCard label="تقارير ذكية" value={formatNumber(analytics.reports.total_ai_reports)} icon={Zap} color="text-violet-400" bg="bg-violet-500/20"
              subtitle={`${analytics.reports.completed_ai_reports} مكتمل`} />
            <StatCard label="قيد المعالجة" value={formatNumber(analytics.reports.pending_ai_reports)} icon={Clock} color="text-amber-400" bg="bg-amber-500/20" />
            <StatCard label="فشلت" value={formatNumber(analytics.reports.failed_ai_reports)} icon={AlertCircle} color="text-red-400" bg="bg-red-500/20" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">التقارير حسب المسار</h3>
              {analytics.reports.reports_by_track.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, analytics.reports.reports_by_track.length * 40)}>
                  <BarChart data={analytics.reports.reports_by_track} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20}>
                      {analytics.reports.reports_by_track.map((entry, i) => (
                        <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد تقارير بعد</p>}
            </div>
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">التقارير حسب النوع</h3>
              {analytics.reports.reports_by_type.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={analytics.reports.reports_by_type} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                      paddingAngle={3} dataKey="value" nameKey="name">
                      {analytics.reports.reports_by_type.map((_, i) => (
                        <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11, direction: 'rtl' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد تقارير بعد</p>}
            </div>
          </div>

          {/* Reports Timeline */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold mb-4 text-gray-300">التقارير خلال آخر ٣٠ يوم</h3>
            {analytics.reports.reports_timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.reports.reports_timeline}>
                  <defs>
                    <linearGradient id="areaGradReports" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={(v: string) => { const p = v.split('-'); return p.length >= 3 ? `${p[2]}/${p[1]}` : v; }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'تقارير']} />
                  <Area type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2} fill="url(#areaGradReports)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد بيانات كافية</p>}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/*  PERFORMANCE TAB                           */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === 'performance' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="نسبة إنجاز المهام" value={`${analytics.performance.task_completion_rate}%`}
              icon={Target} color="text-emerald-400" bg="bg-emerald-500/20" />
            <StatCard label="متوسط وقت الإنجاز" value={`${analytics.performance.avg_completion_days}`}
              icon={Clock} color="text-sky-400" bg="bg-sky-500/20" subtitle="يوم" />
            <StatCard label="مستخدمون نشطون" value={formatNumber(analytics.performance.active_users)}
              icon={UserCheck} color="text-violet-400" bg="bg-violet-500/20" subtitle={`من ${analytics.performance.total_users}`} />
            <StatCard label="نسبة المتابعة" value={`${analytics.performance.engagement_rate}%`}
              icon={Activity} color="text-amber-400" bg="bg-amber-500/20" subtitle="التحديثات اليومية" />
            <StatCard label="مهام متأخرة" value={formatNumber(analytics.performance.overdue_tasks)}
              icon={AlertTriangle} color="text-red-400" bg="bg-red-500/20" />
            <StatCard label="مهام منجزة" value={formatNumber(analytics.performance.completed_tasks)}
              icon={CheckCircle} color="text-teal-400" bg="bg-teal-500/20" subtitle={`من ${analytics.performance.total_tasks}`} />
          </div>

          {/* Task Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">المهام حسب الحالة</h3>
              {taskStatusDonut.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={taskStatusDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                      paddingAngle={3} dataKey="value" nameKey="name">
                      {taskStatusDonut.map((_, i) => (<Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11, direction: 'rtl' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد مهام</p>}
            </div>
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">المهام حسب الأولوية</h3>
              {taskPriorityDonut.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={taskPriorityDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                      paddingAngle={3} dataKey="value" nameKey="name">
                      {taskPriorityDonut.map((_, i) => {
                        const colors = ['#71717a', '#3b82f6', '#f59e0b', '#ef4444'];
                        return <Cell key={i} fill={colors[i % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11, direction: 'rtl' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد مهام</p>}
            </div>
          </div>

          {/* Completed by Track + Updates Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">المهام المنجزة حسب المسار</h3>
              {analytics.performance.tasks_completed_by_track.some((t) => t.value > 0) ? (
                <ResponsiveContainer width="100%" height={Math.max(200, analytics.performance.tasks_completed_by_track.length * 40)}>
                  <BarChart data={analytics.performance.tasks_completed_by_track} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20}>
                      {analytics.performance.tasks_completed_by_track.map((entry, i) => (
                        <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد مهام منجزة</p>}
            </div>
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">التحديثات اليومية — آخر ٣٠ يوم</h3>
              {analytics.performance.updates_timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={analytics.performance.updates_timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={(v: string) => { const p = v.split('-'); return p.length >= 3 ? `${p[2]}/${p[1]}` : v; }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'تحديثات']} />
                    <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2.5}
                      dot={{ fill: '#8B5CF6', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#8B5CF6', stroke: '#111827', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد تحديثات</p>}
            </div>
          </div>

          {/* Achievements */}
          <SectionTitle title="الإنجازات والمخرجات" icon={Trophy} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="إجمالي الإنجازات" value={formatNumber(analytics.achievements.total_achievements)} icon={Trophy} color="text-amber-400" bg="bg-amber-500/20" />
            <StatCard label="إجمالي المخرجات" value={formatNumber(analytics.achievements.total_deliverables)} icon={Target} color="text-violet-400" bg="bg-violet-500/20" />
            <StatCard label="مخرجات مكتملة" value={formatNumber(analytics.achievements.completed_deliverables)} icon={CheckCircle} color="text-emerald-400" bg="bg-emerald-500/20" />
            <StatCard label="قيد التنفيذ" value={formatNumber(analytics.achievements.pending_deliverables)} icon={Clock} color="text-sky-400" bg="bg-sky-500/20" />
          </div>

          {/* Top Contributors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">أكثر المساهمين إنجازًا</h3>
              {analytics.achievements.top_contributors.length > 0 ? (
                <div className="space-y-3">
                  {analytics.achievements.top_contributors.map((c, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: `${BRAND_COLORS[i % BRAND_COLORS.length]}20`, color: BRAND_COLORS[i % BRAND_COLORS.length] }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold">{c.completed_tasks}</span>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500 text-center py-12">لا توجد بيانات</p>}
            </div>
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4 text-gray-300">المخرجات حسب المسار</h3>
              {analytics.achievements.deliverables_by_track.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={Math.max(200, analytics.achievements.deliverables_by_track.length * 40)}>
                  <BarChart data={analytics.achievements.deliverables_by_track} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20}>
                      {analytics.achievements.deliverables_by_track.map((entry, i) => (
                        <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-12">لا توجد مخرجات</p>}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/*  INSIGHTS TAB                              */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === 'insights' && (
        <>
          {/* Performance Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass p-8 flex flex-col items-center">
              <ProgressRing value={analytics.performance.task_completion_rate} color="#10B981" size={120} />
              <p className="text-sm font-semibold mt-4">نسبة إنجاز المهام</p>
              <p className="text-xs text-gray-400 mt-1">{analytics.performance.completed_tasks} من {analytics.performance.total_tasks} مهمة</p>
            </div>
            <div className="glass p-8 flex flex-col items-center">
              <ProgressRing value={analytics.performance.engagement_rate} color="#0EA5E9" size={120} />
              <p className="text-sm font-semibold mt-4">نسبة الالتزام بالمتابعة</p>
              <p className="text-xs text-gray-400 mt-1">التحديثات اليومية خلال ٧ أيام</p>
            </div>
            <div className="glass p-8 flex flex-col items-center">
              <ProgressRing value={Math.min(100, analytics.reports.total_reports > 0
                ? Math.round((analytics.reports.completed_ai_reports / Math.max(1, analytics.reports.total_ai_reports)) * 100) : 0)}
                color="#8B5CF6" size={120} />
              <p className="text-sm font-semibold mt-4">نسبة نجاح التقارير الذكية</p>
              <p className="text-xs text-gray-400 mt-1">{analytics.reports.completed_ai_reports} من {analytics.reports.total_ai_reports}</p>
            </div>
          </div>

          {/* Smart Insights */}
          <SectionTitle title="التحليلات والتوصيات الذكية" icon={Lightbulb} />
          {analytics.insights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analytics.insights.map((ins, i) => (<InsightCard key={i} insight={ins} />))}
            </div>
          ) : (
            <div className="glass p-12 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="font-semibold">لا توجد تنبيهات حالياً</p>
              <p className="text-sm text-gray-400 mt-1">جميع المسارات تعمل بشكل طبيعي</p>
            </div>
          )}

          {/* Track Comparison Table */}
          <SectionTitle title="مقارنة أداء المسارات" icon={BarChart3} />
          <div className="glass p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">المسار</th>
                  <th className="text-center py-3 px-3 text-gray-400 font-medium">الإنجاز</th>
                  <th className="text-center py-3 px-3 text-gray-400 font-medium">المهام</th>
                  <th className="text-center py-3 px-3 text-gray-400 font-medium">مكتمل</th>
                  <th className="text-center py-3 px-3 text-gray-400 font-medium">متأخر</th>
                  <th className="text-center py-3 px-3 text-gray-400 font-medium">التحديثات</th>
                  <th className="text-center py-3 px-3 text-gray-400 font-medium">الموظفين</th>
                </tr>
              </thead>
              <tbody>
                {analytics.track_performance.map((t) => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                        <span className="font-medium">{t.name_ar}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-3">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${t.task_completion_rate}%`, background: t.color }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8">{t.task_completion_rate}%</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-3">{t.total_tasks}</td>
                    <td className="text-center py-3 px-3 text-emerald-400">{t.completed_tasks}</td>
                    <td className="text-center py-3 px-3">
                      <span className={t.overdue_tasks > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>{t.overdue_tasks}</span>
                    </td>
                    <td className="text-center py-3 px-3">{t.recent_updates}</td>
                    <td className="text-center py-3 px-3">{t.employee_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
