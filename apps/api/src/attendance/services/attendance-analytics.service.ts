import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma, PdfAttendanceCenter, PdfAttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * Cross-period analytics over PdfDailyAttendanceSummary.
 *
 * The existing AttendanceAnalysisService is per-upload (one PDF, one
 * day's worth of summaries). This service answers the orthogonal
 * question: "across an arbitrary date range — what are the trends,
 * the rankings, the streaks, and which employees need attention?"
 *
 * No new schema. We aggregate the same rows the daily flow writes.
 *
 * RBAC is enforced by the caller passing the requesting user's role
 * + (optional) restricted scope. admin/system_manager/hr → no scope
 * restriction. track_lead/pm → must match an employee.track they own.
 * employee → forced to scope='employee' with their own employeeId.
 */

export type Center = 'makkah' | 'madinah' | 'all';

export interface AnalyticsScope {
  /** Filter by `PdfAttendanceEmployee.track` (string, not FK). */
  trackName?: string | null;
  /** Filter by `PdfAttendanceEmployee.center`. */
  center?: Center;
  /** Restrict to a single employee. */
  employeeId?: string | null;
  /** Only employees with worksByCharter = true. */
  rosterOnly?: boolean;
}

export interface AnalyticsResult {
  period: { from: string; to: string; days: number };
  scope: AnalyticsScope;
  kpis: {
    totalEmployees: number;
    totalDailyRecords: number;
    presentDays: number;
    absentDays: number;
    incompleteDays: number;
    onCallPresent: number;
    attendanceRate: number; // %
    punctualityRate: number; // % within-charter on time
    averageWorkHours: number;
    totalWorkHours: number;
    totalLateMinutes: number;
    reliabilityIndex: number; // composite 0..100
  };
  trend: Array<{
    date: string;
    present: number;
    absent: number;
    late: number;
    incomplete: number;
    totalHours: number;
  }>;
  byTrack: Array<{
    track: string;
    employees: number;
    attendanceRate: number;
    totalHours: number;
    absentDays: number;
  }>;
  byCity: Array<{
    city: 'مكة المكرمة' | 'المدينة المنورة' | 'مشترك';
    employees: number;
    attendanceRate: number;
    totalHours: number;
  }>;
  byDayOfWeek: Array<{
    day: string; // الأحد..السبت
    dayIndex: number; // 0=Sunday
    present: number;
    absent: number;
    late: number;
    attendanceRate: number;
  }>;
  topPerformers: Array<RankedEmployee>;
  bottomPerformers: Array<RankedEmployee>;
  anomalies: Array<Anomaly>;
  heatmap: {
    employees: Array<{ id: string; name: string; track: string }>;
    dates: string[];
    /** cells[employeeIdx][dateIdx] = status code */
    cells: number[][];
  };
  perEmployee?: EmployeeDetail; // only when scope.employeeId is set
}

export interface RankedEmployee {
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

export interface Anomaly {
  type: 'consecutive_absence' | 'repeated_late' | 'sudden_drop' | 'over_threshold';
  severity: 'high' | 'medium' | 'low';
  employeeId: string;
  name: string;
  track: string;
  detail: string;
  count?: number;
}

export interface EmployeeDetail {
  employee: {
    id: string;
    name: string;
    track: string;
    trackDetail: string | null;
    city: string;
    employeeNumber: string | null;
    scheduledCheckIn: string | null;
    scheduledCheckOut: string | null;
    shiftType: string;
    worksByCharter: boolean;
  };
  daily: Array<{
    date: string;
    status: PdfAttendanceStatus;
    firstCheckIn: string | null;
    lastCheckOut: string | null;
    totalHours: number | null;
    flags: string[];
    lateMinutes: number;
  }>;
  summary: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    totalHours: number;
    attendanceRate: number;
    longestPresentStreak: number;
    longestAbsentStreak: number;
  };
}

const CENTER_LABEL: Record<PdfAttendanceCenter, 'مكة المكرمة' | 'المدينة المنورة' | 'مشترك'> = {
  makkah: 'مكة المكرمة',
  madinah: 'المدينة المنورة',
  shared: 'مشترك',
};
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

@Injectable()
export class AttendanceAnalyticsService {
  private readonly logger = new Logger(AttendanceAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async analyze(
    fromIso: string,
    toIso: string,
    scope: AnalyticsScope = {},
  ): Promise<AnalyticsResult> {
    const from = parseDateBoundary(fromIso, 'start');
    const to = parseDateBoundary(toIso, 'end');
    if (!from || !to) {
      throw new ForbiddenException('فترة غير صالحة');
    }

    const where: Prisma.PdfDailyAttendanceSummaryWhereInput = {
      reportDate: { gte: from, lte: to },
      employee: {
        ...(scope.trackName ? { track: scope.trackName } : {}),
        ...(scope.center && scope.center !== 'all' ? { center: scope.center as PdfAttendanceCenter } : {}),
        ...(scope.rosterOnly ? { worksByCharter: true } : {}),
      },
      ...(scope.employeeId ? { employeeId: scope.employeeId } : {}),
    };

    const summaries = await this.prisma.pdfDailyAttendanceSummary.findMany({
      where,
      orderBy: [{ reportDate: 'asc' }],
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            track: true,
            trackDetail: true,
            shiftType: true,
            center: true,
            scheduledCheckIn: true,
            scheduledCheckOut: true,
            worksByCharter: true,
          },
        },
      },
    });
    this.logger.log(
      `Analytics: from=${fromIso} to=${toIso} rows=${summaries.length} scope=${JSON.stringify(scope)}`,
    );

    return this.compute(from, to, scope, summaries);
  }

  // ───────────────────────────────────────────────────────────────────
  // Aggregation
  // ───────────────────────────────────────────────────────────────────
  private compute(
    from: Date,
    to: Date,
    scope: AnalyticsScope,
    summaries: any[],
  ): AnalyticsResult {
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);

    // ─── headline KPIs ─────────────────────────────────────────────
    const employeesById = new Map<string, any>();
    for (const s of summaries) employeesById.set(s.employee.id, s.employee);

    const present = summaries.filter((s) => s.status === 'present' || s.status === 'on_call_present');
    const absent = summaries.filter((s) => s.status === 'absent');
    const incomplete = summaries.filter((s) => s.status === 'incomplete_hours');
    const onCallPresent = summaries.filter((s) => s.status === 'on_call_present');

    const totalHoursAcc = summaries.reduce((acc, s) => acc + (s.totalHours ?? 0), 0);
    const presentHours = present.map((s) => s.totalHours ?? 0).filter((h) => h > 0);
    const avgHours = presentHours.length ? presentHours.reduce((a, b) => a + b, 0) / presentHours.length : 0;

    let lateMinutesAcc = 0;
    let punctualWithin = 0;
    let punctualDenom = 0;
    for (const s of summaries) {
      const lm = lateMinutes(s.firstCheckIn, s.employee.scheduledCheckIn);
      if (lm == null) continue;
      lateMinutesAcc += lm;
      if (s.employee.worksByCharter) {
        punctualDenom += 1;
        if (lm <= 15) punctualWithin += 1; // 15-min grace mirrors AttendanceAnalysisService
      }
    }

    const total = summaries.length;
    const attendanceRate = total ? +((present.length / total) * 100).toFixed(2) : 0;
    const punctualityRate = punctualDenom ? +((punctualWithin / punctualDenom) * 100).toFixed(2) : 0;

    // ─── trend (per-day buckets) ──────────────────────────────────
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const trendMap = new Map<string, { present: number; absent: number; late: number; incomplete: number; totalHours: number }>();
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
      trendMap.set(dayKey(d), { present: 0, absent: 0, late: 0, incomplete: 0, totalHours: 0 });
    }
    for (const s of summaries) {
      const k = dayKey(s.reportDate);
      const cur = trendMap.get(k);
      if (!cur) continue;
      if (s.status === 'present' || s.status === 'on_call_present') cur.present += 1;
      if (s.status === 'absent') cur.absent += 1;
      if (s.status === 'incomplete_hours') cur.incomplete += 1;
      const lm = lateMinutes(s.firstCheckIn, s.employee.scheduledCheckIn);
      if (lm != null && lm > 15) cur.late += 1;
      cur.totalHours += s.totalHours ?? 0;
    }
    const trend = [...trendMap.entries()].map(([date, v]) => ({ date, ...v, totalHours: +v.totalHours.toFixed(2) }));

    // ─── breakdowns ───────────────────────────────────────────────
    const byTrackMap = new Map<string, { employees: Set<string>; total: number; present: number; hours: number; absent: number }>();
    for (const s of summaries) {
      const t = s.employee.track || 'غير محدد';
      const cur = byTrackMap.get(t) ?? { employees: new Set<string>(), total: 0, present: 0, hours: 0, absent: 0 };
      cur.employees.add(s.employee.id);
      cur.total += 1;
      if (s.status === 'present' || s.status === 'on_call_present') cur.present += 1;
      if (s.status === 'absent') cur.absent += 1;
      cur.hours += s.totalHours ?? 0;
      byTrackMap.set(t, cur);
    }
    const byTrack = [...byTrackMap.entries()].map(([track, v]) => ({
      track,
      employees: v.employees.size,
      attendanceRate: v.total ? +((v.present / v.total) * 100).toFixed(2) : 0,
      totalHours: +v.hours.toFixed(2),
      absentDays: v.absent,
    }));

    const byCityMap = new Map<PdfAttendanceCenter, { employees: Set<string>; total: number; present: number; hours: number }>();
    for (const s of summaries) {
      const c = (s.employee.center as PdfAttendanceCenter) || 'shared';
      const cur = byCityMap.get(c) ?? { employees: new Set<string>(), total: 0, present: 0, hours: 0 };
      cur.employees.add(s.employee.id);
      cur.total += 1;
      if (s.status === 'present' || s.status === 'on_call_present') cur.present += 1;
      cur.hours += s.totalHours ?? 0;
      byCityMap.set(c, cur);
    }
    const byCity = [...byCityMap.entries()].map(([c, v]) => ({
      city: CENTER_LABEL[c],
      employees: v.employees.size,
      attendanceRate: v.total ? +((v.present / v.total) * 100).toFixed(2) : 0,
      totalHours: +v.hours.toFixed(2),
    }));

    // Day-of-week distribution (which weekday has the most absences?)
    const byDow: Array<{ present: number; absent: number; late: number; total: number }> =
      Array.from({ length: 7 }, () => ({ present: 0, absent: 0, late: 0, total: 0 }));
    for (const s of summaries) {
      const idx = new Date(s.reportDate).getDay();
      byDow[idx].total += 1;
      if (s.status === 'present' || s.status === 'on_call_present') byDow[idx].present += 1;
      if (s.status === 'absent') byDow[idx].absent += 1;
      const lm = lateMinutes(s.firstCheckIn, s.employee.scheduledCheckIn);
      if (lm != null && lm > 15) byDow[idx].late += 1;
    }
    const byDayOfWeek = byDow.map((d, i) => ({
      day: DAY_NAMES[i],
      dayIndex: i,
      present: d.present,
      absent: d.absent,
      late: d.late,
      attendanceRate: d.total ? +((d.present / d.total) * 100).toFixed(2) : 0,
    }));

    // ─── per-employee aggregation (used for ranking, anomalies, heatmap) ──
    const perEmpRows = this.aggregatePerEmployee(summaries);
    const ranked = [...perEmpRows].sort((a, b) => b.reliabilityIndex - a.reliabilityIndex);
    const topPerformers = ranked.slice(0, 5);
    const bottomPerformers = ranked.slice(-5).reverse();

    const anomalies = this.detectAnomalies(perEmpRows, summaries);

    const heatmap = this.buildHeatmap(summaries, from, to, ranked, scope.employeeId);

    // ─── reliability composite (0..100) ───────────────────────────
    const reliabilityIndex = compositeReliability(attendanceRate, punctualityRate, presentHours);

    // Optional employee-deep view when caller asked for one
    const perEmployee = scope.employeeId
      ? this.buildEmployeeDetail(summaries, employeesById.get(scope.employeeId))
      : undefined;

    return {
      period: { from: dayKey(from), to: dayKey(to), days },
      scope,
      kpis: {
        totalEmployees: employeesById.size,
        totalDailyRecords: total,
        presentDays: present.length,
        absentDays: absent.length,
        incompleteDays: incomplete.length,
        onCallPresent: onCallPresent.length,
        attendanceRate,
        punctualityRate,
        averageWorkHours: +avgHours.toFixed(2),
        totalWorkHours: +totalHoursAcc.toFixed(2),
        totalLateMinutes: lateMinutesAcc,
        reliabilityIndex,
      },
      trend,
      byTrack,
      byCity,
      byDayOfWeek,
      topPerformers,
      bottomPerformers,
      anomalies,
      heatmap,
      perEmployee,
    };
  }

  private aggregatePerEmployee(summaries: any[]): RankedEmployee[] {
    type Bucket = {
      employee: any;
      total: number;
      present: number;
      absent: number;
      late: number;
      hours: number;
      lateMinutes: number;
      records: Array<{ date: Date; status: PdfAttendanceStatus }>;
    };
    const map = new Map<string, Bucket>();
    for (const s of summaries) {
      const id = s.employee.id;
      let b = map.get(id);
      if (!b) {
        b = {
          employee: s.employee,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          hours: 0,
          lateMinutes: 0,
          records: [],
        };
        map.set(id, b);
      }
      b.total += 1;
      if (s.status === 'present' || s.status === 'on_call_present') b.present += 1;
      if (s.status === 'absent') b.absent += 1;
      const lm = lateMinutes(s.firstCheckIn, s.employee.scheduledCheckIn);
      if (lm != null) {
        b.lateMinutes += lm;
        if (lm > 15) b.late += 1;
      }
      b.hours += s.totalHours ?? 0;
      b.records.push({ date: new Date(s.reportDate), status: s.status });
    }

    return [...map.values()].map((b) => {
      const sorted = b.records.sort((a, b2) => a.date.getTime() - b2.date.getTime());
      let curPresent = 0, longestPresent = 0, curAbsent = 0, longestAbsent = 0;
      for (const r of sorted) {
        const isPresent = r.status === 'present' || r.status === 'on_call_present';
        const isAbsent = r.status === 'absent';
        curPresent = isPresent ? curPresent + 1 : 0;
        curAbsent = isAbsent ? curAbsent + 1 : 0;
        longestPresent = Math.max(longestPresent, curPresent);
        longestAbsent = Math.max(longestAbsent, curAbsent);
      }
      const attendanceRate = b.total ? +((b.present / b.total) * 100).toFixed(2) : 0;
      const punctualityScore = b.total ? +(((b.total - b.late) / b.total) * 100).toFixed(2) : 0;
      const reliabilityIndex = +(0.5 * attendanceRate + 0.3 * punctualityScore + 0.2 * Math.min(100, b.hours)).toFixed(1);
      return {
        employeeId: b.employee.id,
        name: b.employee.fullName,
        track: b.employee.track || 'غير محدد',
        city: CENTER_LABEL[(b.employee.center as PdfAttendanceCenter) || 'shared'],
        attendanceRate,
        presentDays: b.present,
        absentDays: b.absent,
        lateDays: b.late,
        totalHours: +b.hours.toFixed(2),
        totalLateMinutes: b.lateMinutes,
        longestPresentStreak: longestPresent,
        longestAbsentStreak: longestAbsent,
        reliabilityIndex,
      };
    });
  }

  private detectAnomalies(perEmp: RankedEmployee[], _summaries: any[]): Anomaly[] {
    const out: Anomaly[] = [];
    for (const e of perEmp) {
      if (e.longestAbsentStreak >= 3) {
        out.push({
          type: 'consecutive_absence',
          severity: e.longestAbsentStreak >= 5 ? 'high' : 'medium',
          employeeId: e.employeeId,
          name: e.name,
          track: e.track,
          count: e.longestAbsentStreak,
          detail: `${e.longestAbsentStreak} أيام غياب متتالية`,
        });
      }
      if (e.lateDays >= 5) {
        out.push({
          type: 'repeated_late',
          severity: e.lateDays >= 10 ? 'high' : 'medium',
          employeeId: e.employeeId,
          name: e.name,
          track: e.track,
          count: e.lateDays,
          detail: `${e.lateDays} أيام تأخير في الفترة`,
        });
      }
      if (e.attendanceRate < 60 && e.presentDays + e.absentDays >= 5) {
        out.push({
          type: 'over_threshold',
          severity: 'high',
          employeeId: e.employeeId,
          name: e.name,
          track: e.track,
          count: Math.round(e.attendanceRate),
          detail: `نسبة حضور ${e.attendanceRate}% — أقل من 60%`,
        });
      }
    }
    return out.sort(severityRank);
  }

  private buildHeatmap(summaries: any[], from: Date, to: Date, ranked: RankedEmployee[], focusEmployeeId?: string | null) {
    const dates: string[] = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    // Cap to 30 employees for the heatmap (UI sanity); when scope is single
    // employee, just show that one row.
    const employees = focusEmployeeId
      ? ranked.filter((e) => e.employeeId === focusEmployeeId)
      : ranked.slice(0, 30);

    const idxByDate = new Map(dates.map((d, i) => [d, i]));
    const cells: number[][] = employees.map(() => Array.from({ length: dates.length }, () => 0));

    const empIdxById = new Map(employees.map((e, i) => [e.employeeId, i]));
    for (const s of summaries) {
      const r = empIdxById.get(s.employee.id);
      if (r === undefined) continue;
      const c = idxByDate.get(new Date(s.reportDate).toISOString().slice(0, 10));
      if (c === undefined) continue;
      cells[r][c] = statusCode(s.status);
    }

    return {
      employees: employees.map((e) => ({ id: e.employeeId, name: e.name, track: e.track })),
      dates,
      cells,
    };
  }

  private buildEmployeeDetail(summaries: any[], emp: any): EmployeeDetail | undefined {
    if (!emp) return undefined;
    const mine = summaries.filter((s) => s.employeeId === emp.id);
    const sorted = mine.sort((a, b) => a.reportDate.getTime() - b.reportDate.getTime());
    let curP = 0, longestP = 0, curA = 0, longestA = 0;
    for (const s of sorted) {
      const isP = s.status === 'present' || s.status === 'on_call_present';
      const isA = s.status === 'absent';
      curP = isP ? curP + 1 : 0;
      curA = isA ? curA + 1 : 0;
      longestP = Math.max(longestP, curP);
      longestA = Math.max(longestA, curA);
    }
    const present = sorted.filter((s) => s.status === 'present' || s.status === 'on_call_present').length;
    const absent = sorted.filter((s) => s.status === 'absent').length;
    const totalHours = sorted.reduce((acc, s) => acc + (s.totalHours ?? 0), 0);
    const lateDays = sorted.filter((s) => {
      const lm = lateMinutes(s.firstCheckIn, emp.scheduledCheckIn);
      return lm != null && lm > 15;
    }).length;

    return {
      employee: {
        id: emp.id,
        name: emp.fullName,
        track: emp.track,
        trackDetail: emp.trackDetail,
        city: CENTER_LABEL[(emp.center as PdfAttendanceCenter) || 'shared'],
        employeeNumber: emp.employeeNumber,
        scheduledCheckIn: emp.scheduledCheckIn,
        scheduledCheckOut: emp.scheduledCheckOut,
        shiftType: emp.shiftType,
        worksByCharter: emp.worksByCharter,
      },
      daily: sorted.map((s) => ({
        date: new Date(s.reportDate).toISOString().slice(0, 10),
        status: s.status,
        firstCheckIn: s.firstCheckIn,
        lastCheckOut: s.lastCheckOut,
        totalHours: s.totalHours,
        flags: s.flags || [],
        lateMinutes: lateMinutes(s.firstCheckIn, emp.scheduledCheckIn) ?? 0,
      })),
      summary: {
        presentDays: present,
        absentDays: absent,
        lateDays,
        totalHours: +totalHours.toFixed(2),
        attendanceRate: sorted.length ? +((present / sorted.length) * 100).toFixed(2) : 0,
        longestPresentStreak: longestP,
        longestAbsentStreak: longestA,
      },
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────────────

function parseDateBoundary(iso: string, kind: 'start' | 'end'): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (kind === 'start') {
    d.setUTCHours(0, 0, 0, 0);
  } else {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

function lateMinutes(actual: string | null, scheduled: string | null): number | null {
  if (!actual || !scheduled) return null;
  const a = toMin(actual);
  const s = toMin(scheduled);
  if (a == null || s == null) return null;
  return Math.max(0, a - s);
}

function toMin(t: string): number | null {
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function compositeReliability(attendanceRate: number, punctualityRate: number, presentHours: number[]): number {
  const avgH = presentHours.length ? presentHours.reduce((a, b) => a + b, 0) / presentHours.length : 0;
  const hoursScore = Math.min(100, (avgH / 8) * 100);
  return +(0.5 * attendanceRate + 0.3 * punctualityRate + 0.2 * hoursScore).toFixed(1);
}

function severityRank(a: Anomaly, b: Anomaly): number {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return order[a.severity] - order[b.severity];
}

// Heatmap status codes — UI maps to colors.
// 0 = no data, 1 = present, 2 = on-call present, 3 = incomplete,
// 4 = check-only, 5 = absent, 6 = on-call no-visit, 7 = other.
function statusCode(s: PdfAttendanceStatus): number {
  switch (s) {
    case 'present': return 1;
    case 'on_call_present': return 2;
    case 'incomplete_hours': return 3;
    case 'check_in_only':
    case 'check_out_only':
    case 'on_call_check_in_only':
    case 'on_call_check_out_only': return 4;
    case 'absent': return 5;
    case 'on_call_no_visit': return 6;
    default: return 7;
  }
}
