'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity, RefreshCw, FileSpreadsheet, Presentation, Download,
  AlertTriangle, ShieldCheck, TrendingUp, TrendingDown, Minus,
  Target, Clock, CheckCircle, Ban, ArrowUp, ArrowDown, Loader2,
} from 'lucide-react';
import { productivityApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import type { ProjectProductivity, TrackProductivity } from '@/lib/types/productivity';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash } from '@/lib/chart-theme';

const REFRESH_INTERVAL = 15_000;
const prodColor = (v: number) => v >= 85 ? '#22c55e' : v >= 60 ? '#f59e0b' : '#ef4444';
const trendIcon = (t: number) => t > 1.05 ? TrendingUp : t >= 0.85 ? Minus : TrendingDown;
const trendLabel = (t: number) => t > 1.05 ? 'تسارع' : t >= 0.85 ? 'ثبات' : 'تباطؤ';
const trendColor = (t: number) => t > 1.05 ? 'text-emerald-400' : t >= 0.85 ? 'text-gray-400' : 'text-red-400';
const statusBadge = (v: number) => v >= 85
  ? { label: 'ممتاز', cls: 'bg-emerald-500/20 text-emerald-300' }
  : v >= 60 ? { label: 'تنبيه', cls: 'bg-amber-500/20 text-amber-300' }
  : { label: 'حرج', cls: 'bg-red-500/20 text-red-300' };

function Ring({ value, size = 100 }: { value: number; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const color = prodColor(value);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={c} strokeDashoffset={c - Math.min(1, value / 100) * c} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{value}%</span>
      </div>
    </div>
  );
}

