'use client';

/**
 * Print-optimized view for an Intelligence session.
 *
 * This is the "PDF export" path: we render the generated content as a clean
 * printable A4 document and let the browser's native "Save as PDF" handle the
 * actual PDF creation. This is the only approach that renders Arabic correctly
 * without shipping a ~300 MB Chromium in the Railway container.
 *
 * The "Print" button auto-fires once on mount. If the user cancels, the page
 * stays visible and they can trigger it again manually.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Printer } from 'lucide-react';
import { intelligenceApi } from '@/lib/api';

const SECTION_LABEL: Record<string, string> = {
  executive_summary: 'الملخص التنفيذي',
  overall_status: 'الحالة العامة',
  key_achievements: 'أبرز الإنجازات',
  challenges: 'التحديات',
  risks: 'المخاطر',
  blockers: 'المعوقات والتأخيرات',
  recommendations: 'التوصيات',
  notes: 'ملاحظات مهمة',
  track_notes: 'ملخص حسب المسار',
  management_attention: 'بنود تستدعي اهتمام الإدارة',
};

export default function IntelligencePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoPrintFired, setAutoPrintFired] = useState(false);

  useEffect(() => {
    if (!id) return;
    intelligenceApi
      .getSession(id)
      .then(({ data }) => setSession(data))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (session && !autoPrintFired) {
      setAutoPrintFired(true);
      // Small delay so the DOM finishes layout before the print dialog opens.
      setTimeout(() => window.print(), 400);
    }
  }, [session, autoPrintFired]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        تعذّر تحميل الجلسة
      </div>
    );
  }

  const sections: Array<{ key: string; body: string }> =
    session.editedContent?.sections ?? session.generatedContent?.sections ?? [];

  const filters = session.filters || {};
  const filtersAr = describeFilters(filters);
  const modeLabel =
    {
      executive_summary: 'ملخص تنفيذي',
      detailed: 'تقرير مفصل',
      track_by_track: 'ملخص حسب المسارات',
      template_prep: 'تحضير للقالب',
      custom: 'مخصص',
    }[session.outputMode as string] || session.outputMode;

  return (
    <>
      {/* Print-only styling. `html, body` gets neutral colors for print; the
          on-screen preview keeps the dashboard's glass theme around the sheet. */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 18mm;
          }
          body {
            background: #fff !important;
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
            background: #fff !important;
            color: #000 !important;
          }
        }
      `}</style>

      <div className="no-print flex items-center justify-end gap-2 p-4">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 flex items-center gap-2 text-sm"
        >
          <Printer className="w-4 h-4" />
          طباعة / حفظ كـ PDF
        </button>
      </div>

      <div
        dir="rtl"
        className="print-sheet mx-auto my-6 bg-white text-gray-900 rounded-xl shadow-xl max-w-[794px] p-10 leading-relaxed"
        style={{
          fontFamily:
            "'Noto Naskh Arabic', 'Amiri', 'Segoe UI', Tahoma, sans-serif",
        }}
      >
        <header className="border-b-2 border-gray-800 pb-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            مركز ذكاء التقارير
          </h1>
          <p className="text-sm text-gray-600 mt-1">منصة رؤية — تقرير تنفيذي</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 mt-4">
            <div>
              <span className="font-semibold">النمط: </span>
              {modeLabel}
            </div>
            <div>
              <span className="font-semibold">تاريخ الإنشاء: </span>
              {new Date(session.createdAt).toLocaleString('ar-SA')}
            </div>
            <div className="col-span-2">
              <span className="font-semibold">المعايير: </span>
              {filtersAr}
            </div>
            <div>
              <span className="font-semibold">عدد المصادر: </span>
              {session.sourceReportCount}
            </div>
            {session.createdBy?.nameAr && (
              <div>
                <span className="font-semibold">أنشئ بواسطة: </span>
                {session.createdBy.nameAr}
              </div>
            )}
          </div>
        </header>

        {sections
          .filter((s) => (s.body || '').trim().length > 0)
          .map((s) => (
            <section key={s.key} className="mb-6 break-inside-avoid">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-300 pb-1 mb-3">
                {SECTION_LABEL[s.key] || s.key}
              </h2>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {s.body}
              </div>
            </section>
          ))}

        <footer className="mt-8 pt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
          منصة رؤية — Roya Platform · مركز ذكاء التقارير
        </footer>
      </div>
    </>
  );
}

function describeFilters(f: any): string {
  if (!f) return 'جميع التقارير';
  const parts: string[] = [];
  if (f.dateFrom || f.dateTo) {
    parts.push(
      `الفترة: ${f.dateFrom?.slice(0, 10) ?? '—'} إلى ${f.dateTo?.slice(0, 10) ?? '—'}`,
    );
  }
  if (f.trackIds?.length) parts.push(`المسارات: ${f.trackIds.length}`);
  if (f.reportTypes?.length)
    parts.push(`الأنواع: ${f.reportTypes.join('، ')}`);
  if (f.excludeEmpty) parts.push('باستثناء الفارغة');
  return parts.length ? parts.join(' | ') : 'جميع التقارير';
}
