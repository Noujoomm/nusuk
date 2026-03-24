'use client';

import {
  Trophy, AlertTriangle, AlertCircle, CheckCircle, Lightbulb, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Insight } from './types';

const iconMap: Record<string, React.ElementType> = {
  trophy: Trophy, 'alert-triangle': AlertTriangle, 'alert-circle': AlertCircle,
  'check-circle': CheckCircle, lightbulb: Lightbulb, clock: Clock,
};

const colorMap: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  success: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-r-emerald-500', glow: 'shadow-emerald-500/5' },
  warning: { text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-r-amber-500', glow: 'shadow-amber-500/5' },
  info: { text: 'text-sky-300', bg: 'bg-sky-500/15', border: 'border-r-sky-500', glow: 'shadow-sky-500/5' },
};

export default function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <div className="glass p-8 text-center">
        <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm font-medium">لا توجد تنبيهات حالياً</p>
        <p className="text-xs text-gray-500 mt-1">جميع المسارات تعمل بشكل طبيعي</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {insights.map((ins, i) => {
        const Icon = iconMap[ins.icon] || Lightbulb;
        const c = colorMap[ins.type] || colorMap.info;
        return (
          <div key={i} className={cn('analytics-card border-r-[3px]', c.border, c.glow)}>
            <div className="flex items-start gap-3">
              <div className={cn('p-2 rounded-xl shrink-0', c.bg)}>
                <Icon className={cn('w-4 h-4', c.text)} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{ins.title_ar}</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{ins.description_ar}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
