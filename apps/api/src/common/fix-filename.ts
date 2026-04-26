/**
 * Fix multer's latin1/cp1252 decoding of UTF-8 filenames.
 *
 * Multer (busboy) decodes multipart filenames as latin1 by default. Arabic
 * filenames become mojibake. Some browsers (Chrome on macOS for instance)
 * actually go through CP1252 — bytes in 0x80-0x9F get mapped to their
 * Windows-1252 Unicode equivalents (e.g. 0x84 → U+201E "„") instead of the
 * latin1 control-char codepoints. A pure latin1→utf8 decode misses those.
 *
 * Detection: if the original has NO Arabic chars but a latin1/cp1252→utf8
 * decoded version DOES, then it's mojibake and we fix it.
 */

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

// CP1252-specific code points (the chars at 0x80-0x9F that differ from
// pure latin1 / Unicode C1 controls). Reverse map: Unicode → byte.
const CP1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/**
 * Tries to recover the original UTF-8 string from a string that came from
 * decoding UTF-8 bytes as latin1 *or* CP1252. Returns null if the result
 * contains no Arabic (i.e. probably wasn't mojibake to begin with).
 */
function tryDecodeMojibake(str: string): string | null {
  const bytes: number[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) {
      bytes.push(cp);
    } else if (CP1252_REVERSE[cp] != null) {
      bytes.push(CP1252_REVERSE[cp]);
    } else {
      // Char outside both latin1 and CP1252 — can't be mojibake.
      return null;
    }
  }
  try {
    const decoded = Buffer.from(bytes).toString('utf8');
    return ARABIC_RE.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Multer-upload variant — mutates the file in place. Must run BEFORE
 * file.originalname is used anywhere downstream.
 */
export function fixMulterFilename(file: Express.Multer.File): void {
  if (!file?.originalname) return;

  if (!ARABIC_RE.test(file.originalname)) {
    const recovered = tryDecodeMojibake(file.originalname);
    if (recovered) file.originalname = recovered;
  }

  // Sanitize dangerous filesystem characters but keep Arabic, spaces, hyphens, dots, parens.
  file.originalname = file.originalname.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}

/**
 * Pure-string variant for legacy rows already stored in the database.
 * Same heuristic as fixMulterFilename, but returns a new string instead of
 * mutating a multer File. Safe no-op when the input is already proper Arabic.
 */
export function fixStoredFilename(name: string | null | undefined): string {
  if (!name) return '';
  if (ARABIC_RE.test(name)) return name;
  const recovered = tryDecodeMojibake(name);
  return recovered ?? name;
}
