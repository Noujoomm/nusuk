'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  Target, TrendingUp, Clock, AlertTriangle, CheckCircle, BarChart3,
  Loader2, RefreshCw, Shield, Award,
} from 'lucide-react';
import { analyticsApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

const STATUS_COLORS: Record<string, string> = {
  completed: '#34D399', in_progress: '#38BDF8', delayed: '#F87171',
  new: '#A78BFA', pending: '#94A3B8', on_hold: '#FBBF24',
  under_review: '#FB923C', cancelled: '#64748B', scheduled: '#22D3EE',
};

const PRIORITY_COLORS: Record<string, string> = { critical: '#F87171', high: '#FBBF24', medium: '#38BDF8', low: '#94A3B8' };
const PRIORITY_LABELS: Record<string, string> = { critical: 'حرج', high: 'مرتفع', medium: 'متوسط', low: 'منخفض' };
const STATUS_LABELS: Record<string, string> = {
  completed: 'مكتمل', in_progress: 'قيد التنفيذ', delayed: 'متأخر',
  new: 'جديد', pending: 'معلق', on_hold: 'معلق', cancelled: 'ملغى',
  under_review: 'مراجعة', scheduled: 'مجدول',
};

function ScoreRing({ value, size = 100 }: { value: number; size?: number }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  const color = value >= 80 ? '#34D399' : value >= 60 ? '#FBBF24' : value >= 40 ? '#FB923C' : '#F87171';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} strokeLinecap="round"
          className="transition-all duration-1000" style={{ filter: `drop-shadow(0 0 6px ${color}66)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-white">{value}</span>
        <span className="text-[9px] text-gray-400">/ 100</span>
      </div>
    </div>
  );
}

export default function TrackPerformancePage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const { data: d } = await analyticsApi.trackPerformance(); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user?.role === 'admin' || user?.role === 'pm') load(); }, [user, load]);

  if (!(user?.role === 'admin' || user?.role === 'pm')) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Shield className="w-12 h-12" /></div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }
  if (!data) return null;

  const tracks = data.tracks || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/20"><BarChart3 className="w-6 h-6 text-violet-400" /></div>
          <div><h1 className="text-2xl font-bold">أداء المسارات</h1><p className="text-gray-400 text-sm">تحليل أداء شامل لجميع المسارات</p></div>
        </div>
        <button onClick={load} className="rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"><RefreshCw className="h-4 w-4" /> تحديث</button>
      </div>

      {/* Global Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center">
          <ScoreRing value={data.globalScore} size={120} />
          <p className="text-sm font-semibold text-white mt-3">الأداء العام</p>
          <span className={cn('text-xs mt-1 px-3 py-1 rounded-full',
            data.globalScore >= 80 ? 'bg-emerald-500/20 text-emerald-400' : data.globalScore >= 60 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')}>
            {data.globalLabel}
          </span>
        </div>
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">ترتيب المسارات</h3>
          <div className="space-y-2">
            {tracks.map((t: any, i: number) => (
              <div key={t.trackId} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: `${t.trackColor}20`, color: t.trackColor }}>{i + 1}</div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.trackColor }} />
                  <span className="text-sm text-white truncate">{t.trackName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${t.performanceScore}%`, background: t.performanceScore >= 70 ? '#34D399' : t.performanceScore >= 40 ? '#FBBF24' : '#F87171' }} />
                  </div>
                  <span className={cn('text-sm font-bold tabular-nums w-8',
                    t.performanceScore >= 70 ? 'text-emerald-400' : t.performanceScore >= 40 ? 'text-amber-400' : 'text-red-400')}>{t.performanceScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-Track Details */}
      {tracks.filter((t: any) => t.totalTasks > 0).map((t: any) => {
        const statusDonut = Object.entries(t.byStatus).filter(([, v]) => (v as number) > 0)
          .map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v as number, fill: STATUS_COLORS[k] || '#94A3B8' }));
        const priorityBar = ['critical', 'high', 'medium', 'low']
          .filter((p) => (t.completionByPriority[p] || 0) > 0 || (t.byPriority[p] || 0) > 0)
          .map((p) => ({ name: PRIORITY_LABELS[p], 'الإنجاز': t.completionByPriority[p] || 0, 'في الوقت': t.onTimeByPriority[p] || 0 }));

        return (
          <div key={t.trackId} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-5" style={{ borderRight: `3px solid ${t.trackColor}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: t.trackColor }} />
                <h2 className="text-base font-bold text-white">{t.trackName}</h2>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full',
                  t.performanceScore >= 70 ? 'bg-emerald-500/20 text-emerald-400' : t.performanceScore >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')}>
                  {t.performanceLabel} ({t.performanceScore})
                </span>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { l: 'الإنجاز المرجح', v: `${t.weightedCompletion}%`, c: '#34D399', icon: TrendingUp },
                { l: 'SLA', v: `${t.slaScore}%`, c: t.slaScore >= 80 ? '#34D399' : '#F87171', icon: Target },
                { l: 'متوسط الإنجاز', v: `${t.avgCompletionDays} يوم`, c: '#38BDF8', icon: Clock },
                { l: 'متأخرة', v: formatNumber(t.delayedTasks), c: t.delayedTasks > 0 ? '#F87171' : '#34D399', icon: AlertTriangle },
                { l: 'مكتملة', v: formatNumber(t.completedTasks), c: '#34D399', icon: CheckCircle },
                { l: 'قيد التنفيذ', v: formatNumber(t.inProgressTasks), c: '#38BDF8', icon: Clock },
                { l: 'درجة الأداء', v: String(t.performanceScore), c: t.trackColor, icon: Award },
              ].map((k, i) => (
                <div key={i} className="analytics-card">
                  <div className="flex items-center gap-2">
                    <k.icon className="w-3.5 h-3.5" style={{ color: k.c }} />
                    <div><p className="text-base font-bold text-white tabular-nums">{k.v}</p><p className="text-[9px] text-gray-400">{k.l}</p></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {statusDonut.length > 0 && (
                <div className="rounded-xl bg-white/[0.02] p-4">
                  <h4 className="text-xs font-semibold text-gray-300 mb-2">توزيع الحالات</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusDonut} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" nameKey="name" stroke="rgba(15,23,42,0.7)" strokeWidth={2}>
                        {statusDonut.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                      <Legend wrapperStyle={legendStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              {priorityBar.length > 0 && (
                <div className="rounded-xl bg-white/[0.02] p-4">
                  <h4 className="text-xs font-semibold text-gray-300 mb-2">الإنجاز حسب الأولوية</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={priorityBar}>
                      <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                      <YAxis tick={axisTickStyle} stroke={axisStroke} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                      <Legend wrapperStyle={legendStyle} />
                      <Bar dataKey="الإنجاز" fill="#34D399" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="في الوقت" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
