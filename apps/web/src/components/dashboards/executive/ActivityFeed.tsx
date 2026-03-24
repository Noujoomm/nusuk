'use client';

import { RefreshCw, FileText, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityItem } from './types';

const typeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  task_update: { label: 'تحديث', color: 'text-blue-300', bgColor: 'bg-blue-500/20' },
  report: { label: 'تقرير', color: 'text-violet-300', bgColor: 'bg-violet-500/20' },
  file: { label: 'ملف', color: 'text-teal-300', bgColor: 'bg-teal-500/20' },
};

function timeAgo(date: string): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return new Date(date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="glass p-5">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-gray-300">
        <RefreshCw className="w-4 h-4 text-brand-400" />
        آخر النشاطات
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">لا توجد نشاطات حديثة</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {items.map((item) => {
            const cfg = typeConfig[item.type] || typeConfig.task_update;
            return (
              <div key={`${item.type}-${item.id}`}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-300 shrink-0">
                  {item.user_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium text-white truncate">{item.user_name}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0">{timeAgo(item.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-1">{item.description}</p>
                  {item.context && (
                    <p className="text-[10px] text-gray-500 mt-0.5">في: {item.context}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
