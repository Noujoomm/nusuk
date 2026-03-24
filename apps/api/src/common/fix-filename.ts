/**
 * Fix multer's latin1 decoding of UTF-8 filenames.
 *
 * Multer uses busboy which decodes multipart filenames as latin1 by default
 * (defParamCharset is not set). Arabic/non-ASCII filenames become mojibake.
 *
 * Detection: if the original has NO Arabic chars but the latin1→utf8 decoded
 * version DOES, then it's mojibake and we fix it.
 *
 * Must be called BEFORE file.originalname is used anywhere.
 */
export function fixMulterFilename(file: Express.Multer.File): void {
  if (!file?.originalname) return;

  const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  try {
    // Only attempt fix if the original does NOT already contain Arabic
    if (!ARABIC_RE.test(file.originalname)) {
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
      // Apply fix only if decoded version contains Arabic (confirms it was mojibake)
      if (ARABIC_RE.test(decoded)) {
        file.originalname = decoded;
      }
    }
  } catch {
    // If decoding fails, keep the original
  }

  // Sanitize dangerous filesystem characters but keep Arabic, spaces, hyphens, dots, parens
  file.originalname = file.originalname.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}
