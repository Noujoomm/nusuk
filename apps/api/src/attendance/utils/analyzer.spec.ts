import { analyzeDay, AnalyzerInputRecord } from './analyzer';

const ci = (t: string): AnalyzerInputRecord => ({ recordTime: t, punchType: 'check_in' });
const co = (t: string): AnalyzerInputRecord => ({ recordTime: t, punchType: 'check_out' });

describe('analyzeDay — regular shifts', () => {
  describe('absent', () => {
    it('returns absent (and enters the official letter) when no records exist', () => {
      const r = analyzeDay([], 'morning');
      expect(r.status).toBe('absent');
      expect(r.totalHours).toBeNull();
      expect(r.firstCheckIn).toBeNull();
    });
  });

  describe('one-sided punches', () => {
    it('detects check_in_only', () => {
      const r = analyzeDay([ci('08:31')], 'morning');
      expect(r.status).toBe('check_in_only');
      expect(r.flags).toContain('missing_checkout');
      expect(r.firstCheckIn).toBe('08:31');
      expect(r.lastCheckOut).toBeNull();
    });

    it('detects check_out_only', () => {
      const r = analyzeDay([co('08:01')], 'morning');
      expect(r.status).toBe('check_out_only');
      expect(r.flags).toContain('missing_checkin');
      expect(r.lastCheckOut).toBe('08:01');
      expect(r.firstCheckIn).toBeNull();
    });
  });

  describe('present vs incomplete_hours (real spec cases)', () => {
    it('15 رامي - 08:23 → 15:59 = 7.6h → incomplete_hours', () => {
      const r = analyzeDay([ci('08:23'), co('15:59')], 'morning');
      expect(r.status).toBe('incomplete_hours');
      expect(r.flags).toContain('less_than_8h');
      expect(r.totalHours).toBeCloseTo(7.6, 1);
    });

    it('17 عبدالرحمن - 08:20 → 16:00 = 7.67h → incomplete_hours', () => {
      const r = analyzeDay([ci('08:20'), co('16:00')], 'morning');
      expect(r.status).toBe('incomplete_hours');
      expect(r.totalHours).toBeCloseTo(7.67, 2);
    });

    it('an 8-hour day → present with no flags', () => {
      const r = analyzeDay([ci('07:00'), co('15:00')], 'morning');
      expect(r.status).toBe('present');
      expect(r.totalHours).toBe(8);
      expect(r.flags).toEqual([]);
    });

    it('a 9-hour day → present', () => {
      const r = analyzeDay([ci('08:00'), co('17:00')], 'morning');
      expect(r.status).toBe('present');
      expect(r.totalHours).toBe(9);
    });
  });

  describe('night shift wrapping past midnight', () => {
    it('treats checkout < checkin as next-day', () => {
      const r = analyzeDay([ci('19:00'), co('07:00')], 'night');
      expect(r.status).toBe('present');
      expect(r.totalHours).toBe(12);
    });
  });

  describe('multiple punches', () => {
    it('flags multiple_entries when more than 2 records exist', () => {
      const r = analyzeDay([ci('09:02'), ci('09:03'), co('16:48')], 'morning');
      expect(r.flags).toContain('multiple_entries');
      expect(r.firstCheckIn).toBe('09:02');
      expect(r.lastCheckOut).toBe('16:48');
    });
  });
});

describe('analyzeDay — On Call', () => {
  describe('Test 1: د. حامد الصايغ — present with multiple entries, hours < 8 (no alert)', () => {
    // Spec: 12:55 in, 13:45 in (duplicate), 22:15 out
    const records = [ci('12:55'), ci('13:45'), co('22:15')];

    it('records hours and marks on_call_present', () => {
      const r = analyzeDay(records, 'on_call');
      expect(r.status).toBe('on_call_present');
      expect(r.firstCheckIn).toBe('12:55');
      expect(r.lastCheckOut).toBe('22:15');
      expect(r.totalHours).toBeCloseTo(9.33, 1);
    });

    it('flags multiple_entries but NEVER less_than_8h, even when hours < 8', () => {
      const short = analyzeDay([ci('12:55'), co('15:00')], 'on_call');
      expect(short.totalHours).toBeCloseTo(2.08, 2);
      expect(short.status).toBe('on_call_present');
      expect(short.flags).not.toContain('less_than_8h');
    });
  });

  describe('Test 2: م. محمد عباس — checkout only, no checkin', () => {
    it('marks on_call_check_out_only with missing_checkin flag', () => {
      const r = analyzeDay([co('10:05')], 'on_call');
      expect(r.status).toBe('on_call_check_out_only');
      expect(r.firstCheckIn).toBeNull();
      expect(r.lastCheckOut).toBe('10:05');
      expect(r.totalHours).toBeNull();
      expect(r.flags).toContain('missing_checkin');
    });
  });

  describe('Test 3: قائد On Call ما حضر (د. أحمد بخاري)', () => {
    it('marks on_call_no_visit (NOT absent) when no records exist', () => {
      const r = analyzeDay([], 'on_call');
      expect(r.status).toBe('on_call_no_visit');
      expect(r.status).not.toBe('absent');
      expect(r.flags).toEqual([]);
      expect(r.firstCheckIn).toBeNull();
    });
  });

  describe('Test 4: regression — regular employee absent stays absent', () => {
    it('a morning-shift employee with no records is still absent (so the letter catches them)', () => {
      const r = analyzeDay([], 'morning');
      expect(r.status).toBe('absent');
    });
  });

  describe('on_call check_in_only', () => {
    it('flags missing_checkout but does not penalize hours', () => {
      const r = analyzeDay([ci('09:00')], 'on_call');
      expect(r.status).toBe('on_call_check_in_only');
      expect(r.firstCheckIn).toBe('09:00');
      expect(r.flags).toContain('missing_checkout');
      expect(r.flags).not.toContain('less_than_8h');
    });
  });
});

describe('analyzeDay — online & unscheduled', () => {
  it('online employees get a flat online status, with hours when punches exist', () => {
    const r1 = analyzeDay([], 'online');
    expect(r1.status).toBe('online');
    const r2 = analyzeDay([ci('09:00'), co('17:00')], 'online');
    expect(r2.status).toBe('online');
    expect(r2.totalHours).toBe(8);
    expect(r2.flags).not.toContain('less_than_8h');
  });

  it('unscheduled employees get a flat unscheduled status', () => {
    const r = analyzeDay([], 'unscheduled');
    expect(r.status).toBe('unscheduled');
    expect(r.flags).toEqual([]);
  });
});
