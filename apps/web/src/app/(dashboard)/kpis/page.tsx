'use client';

import { useEffect, useState, useMemo } from 'react';
import { kpisApi, tracksApi } from '@/lib/api';
import { formatNumber, formatDate } from '@/lib/utils';
import { Target, Search, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface KPI {
  id: string;
  nameAr: string;
  trackId: string;
  trackName: string;
  category: 'tahqeeq' | 'general';
  targetValue: number;
  actualValue: number;
  unit: string;
  status: string;
  dueDate: string;
}

interface KPIStats {
  total: number;
  achieved: number;
  atRisk: number;
  avgCompletion: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
}

interface Track {
  id: string;
  nameAr: string;
}

const CHART_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f87171', '#818cf8'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'معلق',
  on_track: 'على المسار',
  at_risk: 'في خطر',
  behind: 'متأخر',
  achieved: 'محقق',
  missed: 'فائت',
};

const CATEGORY_LABELS: Record<string, string> = {
  tahqeeq: 'تحقيق',
  general: 'عام',
};

const STATUS_COLORS: Record<string, { text: string; bg: string; bar: string }> = {
  pending: { text: 'text-gray-300', bg: 'bg-gray-500/20', bar: 'bg-gray-400' },
  on_track: { text: 'text-blue-300', bg: 'bg-blue-500/20', bar: 'bg-blue-400' },
  at_risk: { text: 'text-amber-300', bg: 'bg-amber-500/20', bar: 'bg-amber-400' },
  behind: { text: 'text-red-300', bg: 'bg-red-500/20', bar: 'bg-red-400' },
  achieved: { text: 'text-emerald-300', bg: 'bg-emerald-500/20', bar: 'bg-emerald-400' },
  missed: { text: 'text-red-300', bg: 'bg-red-500/20', bar: 'bg-red-400' },
};

function getCompletionPercent(actual: number, target: number): number {
  if (!target || target === 0) return 0;
  const pct = Math.round((actual / target) * 100);
  return Math.min(pct, 100);
}

