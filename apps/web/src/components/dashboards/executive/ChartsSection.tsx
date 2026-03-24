'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { BarChart3, TrendingUp, PieChart as PieIcon, Activity } from 'lucide-react';
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils';
import type { Analytics } from './types';

const BRAND_COLORS = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B', '#F43F5E', '#14B8A6', '#84CC16', '#6366f1'];
const tooltipStyle = {
  backgroundColor: 'rgba(17,24,39,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  color: '#e5e7eb',
  direction: 'rtl' as const,
};

function ChartCard({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`glass p-5 ${className || ''}`}>
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-gray-300">
        <Icon className="w-4 h-4 text-brand-400" />{title}
      </h3>
      {children}
    </div>
  );
}

function EmptyChart() {
  return <p className="text-sm text-gray-500 text-center py-16">لا توجد بيانات كافية</p>;
}

export default function ChartsSection({ data }: { data: Analytics }) {
  const p = data.performance;
  const trackChartData = data.track_performance.map((t) => ({
    name: t.name_ar, 'نسبة الإنجاز': t.task_completion_rate, color: t.color,
  }));

  const taskStatusDonut = Object.entries(p.tasks_by_status)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: TASK_STATUS_LABELS[k] || k, value: v }));

  const taskPriorityDonut = Object.entries(p.tasks_by_priority)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: PRIORITY_LABELS[k] || k, value: v }));

  const priorityColors = ['#71717a', '#3b82f6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-4">
      {/* Row 1: Track completion + Donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Track Completion Bar */}
        <ChartCard title="إنجاز المسارات" icon={BarChart3} className="lg:col-span-1">
          {trackChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, trackChartData.length * 44)}>
              <BarChart data={trackChartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: any) => [`${v}%`, 'الإنجاز']} />
                <Bar dataKey="نسبة الإنجاز" radius={[0, 6, 6, 0]} barSize={16}>
                  {trackChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        {/* Status Donut */}
        <ChartCard title="المهام حسب الحالة" icon={PieIcon}>
          {taskStatusDonut.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={taskStatusDonut} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                  paddingAngle={3} dataKey="value" nameKey="name">
                  {taskStatusDonut.map((_, i) => <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 10, direction: 'rtl' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        {/* Priority Donut */}
        <ChartCard title="المهام حسب الأولوية" icon={PieIcon}>
          {taskPriorityDonut.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={taskPriorityDonut} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                  paddingAngle={3} dataKey="value" nameKey="name">
                  {taskPriorityDonut.map((_, i) => <Cell key={i} fill={priorityColors[i % priorityColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 10, direction: 'rtl' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Row 2: Timeline charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Reports Timeline */}
        <ChartCard title="التقارير — آخر ٣٠ يوم" icon={TrendingUp}>
          {data.reports.reports_timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.reports.reports_timeline}>
                <defs>
                  <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickFormatter={(v: string) => { const p = v.split('-'); return `${p[2]}/${p[1]}`; }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'تقارير']} />
                <Area type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2} fill="url(#aGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        {/* Updates Timeline */}
        <ChartCard title="التحديثات اليومية — آخر ٣٠ يوم" icon={Activity}>
          {p.updates_timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={p.updates_timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickFormatter={(v: string) => { const p = v.split('-'); return `${p[2]}/${p[1]}`; }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'تحديثات']} />
                <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2.5}
                  dot={{ fill: '#8B5CF6', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#8B5CF6', stroke: '#111827', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Row 3: Reports by track */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="التقارير حسب المسار" icon={BarChart3}>
          {data.reports.reports_by_track.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, data.reports.reports_by_track.length * 38)}>
              <BarChart data={data.reports.reports_by_track} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {data.reports.reports_by_track.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="المهام المنجزة حسب المسار" icon={BarChart3}>
          {p.tasks_completed_by_track.some((t) => t.value > 0) ? (
            <ResponsiveContainer width="100%" height={Math.max(180, p.tasks_completed_by_track.length * 38)}>
              <BarChart data={p.tasks_completed_by_track} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {p.tasks_completed_by_track.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>
    </div>
  );
}
