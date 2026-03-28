'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { BarChart3, TrendingUp, PieChart as PieIcon, Activity } from 'lucide-react';
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils';
import {
  chartTooltipStyle, chartTooltipCursor, chartTooltipLineCursor,
  STATUS_CHART_COLORS, PRIORITY_CHART_COLORS,
  axisTickStyle, gridStroke, gridStrokeDash, legendStyle,
  formatChartDate, pieStroke, pieStrokeWidth, barFillOpacity,
  activeDotStyle, dotStyle, areaGradients,
} from '@/lib/chart-theme';
import type { Analytics } from './types';

function ChartCard({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5 ${className || ''}`}>
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-slate-300">
        <Icon className="w-4 h-4 text-brand-400" />{title}
      </h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-slate-500 text-center py-16">لا توجد بيانات كافية</p>;
}

export default function ChartsSection({ data }: { data: Analytics }) {
  const p = data.performance;

  const trackChartData = data.track_performance.map((t) => ({
    name: t.name_ar, 'نسبة الإنجاز': t.task_completion_rate, color: t.color,
  }));

  const taskStatusDonut = Object.keys(p.tasks_by_status)
    .filter((k) => p.tasks_by_status[k] > 0)
    .map((k) => ({ name: TASK_STATUS_LABELS[k] || k, value: p.tasks_by_status[k], fill: STATUS_CHART_COLORS[k] || '#94A3B8' }));

  const taskPriorityDonut = Object.keys(p.tasks_by_priority)
    .filter((k) => p.tasks_by_priority[k] > 0)
    .map((k) => ({ name: PRIORITY_LABELS[k] || k, value: p.tasks_by_priority[k], fill: PRIORITY_CHART_COLORS[k] || '#94A3B8' }));

  return (
    <div className="space-y-4">
      {/* ── Row 1: Track completion + Donuts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="إنجاز المسارات" icon={BarChart3} className="lg:col-span-1">
          {trackChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, trackChartData.length * 44)}>
              <BarChart data={trackChartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={axisTickStyle} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={chartTooltipCursor}
                  formatter={(v: any) => [`${v}%`, 'الإنجاز']} />
                <Bar dataKey="نسبة الإنجاز" radius={[0, 6, 6, 0]} barSize={16}>
                  {trackChartData.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={barFillOpacity} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title="المهام حسب الحالة" icon={PieIcon}>
          {taskStatusDonut.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={taskStatusDonut} cx="50%" cy="50%" innerRadius={50} outerRadius={88}
                  paddingAngle={3} dataKey="value" nameKey="name"
                  stroke={pieStroke} strokeWidth={pieStrokeWidth}>
                  {taskStatusDonut.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title="المهام حسب الأولوية" icon={PieIcon}>
          {taskPriorityDonut.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={taskPriorityDonut} cx="50%" cy="50%" innerRadius={50} outerRadius={88}
                  paddingAngle={3} dataKey="value" nameKey="name"
                  stroke={pieStroke} strokeWidth={pieStrokeWidth}>
                  {taskPriorityDonut.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>
      </div>

      {/* ── Row 2: Timelines ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="التقارير — آخر ٣٠ يوم" icon={TrendingUp}>
          {data.reports.reports_timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.reports.reports_timeline}>
                <defs>
                  <linearGradient id={areaGradients.blue.id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={areaGradients.blue.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={areaGradients.blue.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                <XAxis dataKey="date" tick={axisTickStyle} tickFormatter={formatChartDate} />
                <YAxis tick={axisTickStyle} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={chartTooltipLineCursor}
                  formatter={(v: any) => [v, 'تقارير']} />
                <Area type="monotone" dataKey="count" stroke={areaGradients.blue.color} strokeWidth={2.5}
                  fill={`url(#${areaGradients.blue.id})`} dot={false}
                  activeDot={activeDotStyle(areaGradients.blue.color)} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title="التحديثات اليومية — آخر ٣٠ يوم" icon={Activity}>
          {p.updates_timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={p.updates_timeline}>
                <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                <XAxis dataKey="date" tick={axisTickStyle} tickFormatter={formatChartDate} />
                <YAxis tick={axisTickStyle} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={chartTooltipLineCursor}
                  formatter={(v: any) => [v, 'تحديثات']} />
                <Line type="monotone" dataKey="count" stroke={areaGradients.purple.color} strokeWidth={2.5}
                  dot={dotStyle(areaGradients.purple.color)}
                  activeDot={activeDotStyle(areaGradients.purple.color)} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>
      </div>

      {/* ── Row 3: By Track ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="التقارير حسب المسار" icon={BarChart3}>
          {data.reports.reports_by_track.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, data.reports.reports_by_track.length * 38)}>
              <BarChart data={data.reports.reports_by_track} layout="vertical">
                <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTickStyle} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={axisTickStyle} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={chartTooltipCursor} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {data.reports.reports_by_track.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={barFillOpacity} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title="المهام المنجزة حسب المسار" icon={BarChart3}>
          {p.tasks_completed_by_track.some((t) => t.value > 0) ? (
            <ResponsiveContainer width="100%" height={Math.max(180, p.tasks_completed_by_track.length * 38)}>
              <BarChart data={p.tasks_completed_by_track} layout="vertical">
                <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTickStyle} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={axisTickStyle} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={chartTooltipCursor} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {p.tasks_completed_by_track.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={barFillOpacity} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>
      </div>
    </div>
  );
}