export default function ProductivityDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ProjectProductivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackProductivity | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAdminOrPm = user?.role === 'admin' || user?.role === 'pm';

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await productivityApi.getProject();
      setData(res.data);
    } catch { /* silent */ } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdminOrPm) loadData(); }, [isAdminOrPm, loadData]);

  useEffect(() => {
    if (!isAdminOrPm) return;
    intervalRef.current = setInterval(() => loadData(true), REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAdminOrPm, loadData]);

  const downloadFile = useCallback(async (apiCall: () => Promise<any>, filename: string, key: string) => {
    setExporting(key);
    try {
      const res = await apiCall();
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(href);
    } finally { setExporting(null); }
  }, []);

  if (!isAdminOrPm) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Activity className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط للإدارة ومديري المشاريع</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">جارٍ حساب الإنتاجية...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* ─── Header ──────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">الإنتاجية</h1>
          <p className="text-gray-400 mt-1 text-sm">نموذج الإنتاجية v2 — حساب مرجّح بالأهمية وجودة التنفيذ</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => downloadFile(productivityApi.exportExcel, 'تقرير-الإنتاجية.xlsx', 'excel')}
            disabled={!!exporting}
            className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors flex items-center gap-1.5 disabled:opacity-50">
            {exporting === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            Excel
          </button>
          <button onClick={() => downloadFile(productivityApi.exportPptx, 'عرض-الإنتاجية.pptx', 'pptx')}
            disabled={!!exporting}
            className="rounded-xl bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-300 hover:bg-violet-500/25 transition-colors flex items-center gap-1.5 disabled:opacity-50">
            {exporting === 'pptx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Presentation className="w-3.5 h-3.5" />}
            PPTX
          </button>
          <button onClick={() => loadData()} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ───────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="analytics-card flex flex-col items-center py-6">
          <Ring value={data.overallProductivityPercent} />
          <p className="text-xs text-gray-400 mt-3">إنتاجية المشروع</p>
        </div>
        {[
          { label: 'معرّضة للخطر', value: data.totalAtRiskTasks, icon: AlertTriangle, color: data.totalAtRiskTasks > 0 ? 'text-red-400' : 'text-emerald-400', bg: data.totalAtRiskTasks > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20' },
          { label: 'محظورة', value: data.totalBlockedTasks, icon: Ban, color: data.totalBlockedTasks > 0 ? 'text-amber-400' : 'text-emerald-400', bg: data.totalBlockedTasks > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20' },
          { label: 'متأخرة', value: data.totalOverdueTasks, icon: Clock, color: data.totalOverdueTasks > 0 ? 'text-red-400' : 'text-emerald-400', bg: data.totalOverdueTasks > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20' },
        ].map((c) => (
          <div key={c.label} className="analytics-card">
            <div className="flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', c.bg)}><c.icon className={cn('w-5 h-5', c.color)} /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{c.value}</p>
                <p className="text-xs text-gray-400">{c.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Flags ────────────────────────────────── */}
      {(data.greenFlagTracks.length > 0 || data.redFlagTracks.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.greenFlagTracks.length > 0 && (
            <div className="analytics-card border-r-[3px] border-r-emerald-500">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-300">مسارات متميزة</span>
              </div>
              <p className="text-xs text-gray-300">{data.greenFlagTracks.join('، ')}</p>
            </div>
          )}
          {data.redFlagTracks.length > 0 && (
            <div className="analytics-card border-r-[3px] border-r-red-500">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-red-300">مسارات تحت المتابعة</span>
              </div>
              <p className="text-xs text-gray-300">{data.redFlagTracks.join('، ')}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Weekly Trend Chart ───────────────────── */}
      {data.projectWeeklySnapshots.length > 1 && (
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">الاتجاه الأسبوعي — إنتاجية المشروع</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.projectWeeklySnapshots}>
              <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
              <XAxis dataKey="weekLabel" tick={axisTickStyle} stroke={axisStroke} />
              <YAxis tick={axisTickStyle} stroke={axisStroke} domain={[0, 100]} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
              <Line type="monotone" dataKey="productivityPercent" name="الإنتاجية %" stroke="#6366f1" strokeWidth={2.5}
                dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Tracks Table ─────────────────────────── */}
      <div className="glass p-5 overflow-x-auto">
        <h3 className="text-sm font-semibold mb-4 text-gray-300">جدول المسارات</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {['المسار', 'الإنتاجية', 'الوزن %', 'في الوقت %', 'الكراسة %', 'متأخر', 'السرعة', 'الحالة'].map((h) => (
                <th key={h} className="py-3 px-3 text-gray-400 font-medium text-center first:text-right">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.trackProductivities.map((tp) => {
              const badge = statusBadge(tp.productivityPercent);
              const TIcon = trendIcon(tp.velocityTrend);
              return (
                <tr key={tp.trackId}
                  onClick={() => setSelectedTrack(selectedTrack?.trackId === tp.trackId ? null : tp)}
                  className={cn('border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer',
                    selectedTrack?.trackId === tp.trackId && 'bg-indigo-500/5')}>
                  <td className="py-3 px-3 font-medium">{tp.trackNameAr}</td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, tp.productivityPercent)}%`, background: prodColor(tp.productivityPercent) }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: prodColor(tp.productivityPercent) }}>{tp.productivityPercent}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-400">{tp.trackWeightPercent}%</td>
                  <td className="py-3 px-3 text-center">{tp.onTimeDeliveryRate}%</td>
                  <td className="py-3 px-3 text-center">{tp.claimReadiness}%</td>
                  <td className="py-3 px-3 text-center">
                    <span className={tp.overdueCount > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>{tp.overdueCount}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={cn('flex items-center justify-center gap-1', trendColor(tp.velocityTrend))}>
                      <TIcon className="w-3.5 h-3.5" /> {trendLabel(tp.velocityTrend)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', badge.cls)}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Track Detail Panel ───────────────────── */}
      {selectedTrack && (
        <div className="glass p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200">تفاصيل: {selectedTrack.trackNameAr}</h3>
            <button onClick={() => downloadFile(() => productivityApi.exportTrackExcel(selectedTrack.trackId), `${selectedTrack.trackNameAr}.xlsx`, 'track')}
              disabled={!!exporting}
              className="rounded-xl bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 flex items-center gap-1.5">
              {exporting === 'track' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              تصدير المسار
            </button>
          </div>

          {/* Performance + Predictive metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'الإنتاجية', value: `${selectedTrack.productivityPercent}%`, color: prodColor(selectedTrack.productivityPercent) },
              { label: 'التسليم في الوقت', value: `${selectedTrack.onTimeDeliveryRate}%` },
              { label: 'الاعتماد أول مرة', value: `${selectedTrack.firstAcceptanceRate}%` },
              { label: 'جاهزية الكراسة', value: `${selectedTrack.agreementCompletionRate}%` },
              { label: 'التميّز', value: `${selectedTrack.excellenceRate}%` },
              { label: 'مهام كلي', value: `${selectedTrack.totalTaskCount}` },
              { label: 'تركز عالي', value: `${selectedTrack.highPriorityConcentration}%` },
              { label: 'حجم المتأخر', value: `${selectedTrack.backlogDepth}` },
              { label: 'إعادة تقديم', value: `${selectedTrack.resubmitRate}%`, sub: 'تشخيصي' },
              { label: 'عوائق', value: `${selectedTrack.blockerCount}`, color: selectedTrack.blockerCount > 0 ? '#ef4444' : undefined },
              { label: 'أسابيع متبقية', value: selectedTrack.burnRateWeeksRemaining !== null ? `${selectedTrack.burnRateWeeksRemaining}` : '—' },
              { label: 'اتجاه السرعة', value: trendLabel(selectedTrack.velocityTrend) },
            ].map((m) => (
              <div key={m.label} className="bg-white/[0.03] rounded-xl p-3 text-center">
                <p className="text-lg font-bold tabular-nums" style={m.color ? { color: m.color } : undefined}>{m.value}</p>
                <p className="text-[10px] text-gray-500">{m.label}</p>
                {(m as any).sub && <p className="text-[8px] text-gray-600">{(m as any).sub}</p>}
              </div>
            ))}
          </div>

          {/* Weekly snapshots bar chart */}
          {selectedTrack.weeklySnapshots.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-3">اللقطات الأسبوعية</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={selectedTrack.weeklySnapshots}>
                  <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                  <XAxis dataKey="weekLabel" tick={axisTickStyle} stroke={axisStroke} />
                  <YAxis tick={axisTickStyle} stroke={axisStroke} domain={[0, 100]} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Bar dataKey="productivityPercent" name="الإنتاجية %" radius={[4, 4, 0, 0]} maxBarSize={30}>
                    {selectedTrack.weeklySnapshots.map((_, i) => (
                      <Cell key={i} fill="#6366f1" fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* At-risk tasks */}
          {selectedTrack.atRiskTasks.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-3">المهام المعرّضة للخطر</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedTrack.atRiskTasks.map((ar) => (
                  <div key={ar.taskId}
                    className={cn('rounded-xl p-3 border',
                      ar.riskLevel === 'CRITICAL' ? 'border-red-500/40 bg-red-500/5' : 'border-amber-500/40 bg-amber-500/5')}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{ar.taskName}</span>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                        ar.riskLevel === 'CRITICAL' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300')}>
                        {ar.riskLevel === 'CRITICAL' ? 'حرج' : 'تنبيه'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-[10px] text-gray-400">
                      <span>الأهمية: {ar.importanceScore}</span>
                      <span>التقدم: {ar.currentProgress}%</span>
                      <span>{ar.daysUntilDeadline <= 0 ? 'فات الموعد' : `${ar.daysUntilDeadline} يوم`}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
