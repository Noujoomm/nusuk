import {
  buildLetter,
  formatAbsenceLine,
  formatArabicDate,
  areDatesContinuous,
  deriveShortName,
  AbsenceEntry,
  DEFAULT_RECIPIENT,
} from './letter-formatter';

const utc = (yyyymmdd: string) => new Date(`${yyyymmdd}T00:00:00.000Z`);

describe('formatArabicDate', () => {
  it('returns "DD MONTH YYYY" with year', () => {
    expect(formatArabicDate(utc('2026-04-24'), true)).toBe('24 أبريل 2026');
    expect(formatArabicDate(utc('2026-01-09'), true)).toBe('9 يناير 2026');
    expect(formatArabicDate(utc('2026-12-31'), true)).toBe('31 ديسمبر 2026');
  });

  it('drops the year when withYear=false', () => {
    expect(formatArabicDate(utc('2026-04-24'), false)).toBe('24 أبريل');
    expect(formatArabicDate(utc('2026-09-15'), false)).toBe('15 سبتمبر');
  });
});

describe('areDatesContinuous', () => {
  it('returns true for consecutive days', () => {
    expect(areDatesContinuous([utc('2026-04-09'), utc('2026-04-10'), utc('2026-04-11')])).toBe(true);
  });

  it('returns false when there is a gap', () => {
    expect(areDatesContinuous([utc('2026-04-09'), utc('2026-04-11')])).toBe(false);
    expect(areDatesContinuous([utc('2026-04-09'), utc('2026-04-15'), utc('2026-04-22')])).toBe(false);
  });

  it('handles single-element and empty arrays', () => {
    expect(areDatesContinuous([utc('2026-04-09')])).toBe(true);
    expect(areDatesContinuous([])).toBe(true);
  });

  it('correctly spans month boundaries', () => {
    expect(areDatesContinuous([utc('2026-04-30'), utc('2026-05-01')])).toBe(true);
  });
});

describe('deriveShortName', () => {
  it('shortens 3+ token names to first + last', () => {
    expect(deriveShortName('فراس زهير فقيها')).toBe('فراس فقيها');
    expect(deriveShortName('عبدالرحمن عبدالله المالكي')).toBe('عبدالرحمن المالكي');
  });

  it('strips honorifics before shortening', () => {
    expect(deriveShortName('م. حامد الصايغ')).toBe('حامد الصايغ');
    expect(deriveShortName('د. حسام فقيها')).toBe('حسام فقيها');
    expect(deriveShortName('الدكتور أحمد بخاري')).toBe('أحمد بخاري');
  });

  it('keeps 2-token names as-is', () => {
    expect(deriveShortName('محمد المالكي')).toBe('محمد المالكي');
  });
});

describe('formatAbsenceLine', () => {
  const base = { employeeId: 'x', fullName: 'فراس فقيها', track: 'التوزيع' };

  it('Test 2: single-day absence → "بتاريخ DD MONTH YYYY"', () => {
    const a: AbsenceEntry = { ...base, absenceDates: [utc('2026-04-24')] };
    expect(formatAbsenceLine(a)).toBe('فراس فقيها، بتاريخ 24 أبريل 2026.');
  });

  it('Test 1: continuous range → "وذلك خلال الفترة من DD MONTH وحتى DD MONTH"', () => {
    // 9 → 23 April, 15 consecutive days
    const dates = Array.from({ length: 15 }, (_, i) =>
      utc(`2026-04-${String(9 + i).padStart(2, '0')}`),
    );
    const a: AbsenceEntry = { ...base, absenceDates: dates };
    expect(formatAbsenceLine(a)).toBe(
      'فراس فقيها، وذلك خلال الفترة من 9 أبريل وحتى 23 أبريل.',
    );
  });

  it('Test 3: 3 scattered dates → "بتواريخ: A، B، وC"', () => {
    const a: AbsenceEntry = {
      ...base,
      absenceDates: [utc('2026-04-09'), utc('2026-04-15'), utc('2026-04-22')],
    };
    expect(formatAbsenceLine(a)).toBe(
      'فراس فقيها، بتواريخ: 9 أبريل، 15 أبريل، و22 أبريل.',
    );
  });

  it('2 scattered dates → "بتاريخَي A وB"', () => {
    const a: AbsenceEntry = {
      ...base,
      absenceDates: [utc('2026-04-09'), utc('2026-04-15')],
    };
    expect(formatAbsenceLine(a)).toBe('فراس فقيها، بتاريخَي 9 أبريل و15 أبريل.');
  });

  it('uses shortName when provided', () => {
    const a: AbsenceEntry = {
      ...base,
      fullName: 'فراس زهير فقيها',
      shortName: 'فراس فقيها',
      absenceDates: [utc('2026-04-24')],
    };
    expect(formatAbsenceLine(a)).toBe('فراس فقيها، بتاريخ 24 أبريل 2026.');
  });

  it('sorts dates before formatting', () => {
    const a: AbsenceEntry = {
      ...base,
      absenceDates: [utc('2026-04-22'), utc('2026-04-09'), utc('2026-04-15')],
    };
    expect(formatAbsenceLine(a)).toBe(
      'فراس فقيها، بتواريخ: 9 أبريل، 15 أبريل، و22 أبريل.',
    );
  });
});

