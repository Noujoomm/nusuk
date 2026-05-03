'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { StatusCellEditor, type ManualStatus } from '@/components/attendance/status-cell-editor';
import { useAuth } from '@/stores/auth';

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

// Roles allowed to flip cells in the heatmap. Mirrors the controller's
// @Roles() guard so the UI never offers an action the API would reject.
const STATUS_EDIT_ROLES = new Set(['admin', 'system_manager', 'pm', 'track_lead', 'hr']);

/** Track-key → regex used to resolve the actual Arabic track name from the
 *  live data. Tracks come back as free-form Arabic strings (e.g. "التوزيع
 *  - المدينة المنورة"), so we match on the keyword + optional city. */
const LOCKED_TRACK_PATTERNS: Record<string, RegExp> = {
  distribution: /توزيع/,
};

function resolveLockedTrack(
  options: string[],
  key: string,
  city?: 'makkah' | 'madinah',
): string {
  const re = LOCKED_TRACK_PATTERNS[key];
  if (!re) return '';
  const cityRe =
    city === 'makkah' ? /مكة|مكه/ : city === 'madinah' ? /المدينة|المدينه/ : null;
  if (cityRe) {
    const cityMatch = options.find((t) => re.test(t) && cityRe.test(t));
    if (cityMatch) return cityMatch;
  }
  return options.find((t) => re.test(t)) ?? '';
}

