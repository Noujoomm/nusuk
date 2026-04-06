'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { BarChart3, RefreshCw, Zap, Target, Activity, Lightbulb } from 'lucide-react';
import { tasksApi, analyticsApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import {
  DashboardCards, ChartsSection, TracksTable,
  InsightsPanel, ActivityFeed,
} from '@/components/dashboards/executive';
import type { Analytics } from '@/components/dashboards/executive';

const AUTO_REFRESH_INTERVAL = 15_000;

// ─── Progress Ring ─────────────────────────────────
function ProgressRing({ value, color, size = 100, label }: {
  value: number; color: string; size?: number; label: string;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, value) / 100) * c;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{value}%</span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">{label}</p>
    </div>
  );
}

// ─── Section Divider ───────────────────────────────
function SectionTitle({ title, icon: Icon, id }: { title: string; icon: React.ElementType; id?: string }) {
  return (
    <div id={id} className="flex items-center gap-3 mt-10 mb-4 scroll-mt-20">
      <div className="p-2 rounded-xl bg-white/5">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────
export default function ExecutiveDashboardPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAdminOrPm = user?.role === 'admin' || user?.role === 'pm';

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await analyticsApi.dashboard();
      setAnalytics(data);
      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdminOrPm) return;
    loadData();
  }, [isAdminOrPm, loadData]);

  useEffect(() => {
    if (!isAdminOrPm || !autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => loadData(true), AUTO_REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAdminOrPm, autoRefresh, loadData]);

  // ─── Access Guard ────────────────────────────────
  if (!isAdminOrPm) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <BarChart3 className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط للإدارة ومديري المشاريع</p>
      </div>
    );
  }

  // ─── Loading State ───────────────────────────────
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

  if (!analytics) return null;

  const p = analytics.performance;

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Header ──────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">لوحة القيادة التنفيذية</h1>
          <p className="text-gray-400 mt-1 text-sm">مركز القيادة — تحليلات متقدمة ومؤشرات الأداء</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-gray-500 tabular-nums" dir="ltr">
              {lastRefresh.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn('rounded-xl px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5',
              autoRefresh ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400')}>
            <RefreshCw className={cn('h-3.5 w-3.5', autoRefresh && 'animate-spin')} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            {autoRefresh ? 'تحديث تلقائي' : 'تلقائي'}
          </button>
          <button onClick={() => loadData()} className="rounded-xl bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
        </div>
      </div>

      {/* ─── KPI Summary Cards ───────────────────── */}
      <DashboardCards data={analytics} />

      {/* ─── Performance Gauges ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-6 flex flex-col items-center">
          <ProgressRing value={p.daily_reports_rate || 0} color="#10B981" label="نسبة التقارير اليومية" />
          <p className="text-[10px] text-gray-500 mt-1">التقارير المسلّمة خلال ٣٠ يوم</p>
        </div>
        <div className="glass p-6 flex flex-col items-center">
          <ProgressRing value={p.engagement_rate} color="#0EA5E9" label="نسبة الالتزام بالمتابعة" />
          <p className="text-[10px] text-gray-500 mt-1">التحديثات اليومية خلال ٧ أيام</p>
        </div>
        <div className="glass p-6 flex flex-col items-center">
          <ProgressRing
            value={analytics.reports.total_ai_reports > 0
              ? Math.round((analytics.reports.completed_ai_reports / analytics.reports.total_ai_reports) * 100)
              : 0}
            color="#8B5CF6" label="نسبة نجاح التقارير الذكية" />
          <p className="text-[10px] text-gray-500 mt-1">{formatNumber(analytics.reports.completed_ai_reports)} من {formatNumber(analytics.reports.total_ai_reports)}</p>
        </div>
      </div>

      {/* ─── Smart Insights ──────────────────────── */}
      <SectionTitle title="التنبيهات والتحليلات الذكية" icon={Lightbulb} id="insights" />
      <InsightsPanel insights={analytics.insights} />

      {/* ─── Charts ──────────────────────────────── */}
      <SectionTitle title="الرسوم البيانية والتحليلات" icon={Activity} id="charts" />
      <ChartsSection data={analytics} />

      {/* ─── Tracks Table ────────────────────────── */}
      <SectionTitle title="جدول أداء المسارات" icon={Target} id="tracks-table" />
      <TracksTable tracks={analytics.track_performance} />

      {/* ─── Activity Feed + Top Contributors ────── */}
      <SectionTitle title="آخر النشاطات" icon={Zap} id="activity" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ActivityFeed items={analytics.activity_feed} />
        </div>
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">أكثر المساهمين إنجازًا</h3>
          {analytics.achievements.top_contributors.length > 0 ? (
            <div className="space-y-3">
              {analytics.achievements.top_contributors.map((c, i) => {
                const colors = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B', '#F43F5E'];
                const clr = colors[i % colors.length];
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: `${clr}20`, color: clr }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{c.completed_tasks}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-500 text-center py-8">لا توجد بيانات</p>}
        </div>
      </div>
    </div>
  );
}
