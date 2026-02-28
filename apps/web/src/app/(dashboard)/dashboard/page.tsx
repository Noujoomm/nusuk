'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ListChecks, Clock, CheckCircle, AlertTriangle, BarChart3,
  TrendingUp, Loader2, RefreshCw, Users, Eye,
} from 'lucide-react';
import { tasksApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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

const AUTO_REFRESH_INTERVAL = 10_000; // 10 seconds

export default function ExecutiveDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ExecStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAdminOrPm = user?.role === 'admin' || user?.role === 'pm';

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await tasksApi.executiveStats();
      setStats(data);
      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!isAdminOrPm) return;
    loadStats();
  }, [isAdminOrPm, loadStats]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!isAdminOrPm || !autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => loadStats(true), AUTO_REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
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
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const SUMMARY_CARDS = [
    { label: 'إجمالي المهام', value: formatNumber(stats.total), icon: ListChecks, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { label: 'قيد التنفيذ', value: formatNumber(stats.byStatus?.in_progress || 0), icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { label: 'تحت المراجعة', value: formatNumber(stats.byStatus?.under_review || 0), icon: Eye, color: 'text-orange-400', bg: 'bg-orange-500/20' },
    { label: 'مكتملة', value: formatNumber(stats.byStatus?.completed || 0), icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    { label: 'متأخرة', value: formatNumber(stats.overdue || 0), icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' },
    { label: 'نسبة الإنجاز', value: formatPercent(stats.completionRate || 0), icon: TrendingUp, color: 'text-brand-400', bg: 'bg-brand-500/20' },
  ];

  // Prepare chart data for track comparison
  const trackChartData = stats.trackStats.map((ts) => ({
    name: ts.track?.nameAr || 'غير معروف',
    مكتملة: ts.completed,
    إجمالي: ts.count,
    'نسبة الإنجاز': ts.completionRate,
    color: ts.track?.color || '#6366f1',
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">لوحة القيادة التنفيذية</h1>
          <p className="text-gray-400 mt-1">نظرة شاملة على أداء المشروع والمسارات</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-gray-500" dir="ltr">
              {lastRefresh.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'rounded-xl px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5',
              autoRefresh ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', autoRefresh && 'animate-spin')} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            {autoRefresh ? 'تحديث تلقائي' : 'تلقائي'}
          </button>
          <button onClick={() => loadStats()} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.label} className="glass p-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', card.bg)}>
                <card.icon className={cn('w-5 h-5', card.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold truncate">{card.value}</p>
                <p className="text-xs text-gray-400">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Track Performance Chart + Progress Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Track Comparison BarChart */}
        {trackChartData.length > 0 && (
          <div className="glass p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-gray-300">
              <BarChart3 className="w-4 h-4 text-brand-400" />
              مقارنة إنجاز المسارات
            </h2>
            <ResponsiveContainer width="100%" height={Math.max(200, trackChartData.length * 45)}>
              <BarChart data={trackChartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                  formatter={(value: any, name: any) => [name === 'نسبة الإنجاز' ? `${value}%` : value, name]}
                />
                <Bar dataKey="نسبة الإنجاز" radius={[0, 6, 6, 0]} barSize={18}>
                  {trackChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Track Performance List */}
        <div className="glass p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-gray-300">
            <TrendingUp className="w-4 h-4 text-brand-400" />
            أداء المسارات
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
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${ts.completionRate}%`, backgroundColor: ts.track?.color || '#6366f1' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Priority Distribution + Status Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-3 text-gray-300">توزيع الأولويات</h3>
          <div className="space-y-2">
            {[
              { key: 'critical', label: 'حرج', color: 'bg-red-500' },
              { key: 'high', label: 'مرتفع', color: 'bg-amber-500' },
              { key: 'medium', label: 'متوسط', color: 'bg-blue-500' },
              { key: 'low', label: 'منخفض', color: 'bg-gray-500' },
            ].map((p) => {
              const count = stats.byPriority?.[p.key] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={p.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-14">{p.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={cn('h-full rounded-full', p.color)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-left">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-3 text-gray-300">توزيع الحالات</h3>
          <div className="space-y-2">
            {[
              { key: 'pending', label: 'قيد الانتظار', color: 'bg-gray-500' },
              { key: 'in_progress', label: 'قيد التنفيذ', color: 'bg-blue-500' },
              { key: 'under_review', label: 'تحت المراجعة', color: 'bg-orange-500' },
              { key: 'completed', label: 'مكتملة', color: 'bg-emerald-500' },
              { key: 'delayed', label: 'متأخرة', color: 'bg-red-500' },
              { key: 'cancelled', label: 'ملغاة', color: 'bg-zinc-500' },
            ].map((s) => {
              const count = stats.byStatus?.[s.key] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-24">{s.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={cn('h-full rounded-full', s.color)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-left">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Task Updates */}
      <div className="glass p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-brand-400" />
          آخر التحديثات
        </h2>
        {stats.recentUpdates.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">لا توجد تحديثات حديثة</p>
        ) : (
          <div className="space-y-3">
            {stats.recentUpdates.map((upd: any) => (
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
                  <p className="text-xs text-gray-400 mt-0.5">
                    في: <span className="text-gray-300">{upd.task?.titleAr || '---'}</span>
                  </p>
                  <p className="text-sm text-gray-300 mt-1 line-clamp-2">{upd.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
