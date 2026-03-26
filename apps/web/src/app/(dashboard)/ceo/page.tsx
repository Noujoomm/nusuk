'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  BarChart3, RefreshCw, Shield, Target, Activity, Lightbulb,
  AlertTriangle, CheckCircle, Clock, TrendingUp, Users, FileBarChart,
  Zap, Trophy, ArrowUpDown, ChevronLeft, Loader2, X,
} from 'lucide-react';
import { analyticsApi, tracksApi, tasksApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber, formatPercent, TASK_STATUS_LABELS } from '@/lib/utils';
import type { Analytics, TrackPerf, Insight, ActivityItem } from '@/components/dashboards/executive';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B', '#F43F5E', '#14B8A6', '#84CC16', '#6366f1'];
const REFRESH = 12_000;
const ttStyle = { backgroundColor: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e5e7eb', direction: 'rtl' as const };

// ─── Helpers ────────────────────────────────────────
function Ring({ value, color, size = 90 }: { value: number; color: string; size?: number }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={c} strokeDashoffset={c - (Math.min(100, value) / 100) * c} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold tabular-nums">{value}%</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, bg, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; bg: string; sub?: string;
}) {
  return (
    <div className="analytics-card group" style={{ borderBottom: `2px solid ${color}` }}>
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl transition-transform group-hover:scale-110', bg)}>
          <Icon className={cn('w-5 h-5')} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ ins }: { ins: Insight }) {
  const icons: Record<string, React.ElementType> = { trophy: Trophy, 'alert-triangle': AlertTriangle, 'check-circle': CheckCircle, lightbulb: Lightbulb, clock: Clock };
  const cols: Record<string, { t: string; b: string; br: string }> = {
    success: { t: 'text-emerald-300', b: 'bg-emerald-500/15', br: 'border-r-emerald-500' },
    warning: { t: 'text-amber-300', b: 'bg-amber-500/15', br: 'border-r-amber-500' },
    info: { t: 'text-sky-300', b: 'bg-sky-500/15', br: 'border-r-sky-500' },
  };
  const Icon = icons[ins.icon] || Lightbulb;
  const c = cols[ins.type] || cols.info;
  return (
    <div className={cn('analytics-card border-r-[3px]', c.br)}>
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-xl shrink-0', c.b)}><Icon className={cn('w-4 h-4', c.t)} /></div>
        <div><p className="text-sm font-semibold">{ins.title_ar}</p><p className="text-xs text-gray-400 mt-1 leading-relaxed">{ins.description_ar}</p></div>
      </div>
    </div>
  );
}

