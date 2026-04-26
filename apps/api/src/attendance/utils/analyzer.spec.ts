import { analyzeDay, AnalyzerInputRecord } from './analyzer';

const ci = (t: string): AnalyzerInputRecord => ({ recordTime: t, punchType: 'check_in' });
const co = (t: string): AnalyzerInputRecord => ({ recordTime: t, punchType: 'check_out' });

describe('analyzeDay', () => {
  describe('exempt shifts', () => {
    it('marks on_call employees as exempt regardless of records', () => {
      const r = analyzeDay([ci('08:00')], 'on_call');
      expect(r.status).toBe('exempt');
      expect(r.flags).toEqual([]);
    });

    it('marks online and unscheduled the same way', () => {
      expect(analyzeDay([], 'online').status).toBe('exempt');
      expect(analyzeDay([], 'unscheduled').status).toBe('exempt');
    });
  });

  describe('absent', () => {
    it('returns absent when no records exist', () => {
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

    it('an 8-hour day → present', () => {
      const r = analyzeDay([ci('07:00'), co('15:00')], 'morning');
      expect(r.status).toBe('present');
      expect(r.totalHours).toBe(8);
      expect(r.flags).toEqual([]);
    });

    it('a 9-hour day → present, no flags', () => {
      const r = analyzeDay([ci('08:00'), co('17:00')], 'morning');
      expect(r.status).toBe('present');
      expect(r.totalHours).toBe(9);
    });
  });

  describe('night shift wrapping past midnight', () => {
    it('treats checkout < checkin as next-day for night shift', () => {
      // محمد فوزي كرني: 12am → 8am = 8h (night shift starting before midnight)
      const r = analyzeDay([ci('19:00'), co('07:00')], 'night');
      expect(r.status).toBe('present');
      expect(r.totalHours).toBe(12);
    });
  });

  describe('multiple punches', () => {
    it('flags multiple_entries when more than 2 records exist', () => {
      const r = analyzeDay([ci('09:02'), ci('09:03'), co('16:48')], 'morning');
      expect(r.flags).toContain('multiple_entries');
      // Uses first check_in + last check_out
      expect(r.firstCheckIn).toBe('09:02');
      expect(r.lastCheckOut).toBe('16:48');
    });
  });
});
