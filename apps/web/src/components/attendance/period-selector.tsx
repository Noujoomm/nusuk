'use client';

import { useMemo, useState } from 'react';
import { Calendar, Check } from 'lucide-react';

/**
 * Cross-period selector — quick presets + a custom range fallback.
 * All presets resolve to a `{from, to}` ISO-date pair that the parent
 * fetches with. Today (`new Date()`) is anchored once so the visible
 * label and the emitted range never disagree on a date boundary.
 */

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
  label: string;
}

type PresetKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'allTime'
  | 'custom';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'thisWeek', label: 'هذا الأسبوع' },
  { key: 'lastWeek', label: 'الأسبوع الماضي' },
  { key: 'thisMonth', label: 'هذا الشهر' },
  { key: 'lastMonth', label: 'الشهر الماضي' },
  { key: 'last7', label: 'آخر 7 أيام' },
  { key: 'last30', label: 'آخر 30 يوم' },
  { key: 'last90', label: 'آخر 90 يوم' },
  { key: 'thisQuarter', label: 'الربع الحالي' },
  { key: 'thisYear', label: 'هذه السنة' },
  { key: 'lastYear', label: 'السنة الماضية' },
  { key: 'allTime', label: 'كل الفترات' },
  { key: 'custom', label: 'فترة مخصصة' },
];

function resolvePreset(key: PresetKey, customFrom?: string, customTo?: string): DateRange {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = iso(today);

  const startOfWeek = (d: Date) => {
    const c = new Date(d);
    c.setUTCDate(c.getUTCDate() - c.getUTCDay());
    return c;
  };

  switch (key) {
    case 'today':
      return { from: todayStr, to: todayStr, label: PRESETS.find((p) => p.key === 'today')!.label };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: iso(y), to: iso(y), label: 'أمس' };
    }
    case 'thisWeek': {
      const s = startOfWeek(today);
      return { from: iso(s), to: iso(addDays(s, 6)), label: 'هذا الأسبوع' };
    }
    case 'lastWeek': {
      const s = startOfWeek(addDays(today, -7));
      return { from: iso(s), to: iso(addDays(s, 6)), label: 'الأسبوع الماضي' };
    }
    case 'thisMonth': {
      const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      return { from: iso(s), to: iso(e), label: 'هذا الشهر' };
    }
    case 'lastMonth': {
      const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: iso(s), to: iso(e), label: 'الشهر الماضي' };
    }
    case 'last7':
      return { from: iso(addDays(today, -6)), to: todayStr, label: 'آخر 7 أيام' };
    case 'last30':
      return { from: iso(addDays(today, -29)), to: todayStr, label: 'آخر 30 يوم' };
    case 'last90':
      return { from: iso(addDays(today, -89)), to: todayStr, label: 'آخر 90 يوم' };
    case 'thisQuarter': {
      const q = Math.floor(today.getUTCMonth() / 3);
      const s = new Date(Date.UTC(today.getUTCFullYear(), q * 3, 1));
      const e = new Date(Date.UTC(today.getUTCFullYear(), q * 3 + 3, 0));
      return { from: iso(s), to: iso(e), label: `الربع ${q + 1}` };
    }
    case 'thisYear': {
      const s = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      const e = new Date(Date.UTC(today.getUTCFullYear(), 11, 31));
      return { from: iso(s), to: iso(e), label: `${today.getUTCFullYear()}` };
    }
    case 'lastYear': {
      const y = today.getUTCFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}` };
    }
    case 'allTime':
      // 5-year sliding window — hard cap so the UI doesn't OOM on a
      // huge dataset before the server even runs the query.
      return { from: iso(addDays(today, -365 * 5)), to: todayStr, label: 'كل الفترات' };
    case 'custom':
      return {
        from: customFrom || todayStr,
        to: customTo || todayStr,
        label: 'فترة مخصصة',
      };
  }
}

export function PeriodSelector({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [active, setActive] = useState<PresetKey>('thisMonth');
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);

  const apply = (key: PresetKey) => {
    setActive(key);
    onChange(resolvePreset(key, customFrom, customTo));
  };

  const applyCustom = () => {
    setActive('custom');
    onChange(resolvePreset('custom', customFrom, customTo));
  };

  const days = useMemo(() => {
    if (!value.from || !value.to) return 0;
    const f = new Date(value.from + 'T00:00:00Z').getTime();
    const t = new Date(value.to + 'T00:00:00Z').getTime();
    return Math.max(1, Math.round((t - f) / 86400000) + 1);
  }, [value.from, value.to]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
        <Calendar className="h-4 w-4 text-emerald-400" />
        <span className="font-bold text-white">الفترة الزمنية</span>
        <span className="text-xs text-slate-400">
          ({value.from} → {value.to} • {days} يوم)
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const isActive = active === p.key;
          return (
            <button
              key={p.key}
              onClick={() => apply(p.key)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                isActive
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {isActive && <Check className="h-3 w-3" />}
              {p.label}
            </button>
          );
        })}
      </div>

      {active === 'custom' && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">من</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">إلى</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            onClick={applyCustom}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/25"
          >
            تطبيق
          </button>
        </div>
      )}
    </div>
  );
}

export function defaultThisMonth(): DateRange {
  return resolvePreset('thisMonth');
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
