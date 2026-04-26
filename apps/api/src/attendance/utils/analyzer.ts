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
 * Per-employee, per-day analysis.
 *
 * Cases:
 *  - EXEMPT shifts (on_call, online, unscheduled): skipped from the 8h check.
 *  - No records → ABSENT.
 *  - Only check_in → CHECK_IN_ONLY (+ MISSING_CHECKOUT flag).
 *  - Only check_out → CHECK_OUT_ONLY (+ MISSING_CHECKIN flag).
 *  - Both: take first check_in + last check_out, compute hours.
 *    For NIGHT shifts, if checkout < checkin numerically, it's the next morning
 *    so we add 24h to the checkout side.
 *  - hours < 8 → INCOMPLETE_HOURS (+ LESS_THAN_8H flag).
 *  - hours ≥ 8 → PRESENT.
 *  - More than 2 punches in the day → MULTIPLE_ENTRIES flag (status unaffected).
 */
export function analyzeDay(
  records: AnalyzerInputRecord[],
  shiftType: PdfShiftType,
): AnalysisResult {
  const flags: PdfAttendanceFlag[] = [];

  if (shiftType === 'on_call' || shiftType === 'online' || shiftType === 'unscheduled') {
    return {
      firstCheckIn: null,
      lastCheckOut: null,
      totalHours: null,
      recordsCount: records.length,
      status: 'exempt',
      flags,
    };
  }

  if (records.length === 0) {
    return {
      firstCheckIn: null,
      lastCheckOut: null,
      totalHours: null,
      recordsCount: 0,
      status: 'absent',
      flags,
    };
  }

  const checkIns = records
    .filter((r) => r.punchType === 'check_in')
    .map((r) => r.recordTime)
    .sort();
  const checkOuts = records
    .filter((r) => r.punchType === 'check_out')
    .map((r) => r.recordTime)
    .sort();

  if (records.length > 2) flags.push('multiple_entries');

  if (checkIns.length > 0 && checkOuts.length === 0) {
    flags.push('missing_checkout');
    return {
      firstCheckIn: checkIns[0],
      lastCheckOut: null,
      totalHours: null,
      recordsCount: records.length,
      status: 'check_in_only',
      flags,
    };
  }

  if (checkOuts.length > 0 && checkIns.length === 0) {
    flags.push('missing_checkin');
    return {
      firstCheckIn: null,
      lastCheckOut: checkOuts[checkOuts.length - 1],
      totalHours: null,
      recordsCount: records.length,
      status: 'check_out_only',
      flags,
    };
  }

  const firstIn = checkIns[0];
  const lastOut = checkOuts[checkOuts.length - 1];
  const hours = computeHours(firstIn, lastOut, shiftType);

  if (hours < MIN_REQUIRED_HOURS) {
    flags.push('less_than_8h');
    return {
      firstCheckIn: firstIn,
      lastCheckOut: lastOut,
      totalHours: round2(hours),
      recordsCount: records.length,
      status: 'incomplete_hours',
      flags,
    };
  }

  return {
    firstCheckIn: firstIn,
    lastCheckOut: lastOut,
    totalHours: round2(hours),
    recordsCount: records.length,
    status: 'present',
    flags,
  };
}

/** Compute decimal-hour duration from "HH:mm" → "HH:mm". */
function computeHours(checkIn: string, checkOut: string, shift: PdfShiftType): number {
  const inMin = toMinutes(checkIn);
  let outMin = toMinutes(checkOut);
  if (outMin < inMin) {
    // Crosses midnight. Always treat as next-day for night shift; for other
    // shifts this can also happen if the biometric system records 00:xx as
    // the closing punch — same fix applies.
    outMin += 24 * 60;
  }
  // Suppress unused-warning in strict modes — the param documents intent.
  void shift;
  return (outMin - inMin) / 60;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
