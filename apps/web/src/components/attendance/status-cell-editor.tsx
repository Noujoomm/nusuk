'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle, FileCheck, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceApi } from '@/lib/api';

/**
 * Modal for editing a single attendance cell. Plain Tailwind + react-
 * hot-toast — no radix-popover or framer-motion (not in deps), just a
 * fixed overlay positioned center-screen. The heatmap renders this once
 * and toggles its open state from the cell click handler.
 */

export type ManualStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED_ABSENCE';

const STATUS_OPTIONS: Array<{
  key: ManualStatus;
  label: string;
  icon: typeof CheckCircle2;
  cls: string;
  ring: string;
}> = [
  { key: 'PRESENT', label: 'حاضر', icon: CheckCircle2, cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200', ring: 'ring-emerald-400/40' },
  { key: 'LATE', label: 'متأخر', icon: Clock, cls: 'bg-amber-500/15 border-amber-500/40 text-amber-200', ring: 'ring-amber-400/40' },
  { key: 'ABSENT', label: 'غائب', icon: XCircle, cls: 'bg-red-500/15 border-red-500/40 text-red-200', ring: 'ring-red-400/40' },
  { key: 'EXCUSED_ABSENCE', label: 'غياب بعذر', icon: FileCheck, cls: 'bg-blue-500/15 border-blue-500/40 text-blue-200', ring: 'ring-blue-400/40' },
];

interface Props {
  open: boolean;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  currentStatus: ManualStatus | null; // null when no manual override yet
  onClose: () => void;
  onSaved: (status: ManualStatus) => void;
}

export function StatusCellEditor({
  open,
  employeeId,
  employeeName,
  date,
  currentStatus,
  onClose,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<ManualStatus | null>(currentStatus);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(currentStatus);
      setReason('');
    }
  }, [open, currentStatus]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dateLabel = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date + 'T00:00:00Z'));

  const save = async () => {
    if (!selected) {
      toast.error('اختر حالة');
      return;
    }
    setSaving(true);
    const tid = toast.loading('جارٍ الحفظ…');
    try {
      await attendanceApi.updateStatus({
        employeeId,
        date,
        status: selected,
        reason: reason.trim() || undefined,
      });
      toast.success('تم تحديث الحالة', { id: tid });
      onSaved(selected);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل الحفظ';
      toast.error(typeof msg === 'string' ? msg : 'فشل الحفظ', { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async () => {
    if (!confirm('إلغاء التعديل اليدوي وإرجاع الحالة الأصلية؟')) return;
    setRemoving(true);
    const tid = toast.loading('جارٍ الإلغاء…');
    try {
      await attendanceApi.clearStatus(employeeId, date);
      toast.success('أُلغي التعديل اليدوي', { id: tid });
      onSaved(null as any); // signal parent to refresh; null means no manual now
      onClose();
    } catch {
      toast.error('فشل الإلغاء', { id: tid });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      dir="rtl"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white">تعديل حالة الحضور</h3>
            <p className="mt-1 truncate text-xs text-slate-300">{employeeName}</p>
            <p className="text-[11px] text-slate-500">{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status options */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = selected === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setSelected(opt.key)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition-all ${
                    active
                      ? `${opt.cls} ring-2 ${opt.ring}`
                      : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-bold">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] text-slate-400">سبب التعديل (اختياري)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: إجازة مرضية، مهمة رسمية…"
              rows={2}
              className="w-full resize-none rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
            />
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 p-3">
          {currentStatus ? (
            <button
              onClick={removeOverride}
              disabled={removing || saving}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40"
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'إلغاء التعديل'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
            >
              إغلاق
            </button>
            <button
              onClick={save}
              disabled={saving || !selected || selected === currentStatus}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              حفظ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
