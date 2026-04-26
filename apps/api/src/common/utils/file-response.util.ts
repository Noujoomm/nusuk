import type { Response } from 'express';
import { fixStoredFilename } from '../fix-filename';

/**
 * Sets Content-Type / Content-Length / Content-Disposition with RFC 5987
 * UTF-8 encoding so Arabic filenames survive the browser download dialog.
 *
 * Defensively runs the stored name through fixStoredFilename — legacy rows
 * predating the multer latin1 fix can have mojibake stored, and double-encoding
 * mojibake into UTF-8 would render as garbage on the client.
 */
export function setFileResponseHeaders(
  res: Response,
  fileName: string,
  mimeType: string,
  contentLength: number | null | undefined,
  disposition: 'attachment' | 'inline',
): void {
  const cleanName = fixStoredFilename(fileName) || 'attachment';
  const asciiFallback = cleanName.replace(/[^\x20-\x7E]/g, '_') || 'attachment';
  const encodedName = encodeURIComponent(cleanName);
  res.setHeader('Content-Type', mimeType);
  if (contentLength != null) res.setHeader('Content-Length', contentLength);
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
  );
  res.setHeader('Cache-Control', 'private, no-cache');
}
