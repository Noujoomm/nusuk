import {
  parseShiftType,
  parseTruthy,
  parseTimeString,
  deriveTrackDetail,
  HEADER_ALIASES,
} from './excel-helpers';

describe('parseShiftType', () => {
  it('maps Arabic shift names to enum strings', () => {
    expect(parseShiftType('صباحي')).toBe('morning');
    expect(parseShiftType('مسائي')).toBe('evening');
    expect(parseShiftType('ليلي')).toBe('night');
    expect(parseShiftType('On Call')).toBe('on_call');
    expect(parseShiftType('بدون وقت محدد')).toBe('unscheduled');
    expect(parseShiftType('أونلاين')).toBe('online');
    expect(parseShiftType('صباحي/مسائي بالتناوب')).toBe('rotating');
  });

  it('defaults to morning for empty / unknown input', () => {
    expect(parseShiftType('')).toBe('morning');
    expect(parseShiftType(null)).toBe('morning');
    expect(parseShiftType('???')).toBe('morning');
  });
});

describe('parseTruthy', () => {
  it('treats checkmark / "نعم" / yes / true / 1 as true', () => {
    expect(parseTruthy('✅')).toBe(true);
    expect(parseTruthy('✓')).toBe(true);
    expect(parseTruthy('نعم')).toBe(true);
    expect(parseTruthy('yes')).toBe(true);
    expect(parseTruthy('true')).toBe(true);
    expect(parseTruthy('1')).toBe(true);
  });

  it('treats everything else as false', () => {
    expect(parseTruthy('')).toBe(false);
    expect(parseTruthy(null)).toBe(false);
    expect(parseTruthy('لا')).toBe(false);
    expect(parseTruthy('0')).toBe(false);
    expect(parseTruthy('no')).toBe(false);
  });
});

describe('parseTimeString', () => {
  it('returns null when no time is present', () => {
    expect(parseTimeString('')).toBeNull();
    expect(parseTimeString('لا يوجد')).toBeNull();
  });

  it('parses 24h strings as-is', () => {
    expect(parseTimeString('07:00')).toBe('07:00');
    expect(parseTimeString('19:30')).toBe('19:30');
    expect(parseTimeString('00:00')).toBe('00:00');
  });

  it('treats Arabic ص as AM (12:00 ص → 00:00, midnight)', () => {
    expect(parseTimeString('6:00 ص')).toBe('06:00');
    expect(parseTimeString('07:00 ص')).toBe('07:00');
    expect(parseTimeString('12:00ص')).toBe('00:00');
  });

  it('treats Arabic م as PM (12:00 م → 12:00, noon)', () => {
    expect(parseTimeString('6:00 م')).toBe('18:00');
    expect(parseTimeString('07:00 م')).toBe('19:00');
    expect(parseTimeString('12:00 م')).toBe('12:00');
  });
});

describe('deriveTrackDetail', () => {
  it('extracts the after-dash portion of subsheet names', () => {
    expect(deriveTrackDetail('التوزيع - مكة المكرمة')).toBe('مكة المكرمة');
    expect(deriveTrackDetail('التوزيع - المدينة المنورة')).toBe('المدينة المنورة');
  });

  it('returns null when there is no dash', () => {
    expect(deriveTrackDetail('الاستشاري')).toBeNull();
    expect(deriveTrackDetail('')).toBeNull();
    expect(deriveTrackDetail(null)).toBeNull();
  });
});

describe('HEADER_ALIASES', () => {
  it('keeps both spellings of the check-out header (the source uses الانصارف typo)', () => {
    expect(HEADER_ALIASES.checkOut).toContain('وقت الانصراف');
    expect(HEADER_ALIASES.checkOut).toContain('وقت الانصارف');
  });

  it('uses standalone "م" alias for the serial column (regression: must not match الاسم)', () => {
    // Documents the bug we fixed: header-matching is now exact, so "الاسم" no
    // longer collides with serial's "م" alias.
    expect(HEADER_ALIASES.serial).toContain('م');
    expect(HEADER_ALIASES.name).toContain('الاسم');
    expect(HEADER_ALIASES.name).not.toContain('م');
  });
});
