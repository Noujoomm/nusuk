'use client';

import { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { TrackPerf } from './types';

type SortKey = 'name_ar' | 'total_tasks' | 'task_completion_rate' | 'overdue_tasks' | 'recent_updates';

function getStatus(t: TrackPerf): { label: string; cls: string } {
  if (t.overdue_tasks > 2) return { label: 'خطر', cls: 'bg-red-500/20 text-red-300' };
  if (t.task_completion_rate < 40 || t.overdue_tasks > 0) return { label: 'متأخر', cls: 'bg-amber-500/20 text-amber-300' };
  return { label: 'جيد', cls: 'bg-emerald-500/20 text-emerald-300' };
}

export default function TracksTable({ tracks }: { tracks: TrackPerf[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('task_completion_rate');
  const [asc, setAsc] = useState(false);

  const sorted = [...tracks].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string') return asc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
    return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(false); }
  }

  const headers: { key: SortKey; label: string; center?: boolean }[] = [
    { key: 'name_ar', label: 'المسار' },
    { key: 'total_tasks', label: 'المهام', center: true },
    { key: 'task_completion_rate', label: 'الإنجاز', center: true },
    { key: 'overdue_tasks', label: 'متأخر', center: true },
    { key: 'recent_updates', label: 'تحديثات ٧ أيام', center: true },
  ];

  return (
    <div className="glass p-5 overflow-x-auto">
      <h3 className="text-sm font-semibold mb-4 text-gray-300">أداء المسارات التفصيلي</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {headers.map((h) => (
              <th key={h.key} className={cn('py-3 px-3 text-gray-400 font-medium cursor-pointer select-none hover:text-gray-200 transition-colors', h.center ? 'text-center' : 'text-right')}
                onClick={() => handleSort(h.key)}>
                <span className="inline-flex items-center gap-1">
                  {h.label}
                  <ArrowUpDown className={cn('w-3 h-3', sortKey === h.key ? 'text-brand-400' : 'text-gray-600')} />
                </span>
              </th>
            ))}
            <th className="py-3 px-3 text-center text-gray-400 font-medium">الموظفين</th>
            <th className="py-3 px-3 text-center text-gray-400 font-medium">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const status = getStatus(t);
            return (
              <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                    <span className="font-medium text-white">{t.name_ar}</span>
                  </div>
                </td>
                <td className="text-center py-3 px-3 tabular-nums">{formatNumber(t.total_tasks)}</td>
                <td className="text-center py-3 px-3">
                  <div className="inline-flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${t.task_completion_rate}%`, background: t.color }} />
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums w-8">{t.task_completion_rate}%</span>
                  </div>
                </td>
                <td className="text-center py-3 px-3">
                  <span className={t.overdue_tasks > 0 ? 'text-red-400 font-semibold' : 'text-gray-500'}>{t.overdue_tasks}</span>
                </td>
                <td className="text-center py-3 px-3 tabular-nums">{t.recent_updates}</td>
                <td className="text-center py-3 px-3 tabular-nums">{t.employee_count}</td>
                <td className="text-center py-3 px-3">
                  <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium', status.cls)}>
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && <p className="text-sm text-gray-500 text-center py-8">لا توجد مسارات</p>}
    </div>
  );
}
