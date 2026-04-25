/**
 * Normalizes Arabic text for cross-source matching.
 *
 * The biometric PDF uses Persian glyphs where HR Excel uses Arabic ones.
 * Without normalization the same name fails string equality. Also strips
 * diacritics, unifies alef/hamza variants, removes honorifics, and collapses
 * whitespace.
 */
export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // Tashkeel (must come before letter folding so combining marks are gone)
    .replace(/[ً-ٰٟ]/g, '')
    // Alef wasla
    .replace(/ٱ/g, 'ا')
    // Yaa: Arabic ي (U+064A), alef maksura ى (U+0649), Persian ی (U+06CC), Urdu ے (U+06D2)
    .replace(/[يىیے]/g, 'ي')
    // Alef + hamza variants → bare alef
    .replace(/[أإآ]/g, 'ا')
    // Taa marbuta → haa
    .replace(/ة/g, 'ه')
    // Hamza on waw → waw
    .replace(/ؤ/g, 'و')
    // Hamza on yaa → yaa
    .replace(/ئ/g, 'ي')
    // Persian / Urdu heh variants → Arabic ه (U+0647)
    //   ھ U+06BE (heh doachashmee), ہ U+06C1, ۂ U+06C2, ە U+06D5, ۀ U+06C0
    .replace(/[ھۀہۂە]/g, 'ه')
    // Persian kaf ک (U+06A9) → Arabic ك (U+0643)
    .replace(/ک/g, 'ك')
    // Single-letter honorifics with dot — strip BEFORE the dot becomes a space
    .replace(/(^|\s)[مدأا]\.\s*/g, '$1')
    // Punctuation → space
    .replace(/[.،,]/g, ' ')
    // Full-word honorifics
    .replace(/(^|\s)(دكتور|دكتوره|مهندس|مهندسه|أستاذ|استاذ|أستاذه|استاذه|الأستاذ|الاستاذ)(\s|$)/g, '$1$3')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Splits a normalized name into ≥2-char tokens for token-overlap matching.
 */
export function tokenizeName(text: string | null | undefined): string[] {
  const normalized = normalizeArabic(text);
  if (!normalized) return [];
  return normalized.split(' ').filter((tok) => tok.length >= 2);
}
