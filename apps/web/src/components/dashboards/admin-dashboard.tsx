'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/stores/auth';
import { tracksApi, tasksApi, employeesApi, kpisApi, insightsApi } from '@/lib/api';
import { cn, formatDate, formatNumber, TASK_STATUS_LABELS, TASK_STATUS_COLORS } from '@/lib/utils';
import { getSocket } from '@/lib/socket';
import {
  GitBranch,
  FileText,
  Users,
  CheckSquare,
  Target,
  Clock,
  Activity,
  TrendingUp,
  Plus,
  Brain,
  ClipboardList,
  AlertTriangle,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';

interface Track {
  id: string;
  name: string;
  nameAr: string;
  color: string;
  _count: { tasks: number; employees: number; deliverables: number };
}

interface KPIStat {
  id: string;
  name: string;
  nameAr: string;
  target: number;
  current: number;
  unit: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalTrackTasks, setTotalTrackTasks] = useState(0);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [kpiStats, setKpiStats] = useState<KPIStat[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tracksRes, employeesRes, taskStatsRes, tasksRes, kpisRes] = await Promise.all([
          tracksApi.list(),
          employeesApi.list().catch(() => ({ data: [] })),
          tasksApi.stats().catch(() => ({ data: null })),
          tasksApi.list({ limit: 8, sort: 'updatedAt', order: 'desc' }).catch(() => ({ data: { data: [] } })),
          kpisApi.stats().catch(() => ({ data: [] })),
        ]);

        const trackData: Track[] = tracksRes.data;
        setTracks(trackData);

        const trackTasks = trackData.reduce((sum, t) => sum + (t._count?.tasks || 0), 0);
        setTotalTrackTasks(trackTasks);

        const emps = employeesRes.data.data || employeesRes.data || [];
        setTotalEmployees(Array.isArray(emps) ? emps.length : 0);

        setTaskStats(taskStatsRes.data);
        setRecentTasks(tasksRes.data.data || []);
        setKpiStats(kpisRes.data.data || kpisRes.data || []);
      } catch {}
      setLoading(false);
    };
    loadData();

    const socket = getSocket();
    socket.on('user.online', (d: { count: number }) => setOnlineCount(d.count));
    socket.on('user.offline', (d: { count: number }) => setOnlineCount(d.count));

    // Refresh task data on real-time task events
    const refreshTasks = async () => {
      try {
        const [statsRes, tasksRes] = await Promise.all([
          tasksApi.stats().catch(() => ({ data: null })),
          tasksApi.list({ limit: 8, sort: 'updatedAt', order: 'desc' }).catch(() => ({ data: { data: [] } })),
        ]);
        setTaskStats(statsRes.data);
        setRecentTasks(tasksRes.data.data || []);
      } catch {}
    };
    socket.on('task.created', refreshTasks);
    socket.on('task.updated', refreshTasks);
    socket.on('task.deleted', refreshTasks);
    socket.on('task.completed', refreshTasks);

    return () => {
      socket.off('user.online');
      socket.off('user.offline');
      socket.off('task.created');
      socket.off('task.updated');
      socket.off('task.deleted');
      socket.off('task.completed');
    };
  }, []);

  // Task stats extraction
  const pending = taskStats?.pending || taskStats?.byStatus?.pending || 0;
  const inProgress = taskStats?.in_progress || taskStats?.byStatus?.in_progress || 0;
  const completed = taskStats?.completed || taskStats?.byStatus?.completed || 0;
  const overdue = taskStats?.overdue || taskStats?.delayed || taskStats?.byStatus?.delayed || 0;
  const totalTasks = taskStats?.total || (pending + inProgress + completed + overdue);

  const topStats = [
    { label: 'المسارات', value: tracks.length, icon: GitBranch, color: 'text-emerald-400', bg: 'bg-emerald-500/20', href: '/tracks' },
    { label: 'إجمالي المهام', value: totalTasks, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { label: 'المهام', value: totalTasks, icon: CheckSquare, color: 'text-amber-400', bg: 'bg-amber-500/20', href: '/tasks' },
    { label: 'الموظفون', value: totalEmployees, icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/20', href: '/employees' },
  ];

  const taskStatCards = [
    { label: 'قيد الانتظار', value: pending, color: 'text-gray-300', bg: 'bg-gray-500/20' },
    { label: 'قيد التنفيذ', value: inProgress, color: 'text-amber-300', bg: 'bg-amber-500/20' },
    { label: 'مكتملة', value: completed, color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
    { label: 'متأخرة', value: overdue, color: 'text-red-300', bg: 'bg-red-500/20' },
  ];

  const quickActions = [
    { label: 'إنشاء مهمة', icon: Plus, href: '/tasks', color: 'text-brand-400', bg: 'bg-brand-500/20' },
    { label: 'تقرير ذكي', icon: Brain, href: '/ai-reports', color: 'text-violet-400', bg: 'bg-violet-500/20' },
    { label: 'البحث الذكي', icon: Zap, href: '/search', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    { label: 'تحليل ملفات AI', icon: Brain, href: '/ai-analyze', color: 'text-purple-400', bg: 'bg-purple-500/20' },
    { label: 'استيراد بيانات', icon: ArrowUpRight, href: '/import', color: 'text-teal-400', bg: 'bg-teal-500/20' },
    { label: 'سجل المراجعة', icon: ClipboardList, href: '/audit', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مرحبا {user?.nameAr || user?.name}</h1>
          <p className="text-gray-400 mt-1">لوحة تحكم نظام نسك لادارة المشاريع</p>
        </div>
        {onlineCount > 0 && (
          <div className="glass rounded-xl border border-white/10 px-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-gray-400">{formatNumber(onlineCount)} متصل</span>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {topStats.map((stat) => {
          const inner = (
            <div className="glass rounded-2xl border border-white/10 p-4 hover:bg-white/[0.03] transition-colors">
              <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-xl', stat.bg)}>
                  <stat.icon className={cn('w-5 h-5', stat.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold">{formatNumber(stat.value)}</p>
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
              </div>
            </div>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href}>{inner}</Link>
          ) : (
            <div key={stat.label}>{inner}</div>
          );
        })}
      </div>

      {/* Task Stats + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Task Stats */}
        <div className="lg:col-span-2 glass rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-brand-400" />
            إحصائيات المهام
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {taskStatCards.map((s) => (
              <div key={s.label} className={cn('rounded-xl p-4 text-center', s.bg)}>
                <p className={cn('text-2xl font-bold', s.color)}>{formatNumber(s.value)}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {totalTasks > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">نسبة الإنجاز</span>
                <span className="text-sm font-semibold text-emerald-400">
                  {Math.round((completed / totalTasks) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((completed / totalTasks) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            إجراءات سريعة
          </h2>
          <div className="space-y-3">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors group"
              >
                <div className={cn('p-2 rounded-lg', action.bg)}>
                  <action.icon className={cn('w-4 h-4', action.color)} />
                </div>
                <span className="text-sm font-medium flex-1">{action.label}</span>
                <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Overview + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* KPI Overview */}
        <div className="glass rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-teal-400" />
              مؤشرات الاداء
            </h2>
            <Link href="/kpis" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              عرض الكل <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {Array.isArray(kpiStats) && kpiStats.length > 0 ? (
            <div className="space-y-4">
              {kpiStats.slice(0, 5).map((kpi, i) => {
                const pct = kpi.target > 0 ? Math.min(Math.round((kpi.current / kpi.target) * 100), 100) : 0;
                return (
                  <div key={kpi.id || i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">{kpi.nameAr || kpi.name}</span>
                      <span className="text-xs text-gray-400">
                        {formatNumber(kpi.current)} / {formatNumber(kpi.target)} {kpi.unit || ''}
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">لا توجد مؤشرات أداء</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-400" />
              النشاط الاخير
            </h2>
            <Link href="/tasks" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              عرض الكل <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {recentTasks.length > 0 ? (
            <div className="space-y-3">
              {recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between bg-white/5 rounded-xl p-3 hover:bg-white/[0.07] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.titleAr || task.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {task.track && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.track.color }} />
                          {task.track.nameAr}
                        </span>
                      )}
                      {task.assignments?.[0]?.user && (
                        <span>{task.assignments[0].user.nameAr}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(task.updatedAt || task.createdAt)}
                      </span>
                    </div>
                  </div>
                  <span className={cn('text-xs px-2.5 py-1 rounded-full shrink-0', TASK_STATUS_COLORS[task.status] || 'bg-gray-500/20 text-gray-300')}>
                    {TASK_STATUS_LABELS[task.status] || task.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">لا يوجد نشاط حديث</p>
            </div>
          )}
        </div>
      </div>

      {/* Tracks Quick Grid */}
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            المسارات
          </h2>
          <Link href="/tracks" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            عرض الكل <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {tracks.slice(0, 8).map((track) => (
            <Link
              key={track.id}
              href={`/tracks/${track.id}`}
              className="bg-white/5 rounded-xl p-3 hover:bg-white/10 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: track.color }} />
                <span className="text-sm font-medium truncate">{track.nameAr}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatNumber(track._count?.tasks || 0)} مهمة</span>
                <TrendingUp className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-brand-400" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
