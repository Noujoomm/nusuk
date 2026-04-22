/**
 * Fix multer's latin1 decoding of UTF-8 filenames.
 *
 * Multer uses busboy which decodes multipart filenames as latin1 by default
 * (defParamCharset is not set). Arabic/non-ASCII filenames become mojibake.
 *
 * Detection: if the original has NO Arabic chars but the latin1→utf8 decoded
 * version DOES, then it's mojibake and we fix it.
 */

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * Multer-upload variant — mutates the file in place. Must run BEFORE
 * file.originalname is used anywhere downstream.
 */
export function fixMulterFilename(file: Express.Multer.File): void {
  if (!file?.originalname) return;

  try {
    if (!ARABIC_RE.test(file.originalname)) {
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
      if (ARABIC_RE.test(decoded)) {
        file.originalname = decoded;
      }
    }
  } catch {
    /* keep original */
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
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (ARABIC_RE.test(decoded)) return decoded;
  } catch {
    /* fall through */
  }
  return name;
}
