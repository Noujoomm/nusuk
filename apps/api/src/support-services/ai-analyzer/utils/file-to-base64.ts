import * as fs from 'fs';
import { extname } from 'path';

/** Supported mime types for Claude Vision + PDFs. Keep the whitelist tight. */
const SUPPORTED_MIMES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

export interface FilePayload {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf';
  sizeBytes: number;
}

export function resolveMediaType(filename: string, headerMime?: string): FilePayload['mediaType'] | null {
  // Prefer the extension — header mime is user-controlled on browsers.
  const ext = extname(filename).toLowerCase();
  if (SUPPORTED_MIMES[ext]) return SUPPORTED_MIMES[ext];

  // Fall back to header mime only if it's in the whitelist.
  const normalized = (headerMime ?? '').toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp' ||
    normalized === 'image/gif' ||
    normalized === 'application/pdf'
  ) {
    return normalized as FilePayload['mediaType'];
  }
  return null;
}

export function readAsBase64(filePath: string): { base64: string; sizeBytes: number } {
  const buffer = fs.readFileSync(filePath);
  return { base64: buffer.toString('base64'), sizeBytes: buffer.length };
}
