'use client';

import { useEffect, useState } from 'react';
import { penaltiesApi, tracksApi } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/utils';
import { AlertTriangle, Search, Shield, CheckCircle, XCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Track {
  id: string;
  nameAr: string;
  color: string;
}

interface Penalty {
  id: string;
  violationAr: string;
  track: { nameAr: string; color: string };
  trackId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impactScore: number;
  isResolved: boolean;
  createdAt: string;
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'مرتفع',
  critical: 'حرج',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-300',
  medium: 'bg-blue-500/20 text-blue-300',
  high: 'bg-amber-500/20 text-amber-300',
  critical: 'bg-red-500/20 text-red-300',
};

const CHART_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f87171', '#818cf8'];

export default function PenaltiesPage() {
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('');
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  const loadPenalties = async () => {
    try {
      const params: any = {};
      if (trackFilter) params.trackId = trackFilter;
      if (resolvedFilter === 'true') params.resolved = true;
      if (resolvedFilter === 'false') params.resolved = false;
      const { data } = await penaltiesApi.list(params);
      setPenalties(Array.isArray(data) ? data : data.data || []);
    } catch {}
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [, tracksRes] = await Promise.all([
          Promise.resolve(),
          tracksApi.list(),
        ]);
        setTracks(Array.isArray(tracksRes.data) ? tracksRes.data : tracksRes.data.data || []);
      } catch {}
    };
    load();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadPenalties();
      setLoading(false);
    };
    load();
  }, [trackFilter, resolvedFilter]);

  const handleToggleResolved = async (penalty: Penalty) => {
    setToggling(penalty.id);
    try {
      await penaltiesApi.update(penalty.id, {
        isResolved: !penalty.isResolved,
        severity: penalty.severity,
        impactScore: penalty.impactScore,
      });
      setPenalties((prev) =>
        prev.map((p) =>
          p.id === penalty.id ? { ...p, isResolved: !p.isResolved } : p,
        ),
      );
    } catch {}
    setToggling(null);
  };

  // Filtered list
  const filtered = penalties.filter((p) => {
    if (search && !p.violationAr?.includes(search) && !p.track?.nameAr?.includes(search)) {
      return false;
    }
    return true;
  });

  // Stats
  const totalCount = penalties.length;
  const resolvedCount = penalties.filter((p) => p.isResolved).length;
  const unresolvedCount = penalties.filter((p) => !p.isResolved).length;
  const criticalCount = penalties.filter((p) => p.severity === 'critical' || p.severity === 'high').length;

  // Severity distribution chart data
  const severityCounts: Record<string, number> = {};
  penalties.forEach((p) => {
    const label = SEVERITY_LABELS[p.severity] || p.severity;
    severityCounts[label] = (severityCounts[label] || 0) + 1;
  });
  const severityChartData = Object.entries(severityCounts).map(([name, value]) => ({ name, value }));

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
      <div>
        <h1 className="text-2xl font-bold">المخالفات والجزاءات</h1>
        <p className="text-gray-400 mt-1">{formatNumber(totalCount)} مخالفة مسجلة</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المخالفات', value: formatNumber(totalCount), icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/20' },
          { label: 'تم الحل', value: formatNumber(resolvedCount), icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
          { label: 'لم يتم الحل', value: formatNumber(unresolvedCount), icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
          { label: 'عالية / حرجة', value: formatNumber(criticalCount), icon: Shield, color: 'text-violet-400', bg: 'bg-violet-500/20' },
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

      {/* Severity Pie Chart */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">التوزيع حسب الخطورة</h3>
        {severityChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={severityChartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
              >
                {severityChartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#ffffff', direction: 'rtl' as const, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', fontSize: '12px' }}
                labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                itemStyle={{ color: '#e5e7eb' }}
                formatter={(value: any) => [`${formatNumber(Number(value))} مخالفة`, 'العدد']}
              />
              <Legend
                formatter={(value) => <span className="text-xs text-gray-400">{value}</span>}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث في المخالفات..."
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
            <option key={t.id} value={t.id}>{t.nameAr}</option>
          ))}
        </select>
        <select
          value={resolvedFilter}
          onChange={(e) => setResolvedFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">الكل</option>
          <option value="true">تم الحل</option>
          <option value="false">لم يتم الحل</option>
        </select>
      </div>

      {/* Penalties List */}
      <div className="space-y-3">
        {filtered.map((penalty) => (
          <div key={penalty.id} className="glass p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="p-2 rounded-xl bg-amber-500/20 mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-relaxed">{penalty.violationAr}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {/* Track badge */}
                    <span
                      className="badge text-xs"
                      style={{
                        backgroundColor: `${penalty.track?.color || '#6b7280'}20`,
                        color: penalty.track?.color || '#9ca3af',
                      }}
                    >
                      {penalty.track?.nameAr || '-'}
                    </span>
                    {/* Severity badge */}
                    <span className={`badge text-xs ${SEVERITY_COLORS[penalty.severity] || 'bg-gray-500/20 text-gray-300'}`}>
                      {SEVERITY_LABELS[penalty.severity] || penalty.severity}
                    </span>
                    {/* Impact score */}
                    <span className="text-xs text-gray-500">
                      درجة التأثير: {penalty.impactScore}
                    </span>
                    {/* Resolved status */}
                    {penalty.isResolved ? (
                      <span className="badge text-xs bg-emerald-500/20 text-emerald-300">تم الحل</span>
                    ) : (
                      <span className="badge text-xs bg-red-500/20 text-red-300">لم يتم الحل</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{formatDate(penalty.createdAt)}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggleResolved(penalty)}
                disabled={toggling === penalty.id}
                className={`btn-primary text-xs flex items-center gap-1.5 shrink-0 ${
                  penalty.isResolved
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'
                }`}
              >
                {toggling === penalty.id ? (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : penalty.isResolved ? (
                  <XCircle className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                {penalty.isResolved ? 'إلغاء الحل' : 'تم الحل'}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass p-8 text-center text-gray-500">لا توجد مخالفات</div>
        )}
      </div>
    </div>
  );
}
