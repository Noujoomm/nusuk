'use client';

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceApi } from '@/lib/api';

/**
 * Lists the distinct unmatched (rawName, rawEmployeeNumber) pairs from
 * one upload and lets the admin convert each into a real
 * PdfAttendanceEmployee. Submission triggers a server-side relink across
 * every upload + reanalyze of every affected upload, so the heatmap and
 * KPIs reflect the new matches immediately.
 *
 * UX intent: a quick triage form. The user reviews 10 rows in 30 seconds,
 * picks track / city / shift defaults at the top, ticks the rows they
 * want to onboard, hits "إنشاء". No per-row schedule editing — that's
 * what /attendance Excel re-seed is for.
 */

interface UnmatchedRow {
  rawEmployeeNumber: string | null;
  rawName: string;
  rawDepartment: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

interface Props {
  uploadId: string;
  open: boolean;
  onClose: () => void;
  onResolved: () => void; // parent reloads the report after creation
  trackOptions: string[]; // populated from the daily report's known tracks
}

export function UnmatchedDialog({ uploadId, open, onClose, onResolved, trackOptions }: Props) {
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Defaults applied to every selected row — keeps the form short.
  const [track, setTrack] = useState<string>('');
  const [center, setCenter] = useState<'makkah' | 'madinah' | 'shared' | ''>('');
  const [shiftType, setShiftType] = useState<'morning' | 'evening' | 'on_call' | 'unscheduled'>('morning');
  const [scheduledCheckIn, setScheduledCheckIn] = useState<string>('07:00');
  const [scheduledCheckOut, setScheduledCheckOut] = useState<string>('19:00');
  const [worksByCharter, setWorksByCharter] = useState<boolean>(true);

  useEffect(() => {
    if (!open || !uploadId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await attendanceApi.unmatchedGrouped(uploadId);
        if (cancelled) return;
        const data = (res.data || []) as UnmatchedRow[];
        setRows(data);
        // Default to all selected — saves one click for the common case.
        const init: Record<string, boolean> = {};
        for (const r of data) init[keyOf(r)] = true;
        setSelected(init);
      } catch {
        toast.error('فشل تحميل السجلات غير المطابقة');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, uploadId]);

  if (!open) return null;

  const selectedCount = rows.filter((r) => selected[keyOf(r)]).length;
  const allSelected = selectedCount === rows.length && rows.length > 0;

  const submit = async () => {
    if (selectedCount === 0) {
      toast.error('اختر سجلاً واحداً على الأقل');
      return;
    }
    if (!track) {
      toast.error('اختر المسار');
      return;
    }
    setSubmitting(true);
    const tid = toast.loading('جارٍ إنشاء الموظفين وإعادة التحليل…');
    try {
      const items = rows
        .filter((r) => selected[keyOf(r)])
        .map((r) => ({
          rawName: r.rawName,
          rawEmployeeNumber: r.rawEmployeeNumber,
          fullName: r.rawName,
          track,
          center: center || null,
          shiftType,
          scheduledCheckIn,
          scheduledCheckOut,
          worksByCharter,
        }));
      const res = await attendanceApi.resolveUnmatched(items);
      const { created, recordsLinked, uploadsReanalyzed } = res.data;
      toast.success(
        `تم إنشاء ${created} موظف · ربط ${recordsLinked} سجل · إعادة تحليل ${uploadsReanalyzed} رفعة`,
        { id: tid, duration: 5000 },
      );
      onResolved();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل إنشاء الموظفين';
      toast.error(typeof msg === 'string' ? msg : 'فشل الإنشاء', { id: tid });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-950/95 border border-amber-500/20 shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/95 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30">
              <UserPlus className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">إدارة السجلات غير المطابقة</h2>
              <p className="text-xs text-slate-400">
                حوّل السجلات إلى موظفين جدد في الكراسة — سيُعاد تحليل الرفعات المتأثرة تلقائياً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" />
              جارٍ التحميل…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              لا توجد سجلات غير مطابقة في هذه الرفعة.
            </div>
          ) : (
            <>
              {/* Defaults form */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                  <span>الإعدادات الافتراضية</span>
                  <span className="text-[11px] text-slate-400">(تُطبَّق على كل المختار)</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="المسار *">
                    <select
                      value={track}
                      onChange={(e) => setTrack(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                    >
                      <option value="">— اختر —</option>
                      {trackOptions.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="المدينة">
                    <select
                      value={center}
                      onChange={(e) => setCenter(e.target.value as any)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                    >
                      <option value="">— حسب المسار —</option>
                      <option value="makkah">مكة المكرمة</option>
                      <option value="madinah">المدينة المنورة</option>
                      <option value="shared">مشترك</option>
                    </select>
                  </Field>
                  <Field label="نوع الدوام">
                    <select
                      value={shiftType}
                      onChange={(e) => setShiftType(e.target.value as any)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                    >
                      <option value="morning">صباحي</option>
                      <option value="evening">مسائي</option>
                      <option value="on_call">On Call</option>
                      <option value="unscheduled">بدون وقت محدد</option>
                    </select>
                  </Field>
                  <Field label="بداية الدوام">
                    <input
                      type="time"
                      value={scheduledCheckIn}
                      onChange={(e) => setScheduledCheckIn(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                    />
                  </Field>
                  <Field label="نهاية الدوام">
                    <input
                      type="time"
                      value={scheduledCheckOut}
                      onChange={(e) => setScheduledCheckOut(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                    />
                  </Field>
                  <label className="flex cursor-pointer items-center gap-2 self-end pb-1 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={worksByCharter}
                      onChange={(e) => setWorksByCharter(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-slate-900"
                    />
                    <span>ضمن الكراسة</span>
                  </label>
                </div>
              </div>

              {/* Records list */}
              <div className="rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between border-b border-white/10 p-3">
                  <span className="text-sm font-bold text-white">
                    {rows.length} سجل · مختار {selectedCount}
                  </span>
                  <button
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      const value = !allSelected;
                      for (const r of rows) next[keyOf(r)] = value;
                      setSelected(next);
                    }}
                    className="text-xs text-emerald-300 hover:text-emerald-200"
                  >
                    {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                  </button>
                </div>
                <ul className="divide-y divide-white/5">
                  {rows.map((r) => {
                    const k = keyOf(r);
                    return (
                      <li key={k} className="flex items-center gap-3 p-3 hover:bg-white/[0.02]">
                        <input
                          type="checkbox"
                          checked={!!selected[k]}
                          onChange={(e) => setSelected({ ...selected, [k]: e.target.checked })}
                          className="h-4 w-4 rounded border-white/20 bg-slate-900"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm text-white">
                            <span className="truncate font-medium">{r.rawName || '—'}</span>
                            {r.rawEmployeeNumber && (
                              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300">
                                #{r.rawEmployeeNumber}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
                            {r.rawDepartment && <span>قسم: {r.rawDepartment}</span>}
                            <span>{r.count} بصمة</span>
                            <span>
                              {r.firstSeen}
                              {r.firstSeen !== r.lastSeen && ` → ${r.lastSeen}`}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-[11px] text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  الإنشاء سيُحدِّث جميع الرفعات السابقة اللي ظهرت فيها هذه الأسماء (يضيف الاسم
                  كـ alias لو الموظف موجود مسبقاً)، ويعيد بناء السجلات اليومية — قد يستغرق دقيقة.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-white/10 bg-slate-950/95 p-4 backdrop-blur-xl">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
          >
            إلغاء
          </button>
          <button
            onClick={submit}
            disabled={submitting || selectedCount === 0 || !track}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            إنشاء وربط ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function keyOf(r: UnmatchedRow): string {
  return `${r.rawEmployeeNumber ?? ''}|${r.rawName}`;
}
