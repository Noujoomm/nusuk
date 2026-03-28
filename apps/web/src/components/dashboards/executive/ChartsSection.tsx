'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { BarChart3, TrendingUp, PieChart as PieIcon, Activity } from 'lucide-react';
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils';
import {
  chartTooltipStyle, CHART_PALETTE, STATUS_CHART_COLORS, PRIORITY_CHART_COLORS,
  axisTickStyle, gridStroke, legendStyle, formatChartDate, activeStroke, activeStrokeWidth,
} from '@/lib/chart-theme';
import type { Analytics } from './types';

function ChartCard({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`glass p-5 ${className || ''}`} style={{ backgroundColor: 'rgba(14, 27, 45, 0.5)' }}>
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

  // Map status keys to consistent colors
  const statusKeys = Object.keys(p.tasks_by_status);
  const taskStatusDonut = statusKeys.filter((k) => p.tasks_by_status[k] > 0)
    .map((k) => ({ name: TASK_STATUS_LABELS[k] || k, value: p.tasks_by_status[k], fill: STATUS_CHART_COLORS[k] || '#64748B' }));

  const priorityKeys = Object.keys(p.tasks_by_priority);
  const taskPriorityDonut = priorityKeys.filter((k) => p.tasks_by_priority[k] > 0)
    .map((k) => ({ name: PRIORITY_LABELS[k] || k, value: p.tasks_by_priority[k], fill: PRIORITY_CHART_COLORS[k] || '#64748B' }));

  return (
    <div className="space-y-4">
      {/* Row 1: Track completion + Donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="إنجاز المسارات" icon={BarChart3} className="lg:col-span-1">
          {trackChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, trackChartData.length * 44)}>
              <BarChart data={trackChartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={axisTickStyle} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  formatter={(v: any) => [`${v}%`, 'الإنجاز']} />
                <Bar dataKey="نسبة الإنجاز" radius={[0, 6, 6, 0]} barSize={16}>
                  {trackChartData.map((e, i) => (
                    <Cell key={i} fill={e.color} stroke={e.color} strokeOpacity={0.3} />
                  ))}
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
                  paddingAngle={3} dataKey="value" nameKey="name"
                  stroke="rgba(6,18,30,0.6)" strokeWidth={2}>
                  {taskStatusDonut.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
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
                  paddingAngle={3} dataKey="value" nameKey="name"
                  stroke="rgba(6,18,30,0.6)" strokeWidth={2}>
                  {taskPriorityDonut.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Row 2: Timeline charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="التقارير — آخر ٣٠ يوم" icon={TrendingUp}>
          {data.reports.reports_timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.reports.reports_timeline}>
                <defs>
                  <linearGradient id="chartAreaBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1DA1F2" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#1DA1F2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="date" tick={axisTickStyle} tickFormatter={formatChartDate} />
                <YAxis tick={axisTickStyle} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: 'rgba(29,161,242,0.3)', strokeWidth: 1 }}
                  formatter={(v: any) => [v, 'تقارير']} />
                <Area type="monotone" dataKey="count" stroke="#1DA1F2" strokeWidth={2.5} fill="url(#chartAreaBlue)"
                  dot={false} activeDot={{ r: 5, fill: '#1DA1F2', stroke: activeStroke, strokeWidth: activeStrokeWidth }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="التحديثات اليومية — آخر ٣٠ يوم" icon={Activity}>
          {p.updates_timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={p.updates_timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="date" tick={axisTickStyle} tickFormatter={formatChartDate} />
                <YAxis tick={axisTickStyle} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: 'rgba(139,92,246,0.3)', strokeWidth: 1 }}
                  formatter={(v: any) => [v, 'تحديثات']} />
                <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2.5}
                  dot={{ fill: '#8B5CF6', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#8B5CF6', stroke: activeStroke, strokeWidth: activeStrokeWidth }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Row 3: Reports by track + Tasks by track */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="التقارير حسب المسار" icon={BarChart3}>
          {data.reports.reports_by_track.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, data.reports.reports_by_track.length * 38)}>
              <BarChart data={data.reports.reports_by_track} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTickStyle} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={axisTickStyle} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {data.reports.reports_by_track.map((e, i) => (
                    <Cell key={i} fill={e.color} fillOpacity={0.88} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="المهام المنجزة حسب المسار" icon={BarChart3}>
          {p.tasks_completed_by_track.some((t) => t.value > 0) ? (
            <ResponsiveContainer width="100%" height={Math.max(180, p.tasks_completed_by_track.length * 38)}>
              <BarChart data={p.tasks_completed_by_track} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTickStyle} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={axisTickStyle} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {p.tasks_completed_by_track.map((e, i) => (
                    <Cell key={i} fill={e.color} fillOpacity={0.88} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>
    </div>
  );
}
