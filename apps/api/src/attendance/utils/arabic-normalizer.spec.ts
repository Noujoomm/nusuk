import { normalizeArabic, tokenizeName } from './arabic-normalizer';

describe('normalizeArabic', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeArabic(null)).toBe('');
    expect(normalizeArabic(undefined)).toBe('');
    expect(normalizeArabic('')).toBe('');
  });

  it('unifies Persian yeh (U+06CC) with Arabic yaa', () => {
    // 'علی' uses Persian yeh; 'علي' uses Arabic yaa
    expect(normalizeArabic('علی')).toBe(normalizeArabic('علي'));
    expect(normalizeArabic('سمیر')).toBe(normalizeArabic('سمير'));
  });

  it('unifies Persian heh doachashmee (U+06BE) with Arabic heh', () => {
    expect(normalizeArabic('نھاري')).toBe(normalizeArabic('نهاري'));
    expect(normalizeArabic('إیھاب')).toBe(normalizeArabic('إيهاب'));
  });

  it('unifies hamza variants on alef', () => {
    expect(normalizeArabic('أحمد')).toBe(normalizeArabic('احمد'));
    expect(normalizeArabic('إيهاب')).toBe(normalizeArabic('ايهاب'));
    expect(normalizeArabic('آدم')).toBe(normalizeArabic('ادم'));
  });

  it('strips diacritics (tashkeel)', () => {
    expect(normalizeArabic('مُحَمَّد')).toBe(normalizeArabic('محمد'));
  });

  it('removes "م." and "د." honorifics', () => {
    expect(normalizeArabic('م. حامد الصايغ')).toBe(normalizeArabic('حامد الصايغ'));
    expect(normalizeArabic('د. حسام فقيها')).toBe(normalizeArabic('حسام فقيها'));
  });

  it('does not strip "م" embedded inside a word', () => {
    // "محمد" must NOT lose its initial م
    expect(normalizeArabic('محمد')).toBe('محمد');
  });

  it('matches the real-world spec cases (after Persian → Arabic folding)', () => {
    // Excel: مؤيد فريد عبدالملك نهاري ↔ PDF: مؤید فرید عبدالملك نھاري
    // Same number of tokens, just Persian glyphs → must be identical
    expect(normalizeArabic('مؤید فرید عبدالملك نھاري'))
      .toBe(normalizeArabic('مؤيد فريد عبدالملك نهاري'));

    // Excel: م. حامد الصايغ ↔ PDF: م. حامد الصائغ
    // ئ → ي makes these identical after normalization
    expect(normalizeArabic('م. حامد الصايغ')).toBe(normalizeArabic('م. حامد الصائغ'));

    // Excel: فراس سمير عبدالله ظفر  vs  PDF: فراس سمیر ظفر
    // Different token counts (4 vs 3) — normalization alone WILL differ;
    // they only match via fuzzy/token-overlap. We assert that here so the
    // intent of the test is explicit and a future change won't silently
    // start treating them as equal.
    expect(normalizeArabic('فراس سمير عبدالله ظفر'))
      .not.toBe(normalizeArabic('فراس سمیر ظفر'));
    // …but the Persian → Arabic fold should make the shorter version pure-Arabic
    expect(normalizeArabic('فراس سمیر ظفر')).toBe('فراس سمير ظفر');
  });

  it('collapses whitespace and lowercases mixed-script', () => {
    expect(normalizeArabic('  HussainLal   Muhammad  ')).toBe('hussainlal muhammad');
  });
});

describe('tokenizeName', () => {
  it('splits a normalized name into ≥2-char tokens', () => {
    expect(tokenizeName('عبدالله محمد سعيد')).toEqual(['عبدالله', 'محمد', 'سعيد']);
  });

  it('drops the honorific so only real name tokens remain', () => {
    expect(tokenizeName('م. حامد الصايغ')).toEqual(['حامد', 'الصايغ']);
  });

  it('returns [] for empty input', () => {
    expect(tokenizeName(null)).toEqual([]);
    expect(tokenizeName('')).toEqual([]);
  });
});