export function AnalyticsView({
  lockedCenter,
  lockedTrackKey,
}: {
  lockedCenter?: 'makkah' | 'madinah';
  /** When set (e.g. 'distribution' on the Madinah route), the track filter
   *  is pinned to the resolved track name and the dropdown is replaced with
   *  a static badge. Use this for routes whose subtitle promises a single
   *  track — keeps the data and the copy in sync. */
  lockedTrackKey?: keyof typeof LOCKED_TRACK_PATTERNS;
} = {}) {
  const { user } = useAuth();
  const canEditStatus = user?.role ? STATUS_EDIT_ROLES.has(user.role) : false;

  const [range, setRange] = useState<DateRange>(defaultThisMonth());
  // Locked routes (/makkah, /madinah) initialise their center and skip the
  // "all" toggle entirely; the unlocked /attendance-analytics page lets the
  // user pick.
  const [center, setCenter] = useState<'makkah' | 'madinah' | 'all'>(lockedCenter ?? 'all');
  const [trackName, setTrackName] = useState<string>('');
  const [rosterOnly, setRosterOnly] = useState(false);

  // Three independent datasets — one per section. The page stays in sync
  // with the filter bar by only fetching the sections that the current
  // scope actually shows: "all" → 3 calls in parallel; single-city → 1.
  // The Makkah and Madinah scopes both include `center='shared'` employees
  // (relations / cross-center staff), so a shared row counts in both city
  // sections by design. The Combined section is the source of truth for
  // total/unique numbers — Makkah + Madinah will overcount by the shared
  // headcount.
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

  // Resolve the locked track name from the running track list. Runs after the
  // first analytics fetch (or coverage panel) populates allTrackOptions; from
  // then on the trackName state stays pinned and the FiltersBar dropdown is
  // shown as a static badge.
  useEffect(() => {
    if (!lockedTrackKey) return;
    if (trackName) return;
    const resolved = resolveLockedTrack(
      allTrackOptions,
      lockedTrackKey,
      lockedCenter,
    );
    if (resolved) setTrackName(resolved);
  }, [lockedTrackKey, allTrackOptions, lockedCenter, trackName]);

  // Choose what to display empty-state vs sections vs loading.
  const anySectionHasData =
    (showCombined && combinedData && combinedData.kpis.totalDailyRecords > 0) ||
    (showMakkah && makkahData && makkahData.kpis.totalDailyRecords > 0) ||
    (showMadinah && madinahData && madinahData.kpis.totalDailyRecords > 0);

  return (
    <div dir="rtl" className="space-y-5">
      <Header lockedCenter={lockedCenter} />

      <CoveragePanel
        onTracks={(t) => setAllTrackOptions((prev) => Array.from(new Set([...prev, ...t])))}
      />

      {/* Quick presets are only useful when the route lets the user roam
          across cities — on a locked /makkah or /madinah page they would
          contradict the URL. Track-only narrowing happens via the dropdown. */}
      {!lockedCenter && (
        <ScopePresets
          center={center}
          trackName={trackName}
          trackOptions={allTrackOptions}
          onApply={(p) => {
            setCenter(p.center);
            setTrackName(p.trackName ?? '');
          }}
        />
      )}

      <PeriodSelector value={range} onChange={setRange} />

      <FiltersBar
        center={center}
        onCenter={setCenter}
        trackName={trackName}
        onTrack={setTrackName}
        rosterOnly={rosterOnly}
        onRosterOnly={setRosterOnly}
        trackOptions={allTrackOptions}
        cityLocked={lockedCenter}
        trackLocked={!!lockedTrackKey}
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
              canEdit={canEditStatus}
              onRefresh={load}
            />
          )}
          {showMakkah && makkahData && (
            <Section
              title="تحليل الحضور في مكة المكرمة"
              icon="🕋"
              accent="emerald"
              data={makkahData}
              subtitle="جميع المسارات في مركز مكة"
              canEdit={canEditStatus}
              onRefresh={load}
            />
          )}
          {showMadinah && madinahData && (
            <Section
              title="تحليل الحضور في المدينة المنورة"
              icon="🏛️"
              accent="blue"
              data={madinahData}
              subtitle="مسار التوزيع — مركز المدينة"
              canEdit={canEditStatus}
              onRefresh={load}
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
  canEdit,
  onRefresh,
}: {
  title: string;
  icon: string;
  accent: 'emerald' | 'blue' | 'amber';
  data: AnalyticsResult;
  subtitle?: string;
  showByCity?: boolean;
  canEdit: boolean;
  onRefresh: () => void;
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
          <Heatmap heatmap={data.heatmap} canEdit={canEdit} onRefresh={onRefresh} />
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

          {/* Diagnosis message + auto-fix */}
          {(hasIssue || dominantShared) && (
            <DiagnosisBanner e={e} />
          )}

          {/* Sample employees per center — helps verify with real names.
              All four cards always render so the layout doesn't shift when
              one bucket is empty; the empty state itself communicates the
              data-quality issue. */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200">عيّنات الموظفين حسب المدينة</h4>
              <span className="text-[10px] text-slate-500">
                إجمالي {e.total} موظف
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SampleCard
                title="عيّنة مكة المكرمة"
                icon="🕋"
                accent="amber"
                count={e.makkah}
                items={data.samples.makkah}
              />
              <SampleCard
                title="عيّنة المدينة المنورة"
                icon="🏛️"
                accent="emerald"
                count={e.madinah}
                items={data.samples.madinah}
              />
              {(e.shared > 0 || e.unset > 0) && (
                <SampleCard
                  title={e.unset > 0 ? 'عيّنة غير محدد' : 'عيّنة مشترك'}
                  icon={e.unset > 0 ? '⚠️' : 'ℹ️'}
                  accent={e.unset > 0 ? 'orange' : 'slate'}
                  count={e.unset > 0 ? e.unset : e.shared}
                  items={e.unset > 0 ? data.samples.unset : data.samples.shared}
                  warning={e.unset > 0}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Banner that explains the city-coverage gap + offers a one-click backfill
 *  for legacy rows whose `center` is null but whose track string clearly
 *  identifies the city. */
function DiagnosisBanner({ e }: { e: CoverageData['employees'] }) {
  const [running, setRunning] = useState(false);
  const dominantShared = e.total > 0 && e.shared / e.total > 0.5;
  const canBackfill = e.unset > 0 || dominantShared;

  const runBackfill = async () => {
    setRunning(true);
    const tid = toast.loading('جارٍ التصنيف التلقائي…');
    try {
      const res = await attendanceApi.backfillCenter();
      const { scanned, updated, perCenter } = res.data;
      toast.success(
        `تم فحص ${scanned} موظف · تحديث ${updated} (مكة: ${perCenter.makkah}، المدينة: ${perCenter.madinah})`,
        { id: tid, duration: 5000 },
      );
      // Hard reload so every panel/section refetches.
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error('فشل التصنيف التلقائي', { id: tid });
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
      <p className="text-xs leading-relaxed text-amber-200">
        {e.madinah === 0 && e.makkah === 0 && (
          <>
            <strong>لا يوجد أي موظف مرتبط بمدينة محددة.</strong> الحل السريع: اضغط
            "تصنيف تلقائي" أدناه — النظام سيقرأ نص المسار لكل موظف ويصنّفه إذا وُجدت
            "(مكة المكرمة)" أو "(المدينة المنورة)".
          </>
        )}
        {e.madinah === 0 && e.makkah > 0 && (
          <>
            <strong>لا يوجد موظفون مرتبطون بـ "المدينة المنورة"</strong> رغم وجود {e.makkah}{' '}
            لمكة. أضف عمود <span className="font-mono">"المدينة"</span> للـ sheets في ملف الكراسة Excel
            وأعد رفعه.
          </>
        )}
        {dominantShared && e.madinah > 0 && e.makkah > 0 && (
          <>
            <strong>{Math.round((e.shared / e.total) * 100)}% من الموظفين "مشترك"</strong> — غالباً
            موظفو التدريب/العلاقات/الإدارة. أضف عمود <span className="font-mono">"المدينة"</span> لكل
            sheet أو اضغط "تصنيف تلقائي".
          </>
        )}
        {e.unset > 0 && (
          <>
            {' '}<strong>{e.unset} موظف بدون مدينة محددة</strong> — اضغط "تصنيف تلقائي" لاستنتاج المدينة
            من اسم المسار.
          </>
        )}
      </p>
      {canBackfill && (
        <div className="mt-3">
          <button
            onClick={runBackfill}
            disabled={running}
            className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {running ? '⏳ جارٍ التصنيف…' : '🔧 تصنيف تلقائي للموظفين'}
          </button>
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

/** Per-city sample card. Always renders — empty state communicates a
 *  data-quality issue. Higher contrast than the legacy SampleList so the
 *  card itself is visible even when the items list is short. */
function SampleCard({
  title,
  icon,
  accent,
  count,
  items,
  warning,
}: {
  title: string;
  icon: string;
  accent: 'amber' | 'emerald' | 'orange' | 'slate';
  count: number;
  items: Array<{ fullName: string; track: string }>;
  warning?: boolean;
}) {
  const t = SAMPLE_ACCENTS[accent];
  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${t.border} bg-gradient-to-br ${t.bg} p-4 shadow-lg shadow-black/30`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h5 className={`flex items-center gap-2 text-sm font-bold ${t.title}`}>
          <span className="text-base">{icon}</span>
          <span>{title}</span>
        </h5>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${t.pill}`}>
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-slate-400">
          {warning ? 'لا موظفون غير مصنّفين — ممتاز ✓' : 'لا توجد عيّنة'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 5).map((it, i) => (
            <li
              key={i}
              className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5"
            >
              <div className="truncate text-xs font-semibold text-white">{it.fullName}</div>
              <div className="truncate text-[10px] text-slate-300">{it.track || '—'}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SAMPLE_ACCENTS = {
  amber: {
    border: 'border-amber-500/30',
    bg: 'from-amber-500/[0.10] to-amber-700/[0.04]',
    title: 'text-amber-200',
    pill: 'border border-amber-500/30 bg-amber-500/15 text-amber-100',
  },
  emerald: {
    border: 'border-emerald-500/30',
    bg: 'from-emerald-500/[0.10] to-emerald-700/[0.04]',
    title: 'text-emerald-200',
    pill: 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-100',
  },
  orange: {
    border: 'border-orange-500/40',
    bg: 'from-orange-500/[0.12] to-red-700/[0.05]',
    title: 'text-orange-200',
    pill: 'border border-orange-500/30 bg-orange-500/15 text-orange-100',
  },
  slate: {
    border: 'border-slate-500/30',
    bg: 'from-slate-500/[0.08] to-slate-700/[0.04]',
    title: 'text-slate-200',
    pill: 'border border-slate-500/30 bg-slate-500/15 text-slate-200',
  },
} as const;

// ─── Header ──────────────────────────────────────────────────────────────

function Header({ lockedCenter }: { lockedCenter?: 'makkah' | 'madinah' }) {
  // Per-city pages get a banner that names the city + uses its accent so the
  // user is never in doubt about which scope they're in. The unscoped page
  // keeps the original generic header.
  if (lockedCenter === 'makkah') {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-900/40 to-transparent p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-2xl">
            🕋
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">تحليل حضور مكة المكرمة</h1>
            <p className="mt-1 text-sm text-slate-400">
              جميع موظفي مركز مكة عبر كل المسارات — حضور، التزام، اتجاهات، وحالات شاذة.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (lockedCenter === 'madinah') {
    return (
      <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-slate-900/40 to-transparent p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/15 text-2xl">
            🏛️
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">تحليل حضور المدينة المنورة</h1>
            <p className="mt-1 text-sm text-slate-400">
              موظفو مركز المدينة (مسار التوزيع حالياً) — حضور، التزام، اتجاهات، وحالات شاذة.
            </p>
          </div>
        </div>
      </div>
    );
  }
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
  cityLocked,
  trackLocked,
}: {
  center: 'makkah' | 'madinah' | 'all';
  onCenter: (c: 'makkah' | 'madinah' | 'all') => void;
  trackName: string;
  onTrack: (t: string) => void;
  rosterOnly: boolean;
  onRosterOnly: (b: boolean) => void;
  trackOptions: string[];
  cityLocked?: 'makkah' | 'madinah';
  trackLocked?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
      {cityLocked ? (
        // The route already pins the city — show it as a static badge so users
        // see the active scope without thinking the dropdown is broken.
        <div className="flex flex-col">
          <span className="mb-1 text-[11px] text-slate-400">المدينة</span>
          <span
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm ${
              cityLocked === 'makkah'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
            }`}
            title="مثبّتة من مسار الصفحة"
          >
            {cityLocked === 'makkah' ? '🕋 مكة المكرمة' : '🏛️ المدينة المنورة'}
          </span>
        </div>
      ) : (
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
      )}
      {trackLocked ? (
        // Track is pinned by the route (e.g. /madinah → distribution). Show
        // the resolved name as a static badge so the user sees the active
        // scope and isn't confused by a missing dropdown.
        <div className="flex flex-col">
          <span className="mb-1 text-[11px] text-slate-400">المسار</span>
          <span
            className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200"
            title="مثبّت من مسار الصفحة"
          >
            📦 {trackName || '— جارٍ تحديد مسار التوزيع —'}
          </span>
        </div>
      ) : (
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
      )}
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

function Heatmap({
  heatmap,
  canEdit,
  onRefresh,
}: {
  heatmap: AnalyticsResult['heatmap'];
  canEdit: boolean;
  onRefresh: () => void;
}) {
  // Manual-edit modal state — opened by a plain click on a cell.
  const [editing, setEditing] = useState<{
    employeeId: string;
    employeeName: string;
    date: string;
    currentStatus: ManualStatus | null;
  } | null>(null);

  // Multi-select state. Keys are `${employeeId}|${date}`. lastKey anchors
  // shift-range selections. The drag rect is purely visual feedback — the
  // intersection math runs once at mouseup against every cell's boundingRect.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [dragRect, setDragRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref instead of state because we read the "moved" flag inside the cell
  // click handler that fires synchronously before React schedules a re-render.
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0 });

  if (heatmap.employees.length === 0) return null;
  // Status code → color, must match service codes:
  // 0 no data, 1 present, 2 on-call present, 3 incomplete, 4 check-only,
  // 5 absent, 6 on-call no-visit, 7 other, 8 manual LATE, 9 manual EXCUSED.
  const colorOf = (c: number) => {
    switch (c) {
      case 1: return 'bg-emerald-500/80';
      case 2: return 'bg-emerald-400/60';
      case 3: return 'bg-amber-500/60';
      case 4: return 'bg-amber-500/40';
      case 5: return 'bg-red-500/80';
      case 6: return 'bg-slate-500/40';
      case 7: return 'bg-blue-500/40';
      case 8: return 'bg-amber-500/80'; // manual LATE
      case 9: return 'bg-blue-500/80';  // manual EXCUSED_ABSENCE
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
      case 8: return 'متأخر (تعديل يدوي)';
      case 9: return 'غياب بعذر (تعديل يدوي)';
      default: return 'لا بيانات';
    }
  };
  // Manual-edit codes carry the current override; everything else opens
  // the editor blank so the user picks freely.
  const codeToManual = (c: number): ManualStatus | null => {
    if (c === 8) return 'LATE';
    if (c === 9) return 'EXCUSED_ABSENCE';
    return null;
  };
  const isManualCode = (c: number) => c === 8 || c === 9;

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

  // ─── multi-select helpers ──────────────────────────────────────────
  const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;
  const dateIndex = useMemo(() => new Map(heatmap.dates.map((d, i) => [d, i])), [heatmap.dates]);
  const employeeIndex = useMemo(
    () => new Map(heatmap.employees.map((e, i) => [e.id, i])),
    [heatmap.employees],
  );

  const handleCellClick = (e: React.MouseEvent, employeeId: string, date: string, code: number) => {
    // Drag-just-finished suppresses click — the table-level mouseup ran a
    // moment ago and React is now flushing this synthetic click.
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const key = cellKey(employeeId, date);

    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setLastKey(key);
      return;
    }
    if (e.shiftKey && lastKey) {
      e.preventDefault();
      const ar = employeeIndex.get(lastKey.split('|')[0]);
      const ac = dateIndex.get(lastKey.split('|')[1]);
      const br = employeeIndex.get(employeeId);
      const bc = dateIndex.get(date);
      if (ar == null || ac == null || br == null || bc == null) return;
      const r1 = Math.min(ar, br), r2 = Math.max(ar, br);
      const c1 = Math.min(ac, bc), c2 = Math.max(ac, bc);
      const additions: string[] = [];
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          additions.push(cellKey(heatmap.employees[r].id, heatmap.dates[c]));
        }
      }
      setSelected((prev) => new Set([...prev, ...additions]));
      setLastKey(key);
      return;
    }

    // Plain click — preserve the existing single-cell editor behaviour.
    const empIdx = employeeIndex.get(employeeId)!;
    setEditing({
      employeeId,
      employeeName: heatmap.employees[empIdx].name,
      date,
      currentStatus: codeToManual(code),
    });
    setLastKey(key);
  };

  const onTableMouseDown = (e: React.MouseEvent) => {
    if (!canEdit) return;
    if (e.button !== 0) return;
    dragRef.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY };
  };
  const onTableMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    dragRef.current.moved = true;
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    setDragRect({
      left: Math.min(dragRef.current.startX, e.clientX) - rect.left + c.scrollLeft,
      top: Math.min(dragRef.current.startY, e.clientY) - rect.top + c.scrollTop,
      width: Math.abs(dx),
      height: Math.abs(dy),
    });
  };
  const onTableMouseUp = () => {
    if (!dragRef.current.active) return;
    const c = containerRef.current;
    if (dragRef.current.moved && c && dragRect) {
      const cells = c.querySelectorAll<HTMLElement>('[data-cell-key]');
      const containerRect = c.getBoundingClientRect();
      const additions: string[] = [];
      cells.forEach((el) => {
        const r = el.getBoundingClientRect();
        const rel = {
          left: r.left - containerRect.left + c.scrollLeft,
          top: r.top - containerRect.top + c.scrollTop,
          right: r.right - containerRect.left + c.scrollLeft,
          bottom: r.bottom - containerRect.top + c.scrollTop,
        };
        const intersects = !(
          dragRect.left + dragRect.width < rel.left ||
          dragRect.left > rel.right ||
          dragRect.top + dragRect.height < rel.top ||
          dragRect.top > rel.bottom
        );
        if (intersects) {
          const k = el.getAttribute('data-cell-key');
          if (k) additions.push(k);
        }
      });
      if (additions.length > 0) setSelected((prev) => new Set([...prev, ...additions]));
    }
    dragRef.current.active = false;
    setDragRect(null);
    // Reset moved AFTER the upcoming click event fires so handleCellClick
    // can detect it. requestAnimationFrame lands after the synthetic click.
    requestAnimationFrame(() => {
      dragRef.current.moved = false;
    });
  };

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setLastKey(null);
    setBulkReason('');
  }, []);

  const applyBulk = useCallback(
    async (status: ManualStatus) => {
      if (selected.size === 0) return;
      const cells = Array.from(selected).map((k) => {
        const [employeeId, date] = k.split('|');
        return { employeeId, date };
      });
      setSubmitting(true);
      const tid = toast.loading(`جارٍ تطبيق الحالة على ${cells.length} خلية…`);
      try {
        const res = await attendanceApi.bulkUpdateStatus({
          cells,
          status,
          reason: bulkReason.trim() || undefined,
        });
        const { updated, created, skipped } = res.data;
        toast.success(
          `تم: ${updated + created} تعديل · ${skipped} بدون تغيير`,
          { id: tid, duration: 4000 },
        );
        clearSelection();
        onRefresh();
      } catch (err: any) {
        const msg = err?.response?.data?.message || 'فشل التطبيق الجماعي';
        toast.error(typeof msg === 'string' ? msg : 'فشل التطبيق', { id: tid });
      } finally {
        setSubmitting(false);
      }
    },
    [selected, bulkReason, clearSelection, onRefresh],
  );

  // Keyboard shortcuts active only while a selection exists.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
        return;
      }
      const map: Record<string, ManualStatus> = {
        '1': 'PRESENT',
        '2': 'LATE',
        '3': 'ABSENT',
        '4': 'EXCUSED_ABSENCE',
      };
      if (map[e.key]) {
        e.preventDefault();
        applyBulk(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size, applyBulk, clearSelection]);

  // Selection summary for the floating bar.
  const selectionSummary = useMemo(() => {
    const emps = new Set<string>();
    const dates = new Set<string>();
    for (const k of selected) {
      const [e, d] = k.split('|');
      emps.add(e);
      dates.add(d);
    }
    return { count: selected.size, employees: emps.size, days: dates.size };
  }, [selected]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">خريطة الحضور (موظف × يوم)</h3>
          {canEdit && (
            <span
              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300"
              title="اضغط أي مربع لتعديل الحالة يدوياً"
            >
              قابل للتعديل
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Legend2 cls="bg-emerald-500/80" label="حاضر" />
          <Legend2 cls="bg-amber-500/80" label="متأخر" />
          <Legend2 cls="bg-red-500/80" label="غائب" />
          <Legend2 cls="bg-blue-500/80" label="غياب بعذر" />
          <Legend2 cls="bg-slate-800/60" label="لا بيانات" />
        </div>
      </div>
      <div
        className="relative overflow-x-auto"
        dir="ltr"
        ref={containerRef}
        onMouseDown={onTableMouseDown}
        onMouseMove={onTableMouseMove}
        onMouseUp={onTableMouseUp}
        onMouseLeave={onTableMouseUp}
        style={{ userSelect: dragRef.current.active ? 'none' : undefined }}
      >
        {dragRect && (
          <div
            className="pointer-events-none absolute z-20 rounded-md border-2 border-dashed border-cyan-400/80 bg-cyan-400/10"
            style={{
              left: dragRect.left,
              top: dragRect.top,
              width: dragRect.width,
              height: dragRect.height,
            }}
          />
        )}
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
                {heatmap.cells[r].map((c, i) => {
                  const employeeId = heatmap.employees[r].id;
                  const date = heatmap.dates[i];
                  const key = cellKey(employeeId, date);
                  const isSel = selected.has(key);
                  const cellTip = `${date} • ${tipOf(c)}${
                    canEdit ? ' (اضغط للتعديل · Ctrl للتحديد المتعدد)' : ''
                  }`;
                  const cellInner = (
                    <div className="relative flex justify-center py-0.5">
                      <div
                        className={`h-4 w-4 rounded transition-all ${colorOf(c)} ${
                          isSel ? 'scale-110 ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-950' : ''
                        }`}
                      />
                      {isManualCode(c) && (
                        <span
                          className="absolute right-2.5 top-0 h-1.5 w-1.5 rounded-full bg-cyan-300 ring-1 ring-slate-900"
                          aria-label="تعديل يدوي"
                        />
                      )}
                    </div>
                  );
                  return (
                    <td
                      key={i}
                      className={`p-0 ${cols[i].isWeekStart ? 'border-r border-white/10' : ''}`}
                      style={{ width: CELL, minWidth: CELL }}
                    >
                      {canEdit ? (
                        <button
                          type="button"
                          data-cell-key={key}
                          onClick={(e) => handleCellClick(e, employeeId, date, c)}
                          className="block w-full cursor-pointer outline-none transition-transform hover:scale-110 focus:ring-2 focus:ring-emerald-400/50"
                          title={cellTip}
                        >
                          {cellInner}
                        </button>
                      ) : (
                        <div title={cellTip}>{cellInner}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        الأحرف تحت الأيام: ح=الأحد، ن=الاثنين، ث=الثلاثاء، ر=الأربعاء، خ=الخميس، ج=الجمعة، س=السبت.
        {canEdit && ' • النقطة الزرقاء = تعديل يدوي'}
      </p>

      {editing && (
        <StatusCellEditor
          open={true}
          employeeId={editing.employeeId}
          employeeName={editing.employeeName}
          date={editing.date}
          currentStatus={editing.currentStatus}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onRefresh();
          }}
        />
      )}

      {selected.size > 0 && (
        <BulkActionBar
          summary={selectionSummary}
          submitting={submitting}
          reason={bulkReason}
          onReasonChange={setBulkReason}
          onApply={applyBulk}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}

// ─── Floating bulk-edit bar ────────────────────────────────────────────
// Slides up from the bottom when there's an active selection. Plain
// position:fixed + tailwind transition (no framer-motion in deps). Mirrors
// the StatusCellEditor's 4 buttons but applies them to the whole selection
// in one transactional API call.

function BulkActionBar({
  summary,
  submitting,
  reason,
  onReasonChange,
  onApply,
  onClear,
}: {
  summary: { count: number; employees: number; days: number };
  submitting: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  onApply: (status: ManualStatus) => void;
  onClear: () => void;
}) {
  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
      style={{ animation: 'slideUp 200ms ease-out' }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-2xl">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-cyan-300">
              <span className="font-bold tabular-nums">{summary.count}</span>
              <span className="text-slate-400">خلية</span>
            </span>
            <span className="text-slate-500">•</span>
            <span className="flex items-center gap-1 text-slate-200">
              <span className="font-bold tabular-nums">{summary.employees}</span>
              <span className="text-slate-400">موظف</span>
            </span>
            <span className="text-slate-500">•</span>
            <span className="flex items-center gap-1 text-slate-200">
              <span className="font-bold tabular-nums">{summary.days}</span>
              <span className="text-slate-400">يوم</span>
            </span>
          </div>
          <button
            onClick={onClear}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            إلغاء التحديد
            <kbd className="rounded bg-white/10 px-1 py-0.5 text-[9px]">Esc</kbd>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(
            [
              { k: 'PRESENT', label: 'حاضر', cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200', kbd: '1' },
              { k: 'LATE', label: 'متأخر', cls: 'border-amber-500/40 bg-amber-500/15 text-amber-200', kbd: '2' },
              { k: 'ABSENT', label: 'غائب', cls: 'border-red-500/40 bg-red-500/15 text-red-200', kbd: '3' },
              { k: 'EXCUSED_ABSENCE', label: 'غياب بعذر', cls: 'border-blue-500/40 bg-blue-500/15 text-blue-200', kbd: '4' },
            ] as const
          ).map((b) => (
            <button
              key={b.k}
              onClick={() => onApply(b.k as ManualStatus)}
              disabled={submitting}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${b.cls}`}
            >
              <span>{b.label}</span>
              <kbd className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-mono">{b.kbd}</kbd>
            </button>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] text-slate-400">
            سبب التعديل (اختياري) — يُطبَّق على كل الخلايا المختارة
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="مثال: إجازة جماعية، تدريب خارجي…"
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
            disabled={submitting}
          />
        </label>
      </div>
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