export default function KPIsPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [stats, setStats] = useState<KPIStats | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [kpisRes, statsRes, tracksRes] = await Promise.all([
          kpisApi.list(),
          kpisApi.stats(),
          tracksApi.list(),
        ]);
        setKpis(kpisRes.data?.data || kpisRes.data || []);
        setStats(statsRes.data);
        setTracks(tracksRes.data?.data || tracksRes.data || []);
      } catch {
        // Silent fail — data will remain empty
      }
      setLoading(false);
    };
    load();
  }, []);

  // Filtered KPIs
  const filtered = useMemo(() => {
    return kpis.filter((k) => {
      const matchSearch =
        !search ||
        k.nameAr?.includes(search) ||
        k.trackName?.includes(search) ||
        k.unit?.includes(search);
      const matchTrack = !trackFilter || k.trackId === trackFilter;
      const matchStatus = !statusFilter || k.status === statusFilter;
      return matchSearch && matchTrack && matchStatus;
    });
  }, [kpis, search, trackFilter, statusFilter]);

  // Chart data: status distribution
  const statusChartData = useMemo(() => {
    if (!stats?.byStatus) return [];
    return Object.entries(stats.byStatus)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        name: STATUS_LABELS[key] || key,
        value: count,
      }));
  }, [stats]);

  // Chart data: category distribution
  const categoryChartData = useMemo(() => {
    if (!stats?.byCategory) return [];
    return Object.entries(stats.byCategory)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        name: CATEGORY_LABELS[key] || key,
        value: count,
      }));
  }, [stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const safeStats = stats || { total: 0, achieved: 0, atRisk: 0, avgCompletion: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">مؤشرات الأداء</h1>
        <p className="text-gray-400 mt-1">
          إدارة ومتابعة مؤشرات الأداء الرئيسية للمشروع
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'إجمالي المؤشرات',
            value: formatNumber(safeStats.total),
            icon: Target,
            color: 'text-blue-400',
            bg: 'bg-blue-500/20',
          },
          {
            label: 'المؤشرات المحققة',
            value: formatNumber(safeStats.achieved),
            icon: CheckCircle,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/20',
          },
          {
            label: 'مؤشرات في خطر',
            value: formatNumber(safeStats.atRisk),
            icon: AlertTriangle,
            color: 'text-amber-400',
            bg: 'bg-amber-500/20',
          },
          {
            label: 'متوسط الإنجاز',
            value: `${formatNumber(Math.round(safeStats.avgCompletion))}%`,
            icon: TrendingUp,
            color: 'text-violet-400',
            bg: 'bg-violet-500/20',
          },
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            توزيع المؤشرات حسب الحالة
          </h3>
          {statusChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(10,18,32,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', color: '#F8FAFC', direction: 'rtl' as const, padding: '10px 14px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontSize: '12px' }}
                  formatter={(value: any) => [formatNumber(Number(value)), 'العدد']}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-gray-400">{value}</span>
                  )}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">
              لا توجد بيانات
            </div>
          )}
        </div>

        {/* Category Distribution */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            توزيع المؤشرات حسب التصنيف
          </h3>
          {categoryChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={categoryChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(10,18,32,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', color: '#F8FAFC', direction: 'rtl' as const, padding: '10px 14px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontSize: '12px' }}
                  formatter={(value: any) => [formatNumber(Number(value)), 'العدد']}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-gray-400">{value}</span>
                  )}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">
              لا توجد بيانات
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث في المؤشرات..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pr-10"
          />
        </div>
        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value)}
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Bar */}
      <div className="glass p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">
              عرض {formatNumber(filtered.length)} من {formatNumber(kpis.length)} مؤشر
            </span>
          </div>
          <div className="flex items-center gap-3">
            {Object.entries(STATUS_LABELS).map(([key, label]) => {
              const count = kpis.filter((k) => k.status === key).length;
              if (count === 0) return null;
              const colors = STATUS_COLORS[key] || STATUS_COLORS.pending;
              return (
                <span
                  key={key}
                  className={`badge ${colors.bg} ${colors.text} text-xs`}
                >
                  {label}: {formatNumber(count)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  المؤشر
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  المسار
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  التصنيف
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  المستهدف
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  الفعلي
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400 min-w-[180px]">
                  نسبة الإنجاز
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  الحالة
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  تاريخ الاستحقاق
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((kpi) => {
                const pct = getCompletionPercent(kpi.actualValue, kpi.targetValue);
                const colors = STATUS_COLORS[kpi.status] || STATUS_COLORS.pending;

                return (
                  <tr
                    key={kpi.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    {/* Name */}
                    <td className="p-4 font-medium text-sm max-w-[220px]">
                      <p className="truncate">{kpi.nameAr || '-'}</p>
                    </td>

                    {/* Track */}
                    <td className="p-4">
                      <span className="badge bg-brand-500/20 text-brand-300 text-xs">
                        {kpi.trackName || '-'}
                      </span>
                    </td>

                    {/* Category */}
                    <td className="p-4">
                      <span
                        className={`badge text-xs ${
                          kpi.category === 'tahqeeq'
                            ? 'bg-violet-500/20 text-violet-300'
                            : 'bg-gray-500/20 text-gray-300'
                        }`}
                      >
                        {CATEGORY_LABELS[kpi.category] || kpi.category || '-'}
                      </span>
                    </td>

                    {/* Target */}
                    <td className="p-4 text-sm text-gray-300">
                      {kpi.targetValue != null
                        ? `${formatNumber(kpi.targetValue)} ${kpi.unit || ''}`
                        : '-'}
                    </td>

                    {/* Actual */}
                    <td className="p-4 text-sm font-medium text-white">
                      {kpi.actualValue != null
                        ? `${formatNumber(kpi.actualValue)} ${kpi.unit || ''}`
                        : '-'}
                    </td>

                    {/* Progress Bar */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold min-w-[36px] text-left ${colors.text}`}>
                          {pct}%
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="p-4">
                      <span className={`badge ${colors.bg} ${colors.text} text-xs`}>
                        {STATUS_LABELS[kpi.status] || kpi.status || '-'}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td className="p-4 text-sm text-gray-300">
                      {kpi.dueDate ? formatDate(kpi.dueDate) : '-'}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    لا توجد مؤشرات أداء
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