function timeAgo(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`;
  return `منذ ${Math.floor(s / 86400)} يوم`;
}

function generateSummary(a: Analytics): string {
  const p = a.performance;
  const parts: string[] = [];
  parts.push(`نسبة الإنجاز العام ${p.task_completion_rate}% من إجمالي ${formatNumber(p.total_tasks)} مهمة.`);
  if (p.overdue_tasks > 0) parts.push(`يوجد ${p.overdue_tasks} مهمة متأخرة تحتاج متابعة.`);
  const best = a.track_performance.filter(t => t.total_tasks > 0).sort((x, y) => y.task_completion_rate - x.task_completion_rate)[0];
  if (best) parts.push(`أفضل مسار: ${best.name_ar} (${best.task_completion_rate}%).`);
  const worst = a.track_performance.filter(t => t.total_tasks > 0).sort((x, y) => x.task_completion_rate - y.task_completion_rate)[0];
  if (worst && worst.id !== best?.id) parts.push(`يحتاج متابعة: ${worst.name_ar} (${worst.task_completion_rate}%).`);
  if (p.engagement_rate < 50) parts.push(`نسبة الالتزام بالتحديثات ${p.engagement_rate}% — يُنصح بتفعيل المتابعة.`);
  return parts.join(' ');
}

// ─── Main Page ──────────────────────────────────────
export default function CeoDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [drillTrack, setDrillTrack] = useState<TrackPerf | null>(null);
  const [drillTasks, setDrillTasks] = useState<any[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAuthorized = user?.role === 'admin' || user?.role === 'pm';

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: d } = await analyticsApi.dashboard();
      setData(d);
      setLastRefresh(new Date());
    } catch { /* handled by analytics error boundary */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthorized) load(); }, [isAuthorized, load]);
  useEffect(() => {
    if (!isAuthorized) return;
    intervalRef.current = setInterval(() => load(true), REFRESH);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAuthorized, load]);

  const openDrill = async (t: TrackPerf) => {
    setDrillTrack(t);
    setDrillLoading(true);
    try {
      const { data: res } = await tasksApi.list({ trackId: t.id, pageSize: 50 });
      setDrillTasks(res.data || []);
    } catch { setDrillTasks([]); }
    finally { setDrillLoading(false); }
  };

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Shield className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط للإدارة العليا</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">جارٍ تحميل لوحة القيادة...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const p = data.performance;

  const statusDonut = Object.entries(p.tasks_by_status).filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: TASK_STATUS_LABELS[k] || k, value: v }));

  const trackRanking = [...data.track_performance].filter(t => t.total_tasks > 0)
    .sort((a, b) => b.task_completion_rate - a.task_completion_rate);

  return (
    <div className="space-y-8 pb-12">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/20">
              <Shield className="w-6 h-6 text-brand-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">لوحة القيادة التنفيذية</h1>
              <p className="text-gray-400 text-sm mt-0.5">مركز القيادة — منصة رؤية</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-gray-500 tabular-nums" dir="ltr">
              {lastRefresh.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button onClick={() => load()} className="rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
        </div>
      </div>

      {/* ═══ AI EXECUTIVE SUMMARY ═══ */}
      <div className="glass p-6 border-r-[3px] border-r-brand-500">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-brand-500/15 shrink-0"><Zap className="w-5 h-5 text-brand-400" /></div>
          <div>
            <h2 className="text-sm font-semibold text-brand-300 mb-2">الملخص التنفيذي</h2>
            <p className="text-sm text-gray-300 leading-relaxed">{generateSummary(data)}</p>
          </div>
        </div>
      </div>

      {/* ═══ KPI CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi label="المسارات" value={formatNumber(data.track_performance.length)} icon={Target} color="#8B5CF6" bg="bg-violet-500/20" />
        <Kpi label="إجمالي المهام" value={formatNumber(p.total_tasks)} icon={BarChart3} color="#3b82f6" bg="bg-blue-500/20" />
        <Kpi label="مكتملة" value={formatNumber(p.completed_tasks)} icon={CheckCircle} color="#10B981" bg="bg-emerald-500/20" />
        <Kpi label="متأخرة" value={formatNumber(p.overdue_tasks)} icon={AlertTriangle} color="#ef4444" bg="bg-red-500/20" />
        <Kpi label="نسبة الإنجاز" value={`${p.task_completion_rate}%`} icon={TrendingUp} color="#10B981" bg="bg-emerald-500/20" />
        <Kpi label="التحديثات" value={formatNumber(data.summary.total_daily_updates)} icon={Activity} color="#0EA5E9" bg="bg-sky-500/20" />
        <Kpi label="التقارير" value={formatNumber(data.reports.total_reports)} icon={FileBarChart} color="#F59E0B" bg="bg-amber-500/20" />
      </div>

      {/* ═══ GAUGES ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-6 flex flex-col items-center">
          <Ring value={p.task_completion_rate} color="#10B981" />
          <p className="text-sm font-semibold mt-3">نسبة الإنجاز</p>
          <p className="text-[10px] text-gray-500">{formatNumber(p.completed_tasks)} من {formatNumber(p.total_tasks)}</p>
        </div>
        <div className="glass p-6 flex flex-col items-center">
          <Ring value={p.engagement_rate} color="#0EA5E9" />
          <p className="text-sm font-semibold mt-3">نسبة الالتزام</p>
          <p className="text-[10px] text-gray-500">التحديثات اليومية خلال ٧ أيام</p>
        </div>
        <div className="glass p-6 flex flex-col items-center">
          <Ring value={data.reports.total_ai_reports > 0 ? Math.round((data.reports.completed_ai_reports / data.reports.total_ai_reports) * 100) : 0} color="#8B5CF6" />
          <p className="text-sm font-semibold mt-3">نجاح التقارير الذكية</p>
          <p className="text-[10px] text-gray-500">{data.reports.completed_ai_reports} من {data.reports.total_ai_reports}</p>
        </div>
      </div>

      {/* ═══ CHARTS ROW ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Task Status Donut */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">توزيع حالات المهام</h3>
          {statusDonut.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name">
                  {statusDonut.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={ttStyle} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11, direction: 'rtl' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد مهام</p>}
        </div>

        {/* Updates Timeline */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">نشاط التحديثات — ٣٠ يوم</h3>
          {p.updates_timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={p.updates_timeline}>
                <defs><linearGradient id="ceoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.3} /><stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v: string) => v.split('-').slice(1).reverse().join('/')} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={ttStyle} formatter={(v: any) => [v, 'تحديثات']} />
                <Area type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2} fill="url(#ceoGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد بيانات</p>}
        </div>
      </div>

      {/* ═══ TRACK RANKING ═══ */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold mb-4 text-gray-300 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" /> ترتيب المسارات حسب الأداء
        </h3>
        {trackRanking.length > 0 ? (
          <div className="space-y-3">
            {trackRanking.map((t, i) => {
              const danger = t.overdue_tasks > 2;
              const weak = t.task_completion_rate < 40;
              return (
                <div key={t.id} onClick={() => openDrill(t)}
                  className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] transition-all cursor-pointer group">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: `${t.color}20`, color: t.color }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="text-sm font-medium text-white truncate">{t.name_ar}</span>
                      {danger && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300">خطر</span>}
                      {!danger && weak && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">ضعيف</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-500">
                      <span>{t.total_tasks} مهمة</span>
                      <span>{t.completed_tasks} مكتمل</span>
                      <span className={t.overdue_tasks > 0 ? 'text-red-400' : ''}>{t.overdue_tasks} متأخر</span>
                      <span>{t.recent_updates} تحديث</span>
                      <span>{t.employee_count} موظف</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${t.task_completion_rate}%`, background: t.color }} />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-10 text-left">{t.task_completion_rate}%</span>
                    <ChevronLeft className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-gray-500 text-center py-8">لا توجد مسارات</p>}
      </div>

      {/* ═══ INSIGHTS + ACTIVITY ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-3 text-gray-300 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" /> التحليلات الذكية
          </h3>
          {data.insights.length > 0 ? (
            <div className="space-y-3">
              {data.insights.map((ins, i) => <InsightCard key={i} ins={ins} />)}
            </div>
          ) : (
            <div className="glass p-8 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm">لا توجد تنبيهات — الأداء جيد</p>
            </div>
          )}
        </div>
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-300 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-brand-400" /> آخر النشاطات
          </h3>
          {data.activity_feed.length > 0 ? (
            <div className="space-y-2 max-h-[380px] overflow-y-auto">
              {data.activity_feed.map((item) => {
                const cfg: Record<string, { l: string; c: string; b: string }> = {
                  task_update: { l: 'تحديث', c: 'text-blue-300', b: 'bg-blue-500/20' },
                  report: { l: 'تقرير', c: 'text-violet-300', b: 'bg-violet-500/20' },
                  file: { l: 'ملف', c: 'text-teal-300', b: 'bg-teal-500/20' },
                };
                const s = cfg[item.type] || cfg.task_update;
                return (
                  <div key={`${item.type}-${item.id}`} className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02]">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-bold text-brand-300 shrink-0">
                      {item.user_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white truncate">{item.user_name}</span>
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', s.b, s.c)}>{s.l}</span>
                        <span className="text-[9px] text-gray-500 mr-auto">{timeAgo(item.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-500 text-center py-8">لا توجد نشاطات</p>}
        </div>
      </div>

      {/* ═══ TRACK DRILLDOWN PANEL ═══ */}
      {drillTrack && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setDrillTrack(null)} />
          <div className="fixed top-0 left-0 h-full w-[550px] max-w-full glass border-r border-white/10 z-50 overflow-auto">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: drillTrack.color }} />
                <h2 className="text-lg font-bold">{drillTrack.name_ar}</h2>
              </div>
              <button onClick={() => setDrillTrack(null)} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: 'إجمالي', v: drillTrack.total_tasks },
                  { l: 'مكتمل', v: drillTrack.completed_tasks },
                  { l: 'متأخر', v: drillTrack.overdue_tasks, d: drillTrack.overdue_tasks > 0 },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 rounded-xl bg-white/[0.03]">
                    <p className={cn('text-lg font-bold', s.d && 'text-red-400')}>{s.v}</p>
                    <p className="text-[10px] text-gray-500">{s.l}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${drillTrack.task_completion_rate}%`, background: drillTrack.color }} />
                </div>
                <span className="text-sm font-bold tabular-nums">{drillTrack.task_completion_rate}%</span>
              </div>
              {/* Tasks list */}
              <h3 className="text-sm font-semibold text-gray-300">المهام</h3>
              {drillLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
              ) : drillTasks.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">لا توجد مهام</p>
              ) : (
                <div className="space-y-2">
                  {drillTasks.map((t: any) => {
                    const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed' && t.status !== 'cancelled';
                    return (
                      <div key={t.id} className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white truncate">{t.titleAr || t.title}</span>
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-full',
                            t.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                            overdue ? 'bg-red-500/20 text-red-300' :
                            'bg-gray-500/20 text-gray-300')}>
                            {TASK_STATUS_LABELS[t.status] || t.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                          <span>الأولوية: {t.priority}</span>
                          <span>التقدم: {t.progress || 0}%</span>
                          {t.dueDate && <span className={overdue ? 'text-red-400' : ''}>الموعد: {t.dueDate.substring(0, 10)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
