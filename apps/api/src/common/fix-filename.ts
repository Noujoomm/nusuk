/**
 * Fix multer's latin1 decoding of UTF-8 filenames.
 *
 * Multer uses busboy which decodes multipart filenames as latin1 by default.
 * Arabic/non-ASCII filenames become mojibake. This function re-encodes
 * the latin1 string back to a Buffer, then decodes it as UTF-8.
 *
 * Must be called BEFORE file.originalname is used anywhere.
 */
export function fixMulterFilename(file: Express.Multer.File): void {
  if (!file?.originalname) return;

  try {
    const buf = Buffer.from(file.originalname, 'latin1');
    const decoded = buf.toString('utf8');

    // Only replace if the decoded version is different AND looks valid
    // (contains characters outside basic ASCII that aren't the original mojibake)
    if (decoded !== file.originalname && !decoded.includes('\uFFFD')) {
      file.originalname = decoded;
    }
  } catch {
    // If decoding fails, keep the original
  }

  // Sanitize dangerous filesystem characters but keep Arabic, spaces, hyphens, dots
  file.originalname = file.originalname.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}
