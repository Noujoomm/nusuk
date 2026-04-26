'use client';

import { useEffect, useState } from 'react';
import { X, Download, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceApi } from '@/lib/api';
import { parseFilenameFromHeaders, triggerBrowserDownload } from '@/lib/download';

interface PreviewDialogProps {
  open: boolean;
  uploadId: string | null;
  reportDate: string | null;
  fallbackFileName?: string;
  onClose: () => void;
}

export function PreviewDialog({
  open,
  uploadId,
  reportDate,
  fallbackFileName,
  onClose,
}: PreviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [blobData, setBlobData] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !uploadId) return;

    let cancelled = false;
    let createdUrl: string | null = null;

    setIsLoading(true);
    setError(null);
    setPreviewUrl(null);
    setBlobData(null);
    setFilename('');

    attendanceApi.previewFile(uploadId)
      .then((res) => {
        if (cancelled) return;
        const fallback = fallbackFileName || `attendance-${reportDate ?? 'report'}.pdf`;
        const name = parseFilenameFromHeaders(res.headers, fallback);
        const blob = new Blob([res.data], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        setPreviewUrl(createdUrl);
        setFilename(name);
        setBlobData(blob);
      })
      .catch(() => {
        if (cancelled) return;
        setError('تعذّرت المعاينة، حاول مرة أخرى');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, uploadId, reportDate, fallbackFileName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDownload = () => {
    if (!blobData || !filename) return;
    try {
      triggerBrowserDownload(blobData, filename, 'application/pdf');
    } catch {
      toast.error('فشل تنزيل الملف');
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-full max-w-5xl h-[90vh] rounded-2xl bg-slate-900 border border-white/10 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-200 truncate">
              معاينة {reportDate ? `تقرير ${reportDate}` : 'الملف'}
            </h3>
            {filename && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{filename}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDownload}
              disabled={!blobData || isLoading}
              className="rounded-lg bg-white/5 border border-white/10 text-gray-300 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40 flex items-center gap-1.5"
              title="تنزيل الملف"
            >
              <Download className="w-3.5 h-3.5" />
              تنزيل
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-white/5 hover:text-gray-200"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-black/40 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center h-full gap-3 text-gray-400">
              <Loader2 className="w-7 h-7 animate-spin text-brand-400" />
              <span className="text-sm">جارٍ تحضير المعاينة…</span>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-sm">{error}</p>
              <button
                onClick={onClose}
                className="rounded-lg bg-white/5 border border-white/10 px-4 py-1.5 text-xs hover:bg-white/10"
              >
                إغلاق
              </button>
            </div>
          )}

          {!isLoading && !error && previewUrl && (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0 bg-white"
              title={filename || 'preview'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
