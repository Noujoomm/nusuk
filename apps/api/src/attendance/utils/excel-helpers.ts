import type * as ExcelJS from 'exceljs';

/** Maps an Arabic shift label to our PdfShiftType enum string. */
export type ShiftTypeStr =
  | 'morning'
  | 'evening'
  | 'night'
  | 'on_call'
  | 'online'
  | 'unscheduled'
  | 'rotating';

const SHIFT_RULES: Array<{ keywords: string[]; type: ShiftTypeStr }> = [
  { keywords: ['صباحي/مسائي', 'بالتناوب', 'تناوب'], type: 'rotating' },
  { keywords: ['on call', 'on-call', 'oncall', 'اون كول'], type: 'on_call' },
  { keywords: ['اونلاين', 'أونلاين', 'online', 'عن بعد'], type: 'online' },
  { keywords: ['بدون وقت محدد', 'بدون وقت', 'غير محدد'], type: 'unscheduled' },
  { keywords: ['ليلي'], type: 'night' },
  { keywords: ['مسائي'], type: 'evening' },
  { keywords: ['صباحي'], type: 'morning' },
];

export function parseShiftType(value: string | null | undefined): ShiftTypeStr {
  if (!value) return 'morning';
  const lower = value.toLowerCase();
  for (const { keywords, type } of SHIFT_RULES) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return type;
  }
  return 'morning';
}

export function parseTruthy(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '✅' || v === '✓' || v === 'نعم' || v === 'yes' || v === 'true' || v === '1';
}

/**
 * Flatten an ExcelJS cell to a plain string. Cells may carry rich text or a
 * formula object — these need different unwrapping than scalar values.
 */
export function cellString(cell: ExcelJS.Cell | undefined): string {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const anyV = v as any;
    if (Array.isArray(anyV.richText)) return anyV.richText.map((r: any) => r.text).join('');
    if (anyV.result != null) return String(anyV.result);
    if (anyV.text) return String(anyV.text);
  }
  return String(v);
}

/**
 * Excel times come through as a Date in UTC at the 1899/1900 epoch. Strings
 * like "07:00", "6:00 ص" (AM), "6:00 م" (PM), "12:00ص" (midnight) all need
 * normalization to a 24h "HH:mm" form. Returns null for unparseable input.
 */
export function cellTime(cell: ExcelJS.Cell | undefined): string | null {
  const v = cell?.value;
  if (v == null) return null;
  if (v instanceof Date) {
    const hh = String(v.getUTCHours()).padStart(2, '0');
    const mm = String(v.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (typeof v === 'string') {
    return parseTimeString(v);
  }
  if (typeof v === 'number') {
    const totalMin = Math.round(v * 24 * 60) % (24 * 60);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return null;
}

/** Pure string-time parser, exposed separately for testing. */
export function parseTimeString(input: string): string | null {
  const s = input.trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hh = parseInt(match[1], 10);
  const mm = match[2];
  // The Arabic markers ص (sabah = AM) / م (masaa = PM) appear standalone or
  // glued to the digits ("12:00ص"). Either marker forces 12h-clock conversion.
  const hasSAM = /ص/.test(s);
  const hasPM = /م/.test(s);
  if (hasPM && !hasSAM) {
    if (hh < 12) hh += 12;
  } else if (hasSAM && !hasPM) {
    if (hh === 12) hh = 0;
  }
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

/**
 * "التوزيع - مكة المكرمة" → "مكة المكرمة" ; otherwise null.
 * Subsheet names like "التوزيع - المدينة المنورة" carry the location after a dash.
 */
export function deriveTrackDetail(sheetName: string | null | undefined): string | null {
  if (!sheetName) return null;
  const dashIdx = sheetName.indexOf('-');
  if (dashIdx === -1) return null;
  return sheetName.slice(dashIdx + 1).trim() || null;
}

export type CenterStr = 'makkah' | 'madinah' | 'shared';

/**
 * Derives the center (مكة / المدينة / مشترك) from a track string OR sheet
 * name. Looks for the city name; falls back to "shared" for everything else
 * (إدارة، استشاري، تدريب، قادة، خدمات مساندة، إلخ).
 */
export function deriveCenter(...sources: Array<string | null | undefined>): CenterStr {
  const haystack = sources.filter(Boolean).join(' ');
  if (/مكة|مكه/.test(haystack)) return 'makkah';
  if (/المدينة|المدينه/.test(haystack)) return 'madinah';
  return 'shared';
}

/**
 * Headers we look for. Matched by EXACT equality (after NFC + trim).
 *
 * Using `.includes()` was a sharp edge: the single-char "م" alias matched any
 * header containing the letter م (e.g. "الاسم"), so every row was skipped.
 */
export const HEADER_ALIASES = {
  serial: ['م', '#', 'م.'],
  name: ['الاسم', 'الاسم الكامل', 'اسم الموظف'],
  // "المسار " (trailing space) and "المسار الأصلي" both end up trimmed.
  track: ['المسار', 'المسار الأصلي'],
  phone: ['رقم الجوال', 'الجوال', 'رقم الهاتف'],
  checkIn: ['وقت الحضور'],
  // ⚠️ second one is the typo "الانصارف" actually present in the source file
  checkOut: ['وقت الانصراف', 'وقت الانصارف'],
  shift: ['فترة الدوام'],
  charter: ['العمل حسب الكراسة', 'العمل حسب الكراسه'],
} as const;

export type HeaderKey = keyof typeof HEADER_ALIASES;

export function mapHeaders(headerRow: ExcelJS.Row): Partial<Record<HeaderKey, number>> {
  const result: Partial<Record<HeaderKey, number>> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellString(cell);
    if (!raw) return;
    const cleaned = raw.normalize('NFC').trim();
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if ((aliases as readonly string[]).some((a) => a.normalize('NFC') === cleaned)) {
        result[canonical as HeaderKey] = colNumber;
        break;
      }
    }
  });
  return result;
}
