/**
 * Pure formatter for the official Arabic absence letter.
 *
 * NO Prisma, NO DI — every function here is deterministic and unit-tested
 * against the spec's six canonical cases. The DB-touching wrapper lives in
 * services/letter-generator.service.ts.
 */

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export const DEFAULT_RECIPIENT = 'الدكتور/ حسام فقيها';

export interface AbsenceEntry {
  employeeId: string;
  fullName: string;
  shortName?: string;
  track: string;
  absenceDates: Date[];
}

export interface LetterContext {
  recipientName: string;
  reportType: 'daily' | 'range';
  reportDate?: Date;
  rangeStart?: Date;
  rangeEnd?: Date;
  absences: AbsenceEntry[];
  noteAboutLastDay?: boolean;
}

export interface GeneratedLetter {
  text: string;
  html: string;
  metadata: {
    generatedAt: string; // ISO
    totalAbsences: number;
    uniqueEmployees: number;
    period: string;
  };
}

// ─── Public API ────────────────────────────────────────────────────────

export function buildLetter(ctx: LetterContext): GeneratedLetter {
  const lines: string[] = [];

  lines.push('السلام عليكم ورحمة الله وبركاته،');
  lines.push('');
  lines.push(`سعادة ${ctx.recipientName}،`);
  lines.push('تحية طيبة وبعد،');
  lines.push('');

  if (ctx.absences.length === 0) {
    lines.push(
      `نفيد سعادتكم بأنه تم مراجعة كشف الحضور والانصراف لجميع المسارات، ولم يتم تسجيل أي حالات غياب${formatPeriodPhrase(ctx)}.`,
    );
  } else {
    lines.push(
      'نفيد سعادتكم بأنه تم مراجعة كشف الحضور والانصراف لجميع المسارات، حيث تم تسجيل غياب على النحو التالي:',
    );
    lines.push('');
    for (const a of ctx.absences) {
      lines.push(formatAbsenceLine(a));
    }
    if (ctx.reportType === 'range' && ctx.noteAboutLastDay && ctx.rangeEnd) {
      lines.push('');
      lines.push(
        `كما نود الإشارة إلى أنه لا توجد أي حالات غياب بتاريخ ${formatArabicDate(ctx.rangeEnd, false)}.`,
      );
    }
  }

  lines.push('');
  lines.push('وتفضلوا بقبول فائق التحية والتقدير.');

  const text = lines.join('\n');
  // Render: blank line → spacer, otherwise <p>. Wrapped in a div for safe injection.
  const html = lines
    .map((l) => (l === '' ? '<p class="h-3"></p>' : `<p>${escapeHtml(l)}</p>`))
    .join('');

  return {
    text,
    html,
    metadata: {
      generatedAt: new Date().toISOString(),
      totalAbsences: ctx.absences.reduce((s, a) => s + a.absenceDates.length, 0),
      uniqueEmployees: ctx.absences.length,
      period: describePeriod(ctx),
    },
  };
}

// ─── Pure helpers (exported for testing) ───────────────────────────────

/**
 * Renders one employee's absence line. Auto-picks the form:
 *  - 1 date     → "{name} ({track})، بتاريخ {DD MONTH YYYY}."
 *  - continuous → "{name} ({track})، وذلك خلال الفترة من {DD MONTH} وحتى {DD MONTH}."
 *  - 2 separate → "{name} ({track})، بتاريخَي {DD MONTH} و{DD MONTH}."
 *  - 3+ separate→ "{name} ({track})، بتواريخ: {…}، {…}، و{…}."
 *
 * The track in parentheses is appended only when present; missing track keeps
 * the line clean ("{name}، بتاريخ …").
 */
export function formatAbsenceLine(absence: AbsenceEntry): string {
  const baseName = absence.shortName || absence.fullName;
  const name = absence.track ? `${baseName} (${absence.track})` : baseName;
  const sorted = [...absence.absenceDates].sort((a, b) => a.getTime() - b.getTime());

  if (sorted.length === 1) {
    return `${name}، بتاريخ ${formatArabicDate(sorted[0], true)}.`;
  }
  if (areDatesContinuous(sorted)) {
    const start = formatArabicDate(sorted[0], false);
    const end = formatArabicDate(sorted[sorted.length - 1], false);
    return `${name}، وذلك خلال الفترة من ${start} وحتى ${end}.`;
  }
  const formatted = sorted.map((d) => formatArabicDate(d, false));
  if (formatted.length === 2) {
    return `${name}، بتاريخَي ${formatted[0]} و${formatted[1]}.`;
  }
  const last = formatted.pop()!;
  return `${name}، بتواريخ: ${formatted.join('، ')}، و${last}.`;
}

/**
 * Format a Date as Arabic. Uses UTC getters because our `reportDate` columns
 * are `@db.Date` (date-only) — Prisma returns them as UTC-midnight Date
 * objects, and using local getters would shift them by the server's timezone
 * offset (Riyadh is +3, so 2026-04-24 UTC could become April 23 in some TZs).
 */
export function formatArabicDate(date: Date, withYear: boolean): string {
  const day = date.getUTCDate();
  const month = ARABIC_MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return withYear ? `${day} ${month} ${year}` : `${day} ${month}`;
}

/** Are the dates exactly one calendar day apart, in order? */
export function areDatesContinuous(dates: Date[]): boolean {
  if (dates.length < 2) return true;
  const ONE_DAY = 24 * 60 * 60 * 1000;
  for (let i = 1; i < dates.length; i++) {
    const diff = dates[i].getTime() - dates[i - 1].getTime();
    // Round to nearest day in case of DST or stored-time noise.
    if (Math.round(diff / ONE_DAY) !== 1) return false;
  }
  return true;
}

/**
 * "فراس زهير فقيها" → "فراس فقيها"
 * "م. حامد الصايغ"   → "حامد الصايغ"
 * "محمد المالكي"     → "محمد المالكي"  (already 2 tokens, kept)
 * Strips honorifics first, then takes first + last token.
 */
export function deriveShortName(fullName: string): string {
  const stripped = fullName
    .replace(/^(م\.|د\.|أ\.|أ\.د\.|الدكتور|المهندس|الأستاذ|الدكتوره|المهندسه|الأستاذه)\s*/g, '')
    .trim();
  const parts = stripped.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

// ─── Internal helpers ──────────────────────────────────────────────────

function formatPeriodPhrase(ctx: LetterContext): string {
  if (ctx.reportType === 'daily' && ctx.reportDate) {
    return ` بتاريخ ${formatArabicDate(ctx.reportDate, true)}`;
  }
  if (ctx.reportType === 'range' && ctx.rangeStart && ctx.rangeEnd) {
    return ` خلال الفترة من ${formatArabicDate(ctx.rangeStart, false)} وحتى ${formatArabicDate(ctx.rangeEnd, true)}`;
  }
  return '';
}

function describePeriod(ctx: LetterContext): string {
  if (ctx.reportType === 'daily' && ctx.reportDate) {
    return formatArabicDate(ctx.reportDate, true);
  }
  if (ctx.rangeStart && ctx.rangeEnd) {
    return `${formatArabicDate(ctx.rangeStart, false)} - ${formatArabicDate(ctx.rangeEnd, true)}`;
  }
  return '';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
