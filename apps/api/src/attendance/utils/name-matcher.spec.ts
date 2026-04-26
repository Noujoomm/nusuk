import { matchEmployee, MatchCandidate } from './name-matcher';
import { normalizeArabic } from './arabic-normalizer';

const cand = (over: Partial<MatchCandidate> & { id: string; fullName: string }): MatchCandidate => ({
  normalizedName: normalizeArabic(over.fullName),
  employeeNumber: null,
  aliases: [],
  ...over,
});

describe('matchEmployee', () => {
  const candidates: MatchCandidate[] = [
    cand({ id: 'a', fullName: 'فراس سمير عبدالله ظفر' }),
    cand({ id: 'b', fullName: 'مؤيد فريد عبدالملك نهاري' }),
    cand({ id: 'c', fullName: 'م. حامد الصايغ' }),
    cand({ id: 'd', fullName: 'رامي محمد حسن ملا' }),
    cand({ id: 'e', fullName: 'إيهاب إبراهيم بخاري' }),
  ];

  it('returns null when both name and number are empty', () => {
    expect(matchEmployee('', null, candidates)).toBeNull();
  });

  it('matches by employee number when one is already linked', () => {
    const withNum: MatchCandidate[] = [...candidates, cand({ id: 'x', fullName: 'X', employeeNumber: '123' })];
    const r = matchEmployee('foo', '123', withNum);
    expect(r?.candidateId).toBe('x');
    expect(r?.method).toBe('employee_number');
    expect(r?.confidence).toBe(1);
  });

  it('matches exact name after Persian → Arabic normalization', () => {
    // PDF Persian glyphs: مؤید فرید عبدالملك نھاري ↔ Excel: مؤيد فريد عبدالملك نهاري
    const r = matchEmployee('مؤید فرید عبدالملك نھاري', null, candidates);
    expect(r?.candidateId).toBe('b');
    expect(r?.method).toBe('name_exact');
  });

  it('matches the م.حامد الصايغ ↔ م.حامد الصائغ pair', () => {
    const r = matchEmployee('م. حامد الصائغ', null, candidates);
    expect(r?.candidateId).toBe('c');
    expect(r?.method).toBe('name_exact');
  });

  it('falls back to token-overlap when middle names differ', () => {
    // Excel "فراس سمير عبدالله ظفر" (4 tokens) ↔ PDF "فراس سمیر ظفر" (3 tokens, missing عبدالله)
    const r = matchEmployee('فراس سمیر ظفر', null, candidates);
    expect(r?.candidateId).toBe('a');
    expect(['token_match', 'fuzzy_name']).toContain(r?.method);
    expect(r!.confidence).toBeGreaterThan(0.6);
  });

  it('returns null when no candidate is close enough', () => {
    expect(matchEmployee('شخص غير موجود تماماً', null, candidates)).toBeNull();
  });

  it('still matches even when PDF artifact "دمحم" was already fixed by parser', () => {
    // Parser already converted دمحم → محمد, so we just verify standard match
    const r = matchEmployee('رامي محمد حسن ملا', null, candidates);
    expect(r?.candidateId).toBe('d');
    expect(r?.method).toBe('name_exact');
  });
});
