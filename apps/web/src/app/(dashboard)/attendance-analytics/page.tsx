'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { attendanceApi } from '@/lib/api';
import { PeriodSelector, defaultThisMonth, type DateRange } from '@/components/attendance/period-selector';

type Severity = 'high' | 'medium' | 'low';

interface RankedEmployee {
  employeeId: string;
  name: string;
  track: string;
  city: string;
  attendanceRate: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalHours: number;
  totalLateMinutes: number;
  longestPresentStreak: number;
  longestAbsentStreak: number;
  reliabilityIndex: number;
}

interface Anomaly {
  type: string;
  severity: Severity;
  employeeId: string;
  name: string;
  track: string;
  detail: string;
  count?: number;
}

interface AnalyticsResult {
  period: { from: string; to: string; days: number };
  scope: any;
  kpis: {
    totalEmployees: number;
    totalDailyRecords: number;
    presentDays: number;
    absentDays: number;
    incompleteDays: number;
    onCallPresent: number;
    attendanceRate: number;
    punctualityRate: number;
    averageWorkHours: number;
    totalWorkHours: number;
    totalLateMinutes: number;
    reliabilityIndex: number;
  };
  trend: Array<{ date: string; present: number; absent: number; late: number; incomplete: number; totalHours: number }>;
  byTrack: Array<{ track: string; employees: number; attendanceRate: number; totalHours: number; absentDays: number }>;
  byCity: Array<{ city: string; employees: number; attendanceRate: number; totalHours: number }>;
  byDayOfWeek: Array<{ day: string; dayIndex: number; present: number; absent: number; late: number; attendanceRate: number }>;
  topPerformers: RankedEmployee[];
  bottomPerformers: RankedEmployee[];
  anomalies: Anomaly[];
  heatmap: {
    employees: Array<{ id: string; name: string; track: string }>;
    dates: string[];
    cells: number[][];
  };
}

