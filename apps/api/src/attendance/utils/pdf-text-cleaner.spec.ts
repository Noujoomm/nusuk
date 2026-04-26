import { cleanPdfText, parsePunches, extractReportDate } from './pdf-text-cleaner';

describe('cleanPdfText', () => {
  it('returns [] for empty input', () => {
    expect(cleanPdfText('')).toEqual([]);
    expect(cleanPdfText(null as any)).toEqual([]);
  });

  it('NFKC-unshapes Arabic presentation forms and merges intra-word tabs', () => {
    // Real fragment from the source PDF
    const raw = 'اﻟﺠ\tﮭﺎ\tز \t0 \tاﻟﺨ\tﺮ\tو\tج \tﺗ\tﺴ\tﺠ\tﯿ\tﻞ \t17:28 \t2026-04-17 \tIT \tHussain Lal Muhammad \t1000';
    const [line] = cleanPdfText(raw);
    // Arabic letters within "الجهاز" are now contiguous (no internal whitespace)
    expect(line).toContain('17:28');
    expect(line).toContain('2026-04-17');
    expect(line).toContain('1000');
    expect(line).toContain('Hussain Lal Muhammad');
    // The presentation-forms have been unfolded — 'الج' with attached letters becomes a real word
    expect(line).toMatch(/الج[ھه]ا?ز/);
    expect(line).toMatch(/الخروج|خروج/);
    expect(line).toMatch(/تسج[يی]ل/);
  });
});

describe('extractReportDate', () => {
  it('parses "تاریخ البدایة DD-MM-YYYY" from the header lines', () => {
    const lines = [
      'السجلات',
      'تاریخ البدایة 17-04-2026 تاریخ النھایة 17-04-2026',
      'رقم الموظف ...',
    ];
    const d = extractReportDate(lines);
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(3); // April (0-indexed)
    expect(d!.getUTCDate()).toBe(17);
  });

  it('returns null when no date pattern is found', () => {
    expect(extractReportDate(['no date here', 'or here either'])).toBeNull();
  });
});

describe('parsePunches', () => {
  it('extracts an English-name record correctly', () => {
    const lines = ['الجهاز 0 الخروج تسجیل 17:28 2026-04-17 IT Hussain Lal Muhammad 1000'];
    const [p] = parsePunches(lines);
    expect(p.rawEmployeeNumber).toBe('1000');
    expect(p.recordTime).toBe('17:28');
    expect(p.recordDate.getUTCFullYear()).toBe(2026);
    expect(p.recordDate.getUTCDate()).toBe(17);
    expect(p.punchType).toBe('check_out');
    expect(p.dataSource).toBe('الجهاز');
    expect(p.workCode).toBe('0');
    // English name + dept
    expect(p.rawDepartment).toBe('IT');
    expect(p.rawName).toBe('Hussain Lal Muhammad');
  });

  it('extracts an Arabic-name record and reverses to logical reading order', () => {
    // Visual L→R from PDF: "التوزیع بخاري إبراھیم إیھاب" — but the actual
    // person is "إيهاب إبراهيم بخاري" working at "التوزيع". Department is the
    // first visual token; name tokens get reversed.
    const lines = ['الجهاز 0 الدخول تسجیل 08:27 2026-04-17 التوزیع بخاري إبراھیم إیھاب 11'];
    const [p] = parsePunches(lines);
    expect(p.rawEmployeeNumber).toBe('11');
    expect(p.recordTime).toBe('08:27');
    expect(p.punchType).toBe('check_in');
    expect(p.rawDepartment).toBe('التوزیع');
    expect(p.rawName).toBe('إیھاب إبراھیم بخاري');
  });

  it('fixes the "دمحم" → "محمد" artifact from PDF NFKC decomposition', () => {
    const lines = ['الجهاز 0 الدخول تسجیل 08:23 2026-04-17 التوزیع ملا حسن دمحم رامي 15'];
    const [p] = parsePunches(lines);
    // After reversal + artifact fix, the name should read "رامي محمد حسن ملا"
    expect(p.rawName).toBe('رامي محمد حسن ملا');
  });

  it('skips lines without time + date + punch keyword', () => {
    expect(parsePunches(['some random line', '17:28 alone'])).toEqual([]);
  });

  it('handles multiple records in one batch', () => {
    const lines = [
      'الجهاز 0 الخروج تسجیل 17:28 2026-04-17 IT Hussain Lal Muhammad 1000',
      'الجهاز 0 الدخول تسجیل 08:27 2026-04-17 IT Hussain Lal Muhammad 1000',
      'الجهاز 0 الخروج تسجیل 08:00 2026-04-17 التوزیع بخاري إبراھیم إیھاب 11',
    ];
    const records = parsePunches(lines);
    expect(records).toHaveLength(3);
    expect(records[0].punchType).toBe('check_out');
    expect(records[1].punchType).toBe('check_in');
    expect(records[2].rawEmployeeNumber).toBe('11');
  });
});
