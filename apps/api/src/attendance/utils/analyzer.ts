import type { PdfShiftType, PdfAttendanceStatus, PdfAttendanceFlag } from '@prisma/client';

export const MIN_REQUIRED_HOURS = 8;

export interface AnalyzerInputRecord {
  recordTime: string;            // "HH:mm"
  punchType: 'check_in' | 'check_out';
}

export interface AnalysisResult {
  firstCheckIn: string | null;   // "HH:mm"
  lastCheckOut: string | null;
  totalHours: number | null;     // decimal hours
  recordsCount: number;
  status: PdfAttendanceStatus;
  flags: PdfAttendanceFlag[];
}

/**
 * Per-employee, per-day analysis. Status branches by shift type:
 *
 *  REGULAR shifts (morning / evening / night)
 *    no records       → absent          (enters the official absence letter)
 *    only check_in    → check_in_only   ⚠ missing_checkout
 *    only check_out   → check_out_only  ⚠ missing_checkin
 *    both, <8 hours   → incomplete_hours ⚠ less_than_8h
 *    both, ≥8 hours   → present
 *    night with checkout < checkin numerically: treated as next-day (+24h)
 *
 *  ON CALL — punches are recorded and hours computed normally, but the
 *  employee is NEVER counted as absent and NEVER triggers the <8h alert.
 *  Missing one side of the punch IS still flagged for review.
 *    no records       → on_call_no_visit   (normal — not absence)
 *    only check_in    → on_call_check_in_only  ⚠ missing_checkout
 *    only check_out   → on_call_check_out_only ⚠ missing_checkin
 *    both             → on_call_present        (no <8h flag, ever)
 *
 *  ONLINE / UNSCHEDULED — flat status, no expectations on punches.
 *    Records (if any) are still surfaced as firstCheckIn/lastCheckOut/hours.
 *
 *  ALL branches: more than 2 records on the day → multiple_entries flag.
 */
export function analyzeDay(
  records: AnalyzerInputRecord[],
  shiftType: PdfShiftType,
): AnalysisResult {
  // 1. Compute the punch summary first — it's needed for every branch
  //    except absent / no_visit, and the work duplicates otherwise.
  const checkIns = records
    .filter((r) => r.punchType === 'check_in')
    .map((r) => r.recordTime)
    .sort();
  const checkOuts = records
    .filter((r) => r.punchType === 'check_out')
    .map((r) => r.recordTime)
    .sort();

  const firstCheckIn = checkIns[0] ?? null;
  const lastCheckOut = checkOuts[checkOuts.length - 1] ?? null;
  const totalHours =
    firstCheckIn && lastCheckOut
      ? round2(computeHours(firstCheckIn, lastCheckOut, shiftType))
      : null;

  const baseFlags: PdfAttendanceFlag[] = [];
  if (records.length > 2) baseFlags.push('multiple_entries');

  // 2. Branch on shift type.
  switch (shiftType) {
    case 'on_call':
      return determineOnCallStatus(records, firstCheckIn, lastCheckOut, totalHours, baseFlags);
    case 'online':
      return {
        firstCheckIn,
        lastCheckOut,
        totalHours,
        recordsCount: records.length,
        status: 'online',
        flags: baseFlags,
      };
    case 'unscheduled':
      return {
        firstCheckIn,
        lastCheckOut,
        totalHours,
        recordsCount: records.length,
        status: 'unscheduled',
        flags: baseFlags,
      };
    case 'morning':
    case 'evening':
    case 'night':
    case 'rotating':
    default:
      return determineRegularStatus(records, firstCheckIn, lastCheckOut, totalHours, baseFlags);
  }
}

function determineRegularStatus(
  records: AnalyzerInputRecord[],
  firstCheckIn: string | null,
  lastCheckOut: string | null,
  totalHours: number | null,
  baseFlags: PdfAttendanceFlag[],
): AnalysisResult {
  if (records.length === 0) {
    return {
      firstCheckIn: null,
      lastCheckOut: null,
      totalHours: null,
      recordsCount: 0,
      status: 'absent',
      flags: baseFlags,
    };
  }
  if (firstCheckIn && !lastCheckOut) {
    return {
      firstCheckIn,
      lastCheckOut: null,
      totalHours: null,
      recordsCount: records.length,
      status: 'check_in_only',
      flags: [...baseFlags, 'missing_checkout'],
    };
  }
  if (!firstCheckIn && lastCheckOut) {
    return {
      firstCheckIn: null,
      lastCheckOut,
      totalHours: null,
      recordsCount: records.length,
      status: 'check_out_only',
      flags: [...baseFlags, 'missing_checkin'],
    };
  }
  if (totalHours !== null && totalHours < MIN_REQUIRED_HOURS) {
    return {
      firstCheckIn,
      lastCheckOut,
      totalHours,
      recordsCount: records.length,
      status: 'incomplete_hours',
      flags: [...baseFlags, 'less_than_8h'],
    };
  }
  return {
    firstCheckIn,
    lastCheckOut,
    totalHours,
    recordsCount: records.length,
    status: 'present',
    flags: baseFlags,
  };
}

function determineOnCallStatus(
  records: AnalyzerInputRecord[],
  firstCheckIn: string | null,
  lastCheckOut: string | null,
  totalHours: number | null,
  baseFlags: PdfAttendanceFlag[],
): AnalysisResult {
  if (records.length === 0) {
    return {
      firstCheckIn: null,
      lastCheckOut: null,
      totalHours: null,
      recordsCount: 0,
      status: 'on_call_no_visit',
      flags: baseFlags,
    };
  }
  if (firstCheckIn && !lastCheckOut) {
    return {
      firstCheckIn,
      lastCheckOut: null,
      totalHours: null,
      recordsCount: records.length,
      status: 'on_call_check_in_only',
      flags: [...baseFlags, 'missing_checkout'],
    };
  }
  if (!firstCheckIn && lastCheckOut) {
    return {
      firstCheckIn: null,
      lastCheckOut,
      totalHours: null,
      recordsCount: records.length,
      status: 'on_call_check_out_only',
      flags: [...baseFlags, 'missing_checkin'],
    };
  }
  // Both punches present — record hours but NEVER add the <8h flag.
  return {
    firstCheckIn,
    lastCheckOut,
    totalHours,
    recordsCount: records.length,
    status: 'on_call_present',
    flags: baseFlags,
  };
}

/** Decimal-hour duration from "HH:mm" → "HH:mm". Wraps midnight when needed. */
function computeHours(checkIn: string, checkOut: string, shift: PdfShiftType): number {
  const inMin = toMinutes(checkIn);
  let outMin = toMinutes(checkOut);
  if (outMin < inMin) {
    // Crosses midnight — common for night shifts but also happens when the
    // biometric system records 00:xx as the closing punch.
    outMin += 24 * 60;
  }
  void shift; // accepted for documentation; midnight-wrap rule is uniform
  return (outMin - inMin) / 60;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
