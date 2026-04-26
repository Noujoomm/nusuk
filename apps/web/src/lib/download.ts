/**
 * Helpers for browser-side file downloads + preview when bytes come from
 * the API as a Blob (we can't use a plain <a href> because the auth header
 * doesn't ride along on browser-initiated navigations).
 */

/**
 * Reads the original filename out of a Content-Disposition header. Tries
 * RFC 5987 (filename*=UTF-8''…) first since that's the only way Arabic
 * filenames survive — falls back to the ASCII `filename="…"` directive.
 */
export function parseFilenameFromHeaders(headers: any, fallback: string): string {
  const cd: string | undefined = headers?.['content-disposition'] || headers?.['Content-Disposition'];
  if (!cd) return fallback;
  // RFC 5987 (preferred — supports UTF-8)
  const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // fall through to ASCII match below
    }
  }
  const asciiMatch = cd.match(/filename="?([^";]+)"?/i);
  if (asciiMatch) return asciiMatch[1].trim();
  return fallback;
}

/** Triggers a browser download of the given blob with the given filename. */
export function triggerBrowserDownload(data: Blob | ArrayBuffer, filename: string, mimeType?: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], mimeType ? { type: mimeType } : undefined);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has finished kicking off the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