export default function AttendanceAnalyticsPage() {
  const [range, setRange] = useState<DateRange>(defaultThisMonth());
  const [center, setCenter] = useState<'makkah' | 'madinah' | 'all'>('all');
  const [trackName, setTrackName] = useState<string>('');
  const [rosterOnly, setRosterOnly] = useState(false);

  // Three independent datasets — one per section. The page stays in sync
  // with the filter bar by only fetching the sections that the current
  // scope actually shows: "all" → 3 calls in parallel; single-city → 1.
  // No double-counting: each PdfDailyAttendanceSummary belongs to exactly
  // one employee with exactly one center, so the same row never lands in
  // both the Makkah and Madinah datasets.
  const [combinedData, setCombinedData] = useState<AnalyticsResult | null>(null);
  const [makkahData, setMakkahData] = useState<AnalyticsResult | null>(null);
  const [madinahData, setMadinahData] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep accumulated tracks across loads — otherwise picking "Madinah" once
  // shrinks the dropdown to just Madinah's tracks and the user can't navigate
  // back to "Distribution Mecca" without first widening the city.
  const [allTrackOptions, setAllTrackOptions] = useState<string[]>([]);

  const showCombined = center === 'all';
  const showMakkah = center === 'all' || center === 'makkah';
  const showMadinah = center === 'all' || center === 'madinah';

  const load = useCallback(async () => {
    setLoading(true);
    const base = { from: range.from, to: range.to, rosterOnly };
    const track = trackName || undefined;
    try {
      const [combinedRes, makkahRes, madinahRes] = await Promise.all([
        showCombined
          ? attendanceApi.analyticsDashboard({ ...base, center: 'all', trackName: track })
          : Promise.resolve(null),
        showMakkah
          ? attendanceApi.analyticsDashboard({ ...base, center: 'makkah', trackName: track })
          : Promise.resolve(null),
        showMadinah
          ? attendanceApi.analyticsDashboard({ ...base, center: 'madinah', trackName: track })
          : Promise.resolve(null),
      ]);

      const combined = (combinedRes?.data ?? null) as AnalyticsResult | null;
      const makkah = (makkahRes?.data ?? null) as AnalyticsResult | null;
      const madinah = (madinahRes?.data ?? null) as AnalyticsResult | null;

      setCombinedData(combined);
      setMakkahData(makkah);
      setMadinahData(madinah);

      // Refresh accumulated track list from whatever we got back.
      const acc = new Set<string>(allTrackOptions);
      for (const d of [combined, makkah, madinah]) {
        if (!d) continue;
        for (const t of d.byTrack) if (t.track) acc.add(t.track);
      }
      setAllTrackOptions([...acc]);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'فشل تحميل التحليلات');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, center, trackName, rosterOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Choose what to display empty-state vs sections vs loading.
  const anySectionHasData =
    (showCombined && combinedData && combinedData.kpis.totalDailyRecords > 0) ||
    (showMakkah && makkahData && makkahData.kpis.totalDailyRecords > 0) ||
    (showMadinah && madinahData && madinahData.kpis.totalDailyRecords > 0);

  return (
    <div dir="rtl" className="space-y-5">
      <Header />

      <CoveragePanel
        onTracks={(t) => setAllTrackOptions((prev) => Array.from(new Set([...prev, ...t])))}
      />

      <ScopePresets
        center={center}
        trackName={trackName}
        trackOptions={allTrackOptions}
        onApply={(p) => {
          setCenter(p.center);
          setTrackName(p.trackName ?? '');
        }}
      />

      <PeriodSelector value={range} onChange={setRange} />

      <FiltersBar
        center={center}
        onCenter={setCenter}
        trackName={trackName}
        onTrack={setTrackName}
        rosterOnly={rosterOnly}
        onRosterOnly={setRosterOnly}
        trackOptions={allTrackOptions}
      />

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> جارٍ التحميل…
        </div>
      )}

      {!loading && !anySectionHasData && <EmptyState range={range} />}

      {!loading && anySectionHasData && (
        <>
          {showCombined && combinedData && (
            <Section
              title="التحليل الإجمالي (مكة + المدينة)"
              icon="🌐"
              accent="emerald"
              data={combinedData}
              showByCity
            />
          )}
          {showMakkah && makkahData && (
            <Section
              title="تحليل الحضور في مكة المكرمة"
              icon="🕋"
              accent="emerald"
              data={makkahData}
              subtitle="جميع المسارات في مركز مكة"
            />
          )}
          {showMadinah && madinahData && (
            <Section
              title="تحليل الحضور في المدينة المنورة"
              icon="🏛️"
              accent="blue"
              data={madinahData}
              subtitle="مسار التوزيع — مركز المدينة"
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── One section (per-city or combined) ────────────────────────────────
// Wraps every existing widget so each city gets the same chart set with
// its own data slice. ByCityCard is intentionally hidden in single-city
// sections — there's no city breakdown to show — but still visible in
// the combined "all platform" section.

function Section({
  title,
  icon,
  accent,
  data,
  subtitle,
  showByCity,
}: {
  title: string;
  icon: string;
  accent: 'emerald' | 'blue' | 'amber';
  data: AnalyticsResult;
  subtitle?: string;
  showByCity?: boolean;
}) {
  const accentCls = {
    emerald: 'border-emerald-500/30 bg-emerald-500/[0.05]',
    blue: 'border-blue-500/30 bg-blue-500/[0.05]',
    amber: 'border-amber-500/30 bg-amber-500/[0.05]',
  }[accent];
  const empty = data.kpis.totalDailyRecords === 0;

  return (
    <section className={`space-y-4 rounded-2xl border ${accentCls} p-5`}>
      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {(subtitle || !empty) && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              {subtitle && <span>{subtitle}</span>}
              {subtitle && !empty && <span className="px-1">•</span>}
              {!empty && (
                <span>
                  {data.kpis.totalEmployees} موظف · {data.kpis.totalDailyRecords} سجل يومي ·
                  معدل الحضور {data.kpis.attendanceRate}%
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {empty ? (
        <p className="py-8 text-center text-sm text-slate-500">
          لا توجد سجلات لهذا النطاق في الفترة المحددة.
        </p>
      ) : (
        <>
          <KpiGrid k={data.kpis} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><TrendChart trend={data.trend} /></div>
            <div className="space-y-4">
              <DowChart byDayOfWeek={data.byDayOfWeek} />
              {showByCity && <ByCityCard byCity={data.byCity} />}
            </div>
          </div>
          <RankingRow top={data.topPerformers} bottom={data.bottomPerformers} />
          <AnomaliesPanel anomalies={data.anomalies} />
          <ByTrackTable byTrack={data.byTrack} />
          <Heatmap heatmap={data.heatmap} />
        </>
      )}
    </section>
  );
}

// ─── Scope presets (quick "view" buttons) ──────────────────────────────
// Two questions cover ~90% of how users navigate this page: "show me
// Makkah's attendance" and "show me Madinah's attendance". The presets
// flip the city + track filters together so the user doesn't have to
// click into the dropdowns. trackOptions comes from the live data, so
// we can pick the actual Distribution track name verbatim (avoids exact-
// match mismatches like trailing spaces in "التوزيع (المدينة المنورة )").

function ScopePresets({
  center,
  trackName,
  trackOptions,
  onApply,
}: {
  center: 'makkah' | 'madinah' | 'all';
  trackName: string;
  trackOptions: string[];
  onApply: (p: { center: 'makkah' | 'madinah' | 'all'; trackName?: string }) => void;
}) {
  // Find a Distribution track name from the live data (handles "التوزيع",
  // "مسار التوزيع", "التوزيع (المدينة المنورة)", …). When the city is
  // already in the track name we prefer it over the bare "التوزيع" label.
  const findDistribution = (city?: 'makkah' | 'madinah') => {
    const mkRe = /مكة|مكه/;
    const mdRe = /المدينة|المدينه/;
    if (city === 'makkah') {
      const cityMatch = trackOptions.find((t) => /توزيع/.test(t) && mkRe.test(t));
      if (cityMatch) return cityMatch;
    } else if (city === 'madinah') {
      const cityMatch = trackOptions.find((t) => /توزيع/.test(t) && mdRe.test(t));
      if (cityMatch) return cityMatch;
    }
    return trackOptions.find((t) => /توزيع/.test(t)) ?? '';
  };

  const presets: Array<{
    key: string;
    label: string;
    icon: string;
    cls: string;
    matches: () => boolean;
    apply: () => void;
  }> = [
    {
      key: 'all',
      label: 'كل المنصة',
      icon: '🌐',
      cls: 'border-white/20 bg-white/[0.04] text-slate-200',
      matches: () => center === 'all' && !trackName,
      apply: () => onApply({ center: 'all', trackName: '' }),
    },
    {
      key: 'mk-all',
      label: 'مكة — كل المسارات',
      icon: '🕋',
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      matches: () => center === 'makkah' && !trackName,
      apply: () => onApply({ center: 'makkah', trackName: '' }),
    },
    {
      key: 'md-all',
      label: 'المدينة — كل المسارات',
      icon: '🕌',
      cls: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
      matches: () => center === 'madinah' && !trackName,
      apply: () => onApply({ center: 'madinah', trackName: '' }),
    },
    {
      key: 'mk-dist',
      label: 'توزيع مكة',
      icon: '📦',
      cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
      matches: () => center === 'makkah' && /توزيع/.test(trackName),
      apply: () => onApply({ center: 'makkah', trackName: findDistribution('makkah') }),
    },
    {
      key: 'md-dist',
      label: 'توزيع المدينة',
      icon: '📦',
      cls: 'border-blue-500/40 bg-blue-500/15 text-blue-200',
      matches: () => center === 'madinah' && /توزيع/.test(trackName),
      apply: () => onApply({ center: 'madinah', trackName: findDistribution('madinah') }),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-slate-400 ml-1">عرض سريع:</span>
      {presets.map((p) => {
        const active = p.matches();
        return (
          <button
            key={p.key}
            onClick={p.apply}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              active ? p.cls : 'border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/5'
            }`}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Coverage diagnostic panel ──────────────────────────────────────────
// Answers "why don't I see my Madinah/Makkah employees?" by showing the
// city-tag distribution on both the master roster and the daily summaries.
// Collapsed by default; opens automatically when there are unset employees.

interface CoverageData {
  employees: { total: number; makkah: number; madinah: number; shared: number; unset: number };
  uploads: number;
  summaries: { total: number; makkah: number; madinah: number; shared: number; unset: number };
  samples: {
    makkah: Array<{ fullName: string; track: string }>;
    madinah: Array<{ fullName: string; track: string }>;
    shared: Array<{ fullName: string; track: string }>;
    unset: Array<{ fullName: string; track: string }>;
  };
  tracks?: string[];
}

function CoveragePanel({ onTracks }: { onTracks?: (tracks: string[]) => void } = {}) {
  const [data, setData] = useState<CoverageData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await attendanceApi.analyticsCoverage();
        if (!cancelled) {
          setData(res.data);
          // Hand the master track list up so the FiltersBar dropdown is
          // populated even before the first analyze() call returns.
          if (Array.isArray(res.data.tracks) && onTracks) onTracks(res.data.tracks);
          // Auto-open when there's an obvious data-quality issue.
          if (res.data.employees.unset > 0 || (res.data.employees.madinah === 0 && res.data.employees.makkah === 0)) {
            setOpen(true);
          }
        }
      } catch {
        // Silent — coverage is optional and gated by role.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const e = data.employees;
  const s = data.summaries;
  const hasIssue = e.unset > 0 || (e.madinah === 0 && e.makkah === 0);
  const dominantShared = e.total > 0 && e.shared / e.total > 0.5;

  return (
    <div className={`rounded-2xl border p-4 backdrop-blur-xl ${
      hasIssue || dominantShared
        ? 'border-amber-500/30 bg-amber-500/[0.04]'
        : 'border-white/10 bg-white/5'
    }`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-right"
      >
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            hasIssue || dominantShared ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
          }`}>
            {hasIssue || dominantShared ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </span>
          <h3 className="text-sm font-bold text-white">تشخيص بيانات الحضور</h3>
          <span className="text-[11px] text-slate-400">
            {e.total} موظف • {data.uploads} رفعة • {s.total} سجل يومي
          </span>
        </div>
        <span className="text-[11px] text-slate-400">{open ? '▲ إخفاء' : '▼ عرض'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Employee breakdown by center */}
          <div>
            <h4 className="mb-2 text-xs font-bold text-slate-200">توزيع الموظفين حسب المدينة</h4>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <CovBox label="مكة المكرمة" value={e.makkah} total={e.total} color="emerald" />
              <CovBox label="المدينة المنورة" value={e.madinah} total={e.total} color="blue" />
              <CovBox label="مشترك" value={e.shared} total={e.total} color="purple" />
              <CovBox label="غير محدد" value={e.unset} total={e.total} color={e.unset > 0 ? 'amber' : 'slate'} />
            </div>
          </div>

          {/* Summary breakdown */}
          <div>
            <h4 className="mb-2 text-xs font-bold text-slate-200">السجلات اليومية حسب المدينة</h4>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <CovBox label="مكة المكرمة" value={s.makkah} total={s.total} color="emerald" />
              <CovBox label="المدينة المنورة" value={s.madinah} total={s.total} color="blue" />
              <CovBox label="مشترك" value={s.shared} total={s.total} color="purple" />
              <CovBox label="غير محدد" value={s.unset} total={s.total} color={s.unset > 0 ? 'amber' : 'slate'} />
            </div>
          </div>

          {/* Diagnosis message */}
          {(hasIssue || dominantShared) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
              <p className="text-xs leading-relaxed text-amber-200">
                {e.madinah === 0 && e.makkah === 0 && (
                  <>
                    <strong>لا يوجد أي موظف مرتبط بمدينة محددة في الكراسة.</strong> هذا يعني أن
                    تبويب "حسب المدينة" والفلتر العلوي سيظهران الكل كـ"مشترك". الحلّ: أضف عمود
                    "<span className="font-mono">المدينة</span>" في ملف الكراسة Excel (القيم: <em>مكة</em> /
                    <em> المدينة</em>) ثم أعد رفعه من <span dir="ltr">/attendance</span>.
                  </>
                )}
                {e.madinah === 0 && e.makkah > 0 && (
                  <>
                    <strong>لا يوجد موظفون مرتبطون بـ "المدينة المنورة"</strong> رغم وجود {e.makkah} موظف
                    لمكة. الحلّ: أضف عمود "<span className="font-mono">المدينة</span>" في الـ sheet المعنية
                    وضع قيمة "المدينة" للموظفين، ثم أعد رفع ملف الكراسة.
                  </>
                )}
                {dominantShared && e.madinah > 0 && e.makkah > 0 && (
                  <>
                    <strong>{Math.round((e.shared / e.total) * 100)}% من الموظفين مصنّفون "مشترك"</strong>
                    {' '}— غالباً موظفو التدريب/العلاقات/الإدارة المدرَجين في sheet عام بدون عمود "المدينة".
                    أضف عمود <span className="font-mono">المدينة</span> لكل sheet واملأ القيم لتظهر بياناتهم
                    في الفلاتر بشكل صحيح.
                  </>
                )}
                {e.unset > 0 && (
                  <>
                    {' '}<strong>{e.unset} موظف</strong> بدون أي مدينة (null) — يفضّل تصنيفهم.
                  </>
                )}
              </p>
            </div>
          )}

          {/* Sample employees per center — helps verify with real names */}
          <div>
            <h4 className="mb-2 text-xs font-bold text-slate-200">عيّنات</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SampleList title="عيّنة مكة" items={data.samples.makkah} color="emerald" />
              <SampleList title="عيّنة المدينة" items={data.samples.madinah} color="blue" />
              <SampleList title="عيّنة مشترك" items={data.samples.shared} color="purple" />
              {data.samples.unset.length > 0 && (
                <SampleList title="عيّنة غير محدد" items={data.samples.unset} color="amber" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CovBox({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: 'emerald' | 'blue' | 'purple' | 'amber' | 'slate';
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`rounded-lg border p-3 ${COLOR_CLASSES[color]}`}>
      <div className="text-[11px] opacity-90">{label}</div>
      <div className="text-xl font-bold tabular-nums text-white">{value}</div>
      <div className="text-[10px] opacity-70">{pct}%</div>
    </div>
  );
}

function SampleList({
  title,
  items,
  color,
}: {
  title: string;
  items: Array<{ fullName: string; track: string }>;
  color: 'emerald' | 'blue' | 'purple' | 'amber';
}) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-lg border p-3 ${COLOR_CLASSES[color]}`}>
      <div className="mb-1 text-[11px] font-bold opacity-90">{title}</div>
      <ul className="space-y-0.5 text-[11px] text-slate-200">
        {items.map((it, i) => (
          <li key={i} className="truncate">
            <span>{it.fullName}</span>
            <span className="text-slate-500"> · {it.track}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-slate-900/40 to-transparent p-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <BarChart3 className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">تحليلات الحضور والانصراف</h1>
          <p className="mt-1 text-sm text-slate-400">
            تحليل شامل عبر الفترات: مؤشرات، اتجاهات، ترتيب الموظفين، وكشف الحالات الشاذة. البيانات
            مأخوذة من سجلات PDF اليومية المرفوعة في صفحة الحضور.
          </p>
        </div>
      </div>
    </div>
  );
}

function FiltersBar({
  center,
  onCenter,
  trackName,
  onTrack,
  rosterOnly,
  onRosterOnly,
  trackOptions,
}: {
  center: 'makkah' | 'madinah' | 'all';
  onCenter: (c: 'makkah' | 'madinah' | 'all') => void;
  trackName: string;
  onTrack: (t: string) => void;
  rosterOnly: boolean;
  onRosterOnly: (b: boolean) => void;
  trackOptions: string[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
      <label className="block">
        <span className="mb-1 block text-[11px] text-slate-400">المدينة</span>
        <select
          value={center}
          onChange={(e) => onCenter(e.target.value as any)}
          className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
        >
          <option value="all">الكل</option>
          <option value="makkah">مكة المكرمة</option>
          <option value="madinah">المدينة المنورة</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-slate-400">المسار</span>
        <select
          value={trackName}
          onChange={(e) => onTrack(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
        >
          <option value="">كل المسارات</option>
          {trackOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={rosterOnly}
          onChange={(e) => onRosterOnly(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-slate-900"
        />
        <span>الموظفون ضمن الكراسة فقط</span>
      </label>
    </div>
  );
}

function EmptyState({ range }: { range: DateRange }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
      <Calendar className="mx-auto mb-3 h-10 w-10 text-slate-500" />
      <p className="text-sm text-slate-300">لا توجد سجلات حضور في الفترة المحددة ({range.from} → {range.to}).</p>
      <p className="mt-1 text-xs text-slate-500">
        تأكد من رفع ملفات PDF اليومية في صفحة الحضور والانصراف، أو اختر فترة أوسع.
      </p>
    </div>
  );
}

// ─── KPI grid ────────────────────────────────────────────────────────────

function KpiGrid({ k }: { k: AnalyticsResult['kpis'] }) {
  const items = [
    { label: 'الموظفون', value: String(k.totalEmployees), icon: Users, color: 'emerald' as const },
    { label: 'نسبة الحضور', value: `${k.attendanceRate.toFixed(1)}%`, icon: CheckCircle2, color: 'emerald' as const, bar: k.attendanceRate },
    { label: 'نسبة الانضباط', value: `${k.punctualityRate.toFixed(1)}%`, icon: Clock, color: 'blue' as const, bar: k.punctualityRate },
    { label: 'إجمالي الساعات', value: `${k.totalWorkHours.toFixed(1)}`, icon: BarChart3, color: 'purple' as const },
    { label: 'متوسط ساعات اليوم', value: `${k.averageWorkHours.toFixed(1)}`, icon: TrendingUp, color: 'purple' as const },
    { label: 'دقائق التأخير', value: String(k.totalLateMinutes), icon: TrendingDown, color: 'amber' as const },
    { label: 'أيام الغياب', value: String(k.absentDays), icon: AlertTriangle, color: 'red' as const },
    { label: 'مؤشر الموثوقية', value: `${k.reliabilityIndex}`, icon: ShieldCheck, color: 'emerald' as const, bar: k.reliabilityIndex },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className={`rounded-xl border p-4 ${COLOR_CLASSES[it.color]}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] opacity-80">{it.label}</span>
            <it.icon className="h-4 w-4 opacity-60" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">{it.value}</div>
          {it.bar != null && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/30">
              <div className="h-full bg-current" style={{ width: `${Math.min(100, it.bar)}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const COLOR_CLASSES: Record<'emerald' | 'blue' | 'purple' | 'amber' | 'red' | 'slate', string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  slate: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

// ─── Trend chart ─────────────────────────────────────────────────────────

function TrendChart({ trend }: { trend: AnalyticsResult['trend'] }) {
  const data = trend.map((t) => ({ date: t.date.slice(5), حضور: t.present, غياب: t.absent, تأخير: t.late }));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-bold text-white">الاتجاه اليومي</h3>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#cbd5e1' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="حضور" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="غياب" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="تأخير" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Day-of-week bar ────────────────────────────────────────────────────

function DowChart({ byDayOfWeek }: { byDayOfWeek: AnalyticsResult['byDayOfWeek'] }) {
  const max = Math.max(1, ...byDayOfWeek.map((d) => d.present + d.absent + d.late));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <h3 className="mb-3 text-sm font-bold text-white">حسب يوم الأسبوع</h3>
      <div className="space-y-1.5">
        {byDayOfWeek.map((d) => {
          const total = d.present + d.absent + d.late;
          if (total === 0) return null;
          return (
            <div key={d.dayIndex} className="flex items-center gap-2">
              <div className="w-14 text-[11px] text-slate-300">{d.day}</div>
              <div className="flex h-5 flex-1 overflow-hidden rounded bg-slate-900/40">
                <div
                  className="bg-emerald-500/70"
                  style={{ width: `${(d.present / max) * 100}%` }}
                  title={`حضور: ${d.present}`}
                />
                <div
                  className="bg-amber-500/70"
                  style={{ width: `${(d.late / max) * 100}%` }}
                  title={`تأخير: ${d.late}`}
                />
                <div
                  className="bg-red-500/70"
                  style={{ width: `${(d.absent / max) * 100}%` }}
                  title={`غياب: ${d.absent}`}
                />
              </div>
              <div className="w-12 text-left text-[11px] tabular-nums text-slate-400">{d.attendanceRate}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ByCityCard({ byCity }: { byCity: AnalyticsResult['byCity'] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <h3 className="mb-3 text-sm font-bold text-white">حسب المدينة</h3>
      <div className="space-y-2">
        {byCity.map((c) => (
          <div key={c.city} className="flex items-center justify-between rounded-lg bg-slate-900/40 p-2">
            <span className="text-xs text-white">{c.city}</span>
            <div className="flex items-center gap-3 text-[11px] text-slate-300">
              <span>{c.employees} موظف</span>
              <span className="text-emerald-300">{c.attendanceRate}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ranking ────────────────────────────────────────────────────────────

function RankingRow({ top, bottom }: { top: RankedEmployee[]; bottom: RankedEmployee[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RankBlock title="الأكثر التزاماً" icon={Award} variant="success" rows={top} />
      <RankBlock title="يحتاجون متابعة" icon={AlertTriangle} variant="warning" rows={bottom} />
    </div>
  );
}

function RankBlock({
  title,
  icon: Icon,
  variant,
  rows,
}: {
  title: string;
  icon: any;
  variant: 'success' | 'warning';
  rows: RankedEmployee[];
}) {
  const cls = variant === 'success'
    ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
    : 'border-amber-500/20 bg-amber-500/[0.04]';
  return (
    <div className={`rounded-2xl border ${cls} p-4`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-white opacity-80" />
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">لا بيانات.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={r.employeeId} className="flex items-center justify-between rounded-md bg-slate-950/40 px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[11px] text-slate-500 tabular-nums">#{i + 1}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{r.name}</div>
                  <div className="truncate text-[10px] text-slate-400">
                    {r.track} • {r.city}
                  </div>
                </div>
              </div>
              <div className="text-left">
                <div className="text-sm font-bold tabular-nums text-white">{r.attendanceRate}%</div>
                <div className="text-[10px] text-slate-400 tabular-nums">موثوقية {r.reliabilityIndex}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Anomalies ──────────────────────────────────────────────────────────

function AnomaliesPanel({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-emerald-300">
        <CheckCircle2 className="h-5 w-5" />
        لا توجد حالات شاذة في الفترة المحددة.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-300" />
        <h3 className="text-sm font-bold text-white">الحالات الشاذة</h3>
        <span className="text-[11px] text-slate-400">({anomalies.length})</span>
      </div>
      <div className="space-y-1.5">
        {anomalies.slice(0, 30).map((a, i) => (
          <div key={i} className="flex items-center justify-between rounded-md border border-white/5 bg-slate-950/40 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                a.severity === 'high' ? 'bg-red-500/15 text-red-300' :
                a.severity === 'medium' ? 'bg-amber-500/15 text-amber-300' :
                'bg-blue-500/15 text-blue-300'
              }`}>
                {a.severity === 'high' ? 'عالٍ' : a.severity === 'medium' ? 'متوسط' : 'منخفض'}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm text-white">{a.name}</div>
                <div className="truncate text-[11px] text-slate-400">{a.track} • {a.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tracks table ───────────────────────────────────────────────────────

function ByTrackTable({ byTrack }: { byTrack: AnalyticsResult['byTrack'] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <h3 className="mb-3 text-sm font-bold text-white">حسب المسار</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="text-[11px] text-slate-400">
            <tr>
              <th className="px-2 py-2 font-normal">المسار</th>
              <th className="px-2 py-2 font-normal">الموظفون</th>
              <th className="px-2 py-2 font-normal">نسبة الحضور</th>
              <th className="px-2 py-2 font-normal">إجمالي الساعات</th>
              <th className="px-2 py-2 font-normal">أيام الغياب</th>
            </tr>
          </thead>
          <tbody>
            {byTrack.map((t, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-2 py-2 text-slate-200">{t.track}</td>
                <td className="px-2 py-2 tabular-nums text-white">{t.employees}</td>
                <td className="px-2 py-2 tabular-nums text-white">{t.attendanceRate}%</td>
                <td className="px-2 py-2 tabular-nums text-white">{t.totalHours.toFixed(1)}</td>
                <td className="px-2 py-2 tabular-nums text-amber-300">{t.absentDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Heatmap ────────────────────────────────────────────────────────────

function Heatmap({ heatmap }: { heatmap: AnalyticsResult['heatmap'] }) {
  if (heatmap.employees.length === 0) return null;
  // Status code → color, must match service codes:
  // 0 no data, 1 present, 2 on-call present, 3 incomplete, 4 check-only,
  // 5 absent, 6 on-call no-visit, 7 other
  const colorOf = (c: number) => {
    switch (c) {
      case 1: return 'bg-emerald-500/80';
      case 2: return 'bg-emerald-400/60';
      case 3: return 'bg-amber-500/60';
      case 4: return 'bg-amber-500/40';
      case 5: return 'bg-red-500/80';
      case 6: return 'bg-slate-500/40';
      case 7: return 'bg-blue-500/40';
      default: return 'bg-slate-800/60';
    }
  };
  const tipOf = (c: number) => {
    switch (c) {
      case 1: return 'حاضر';
      case 2: return 'On Call — حاضر';
      case 3: return 'دوام أقل من 8 ساعات';
      case 4: return 'دخول/خروج فقط';
      case 5: return 'غائب';
      case 6: return 'On Call — لم يحضر';
      case 7: return 'حالة أخرى';
      default: return 'لا بيانات';
    }
  };

  // Pre-compute day number + weekday letter + month-change markers so the
  // header is readable without rotation. We also build a row of merged
  // month labels above so users can see "April / May" boundaries at a glance.
  const WEEKDAY_LETTERS = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // أحد..سبت
  const MONTH_NAMES = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  const cols = heatmap.dates.map((iso) => {
    const d = new Date(iso + 'T00:00:00Z');
    return {
      iso,
      day: d.getUTCDate(),
      month: d.getUTCMonth(),
      year: d.getUTCFullYear(),
      weekday: d.getUTCDay(),
      isWeekStart: d.getUTCDay() === 0, // الأحد
    };
  });
  // Build merged month spans for the top header row.
  const monthSpans: Array<{ key: string; label: string; count: number }> = [];
  for (const c of cols) {
    const k = `${c.year}-${c.month}`;
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.key === k) {
      last.count += 1;
    } else {
      monthSpans.push({ key: k, label: MONTH_NAMES[c.month], count: 1 });
    }
  }
  const CELL = 22; // px — wide enough for "DD" without rotation

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-white">خريطة الحضور (موظف × يوم)</h3>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Legend2 cls="bg-emerald-500/80" label="حاضر" />
          <Legend2 cls="bg-emerald-400/60" label="On Call حاضر" />
          <Legend2 cls="bg-amber-500/60" label="ناقص ساعات" />
          <Legend2 cls="bg-red-500/80" label="غائب" />
          <Legend2 cls="bg-slate-800/60" label="لا بيانات" />
        </div>
      </div>
      <div className="overflow-x-auto" dir="ltr">
        <table className="border-separate border-spacing-0" style={{ direction: 'ltr' }}>
          <thead>
            {/* Month banner row */}
            <tr>
              <th
                className="sticky right-0 z-10 bg-slate-950/90 px-2 pb-1 pt-0.5"
                style={{ minWidth: 200 }}
              />
              {monthSpans.map((m) => (
                <th
                  key={m.key}
                  colSpan={m.count}
                  className="border-b border-emerald-500/20 px-1 pb-1 pt-0.5 text-center text-[11px] font-semibold text-emerald-300"
                >
                  {m.label}
                </th>
              ))}
            </tr>
            {/* Day-of-month + weekday-letter row */}
            <tr>
              <th
                className="sticky right-0 z-10 bg-slate-950/90 px-2 py-1 text-right text-[11px] text-slate-400"
                style={{ minWidth: 200 }}
              >
                الموظف
              </th>
              {cols.map((c) => (
                <th
                  key={c.iso}
                  className={`px-0 py-1 text-center align-bottom ${
                    c.isWeekStart ? 'border-r border-white/10' : ''
                  }`}
                  style={{ width: CELL, minWidth: CELL }}
                  title={c.iso}
                >
                  <div className="leading-none flex flex-col items-center gap-0.5">
                    <span className="text-[11px] font-semibold tabular-nums text-slate-200">
                      {c.day}
                    </span>
                    <span className="text-[8px] text-slate-500">{WEEKDAY_LETTERS[c.weekday]}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.employees.map((emp, r) => (
              <tr key={emp.id} className="hover:bg-white/[0.02]">
                <td
                  className="sticky right-0 z-10 bg-slate-950/90 px-2 py-1 text-right text-slate-200"
                  dir="rtl"
                  style={{ minWidth: 200 }}
                >
                  <div className="truncate text-xs">{emp.name}</div>
                  <div className="truncate text-[10px] text-slate-500">{emp.track}</div>
                </td>
                {heatmap.cells[r].map((c, i) => (
                  <td
                    key={i}
                    className={`p-0 ${cols[i].isWeekStart ? 'border-r border-white/10' : ''}`}
                    style={{ width: CELL, minWidth: CELL }}
                  >
                    <div className="flex justify-center py-0.5">
                      <div
                        className={`h-4 w-4 rounded ${colorOf(c)}`}
                        title={`${heatmap.dates[i]} • ${tipOf(c)}`}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        الأحرف تحت الأيام: ح=الأحد، ن=الاثنين، ث=الثلاثاء، ر=الأربعاء، خ=الخميس، ج=الجمعة، س=السبت.
      </p>
    </div>
  );
}

function Legend2({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-slate-400">
      <span className={`inline-block h-3 w-3 rounded ${cls}`} />
      {label}
    </span>
  );
}