describe('buildLetter', () => {
  it('Test 4: multiple employees on the same day', () => {
    const letter = buildLetter({
      recipientName: DEFAULT_RECIPIENT,
      reportType: 'daily',
      reportDate: utc('2026-04-17'),
      absences: [
        { employeeId: 'a', fullName: 'فراس فقيها', track: 'التوزيع', absenceDates: [utc('2026-04-17')] },
        { employeeId: 'b', fullName: 'محمد المالكي', track: 'التوزيع', absenceDates: [utc('2026-04-17')] },
      ],
    });
    expect(letter.text).toContain('فراس فقيها، بتاريخ 17 أبريل 2026.');
    expect(letter.text).toContain('محمد المالكي، بتاريخ 17 أبريل 2026.');
    expect(letter.metadata.uniqueEmployees).toBe(2);
    expect(letter.metadata.totalAbsences).toBe(2);
  });

  it('Test 5: no absences for a single day', () => {
    const letter = buildLetter({
      recipientName: DEFAULT_RECIPIENT,
      reportType: 'daily',
      reportDate: utc('2026-04-17'),
      absences: [],
    });
    expect(letter.text).toContain(
      'نفيد سعادتكم بأنه تم مراجعة كشف الحضور والانصراف لجميع المسارات، ولم يتم تسجيل أي حالات غياب بتاريخ 17 أبريل 2026.',
    );
    expect(letter.text).not.toContain('على النحو التالي');
    expect(letter.metadata.totalAbsences).toBe(0);
  });

  it('Test 6: no absences for a range', () => {
    const letter = buildLetter({
      recipientName: DEFAULT_RECIPIENT,
      reportType: 'range',
      rangeStart: utc('2026-04-15'),
      rangeEnd: utc('2026-04-20'),
      absences: [],
    });
    expect(letter.text).toContain(
      'نفيد سعادتكم بأنه تم مراجعة كشف الحضور والانصراف لجميع المسارات، ولم يتم تسجيل أي حالات غياب خلال الفترة من 15 أبريل وحتى 20 أبريل 2026.',
    );
  });

  it('Test 1 (full): range report with continuous absence + last-day note', () => {
    // 9-23 April: absent every day. Range is 9-24, last day (24) had no absence.
    const dates = Array.from({ length: 15 }, (_, i) =>
      utc(`2026-04-${String(9 + i).padStart(2, '0')}`),
    );
    const letter = buildLetter({
      recipientName: DEFAULT_RECIPIENT,
      reportType: 'range',
      rangeStart: utc('2026-04-09'),
      rangeEnd: utc('2026-04-24'),
      noteAboutLastDay: true,
      absences: [
        {
          employeeId: 'x',
          fullName: 'فراس زهير فقيها',
          shortName: 'فراس فقيها',
          track: 'التوزيع',
          absenceDates: dates,
        },
      ],
    });
    // The absence line uses the actual last absence (23 April), not the range end (24).
    // The "no absence on last day" note says 24 April. Together this matches the
    // user's intent — and is internally consistent (the spec's expected text had
    // "حتى 24 أبريل" in the range line which contradicts "absent through 23").
    expect(letter.text).toContain(
      'فراس فقيها، وذلك خلال الفترة من 9 أبريل وحتى 23 أبريل.',
    );
    expect(letter.text).toContain(
      'كما نود الإشارة إلى أنه لا توجد أي حالات غياب بتاريخ 24 أبريل.',
    );
    expect(letter.text).toContain('سعادة الدكتور/ حسام فقيها،');
    expect(letter.text.endsWith('وتفضلوا بقبول فائق التحية والتقدير.')).toBe(true);
  });

  it('omits the last-day note when noteAboutLastDay is false', () => {
    const letter = buildLetter({
      recipientName: DEFAULT_RECIPIENT,
      reportType: 'range',
      rangeStart: utc('2026-04-09'),
      rangeEnd: utc('2026-04-24'),
      noteAboutLastDay: false,
      absences: [
        { employeeId: 'x', fullName: 'فراس فقيها', track: 'التوزيع', absenceDates: [utc('2026-04-15')] },
      ],
    });
    expect(letter.text).not.toContain('لا توجد أي حالات غياب بتاريخ');
  });

  it('html output is escaped and uses <p> tags', () => {
    const letter = buildLetter({
      recipientName: 'X<script>',
      reportType: 'daily',
      reportDate: utc('2026-04-17'),
      absences: [],
    });
    expect(letter.html).toContain('&lt;script&gt;');
    expect(letter.html).toContain('<p>');
    expect(letter.html).not.toContain('<script>');
  });
});
