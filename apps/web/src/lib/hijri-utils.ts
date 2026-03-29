/**
 * Bi-directional Hijri ↔ Gregorian date conversion utilities.
 * Uses hijri-converter (Umm al-Qura algorithm).
 */
import { toHijri, toGregorian } from 'hijri-converter';

/**
 * Convert Gregorian date string (YYYY-MM-DD) to Hijri string (YYYY/MM/DD).
 * Returns empty string if input is invalid.
 */
export function gregorianToHijri(gregorian: string): string {
  try {
    if (!gregorian) return '';
    const [y, m, d] = gregorian.split('-').map(Number);
    if (!y || !m || !d) return '';
    const h = toHijri(y, m, d);
    return `${h.hy}/${String(h.hm).padStart(2, '0')}/${String(h.hd).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/**
 * Convert Hijri date string (YYYY/MM/DD) to Gregorian string (YYYY-MM-DD).
 * Returns empty string if input is invalid.
 */
export function hijriToGregorian(hijri: string): string {
  try {
    if (!hijri) return '';
    const parts = hijri.replace(/-/g, '/').split('/').map(Number);
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return '';
    const [hy, hm, hd] = parts;
    const g = toGregorian(hy, hm, hd);
    return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  } catch {
    return '';
  }
}
