'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { executiveTasksApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ExecutiveTask {
  id: string;
  sheetName: string;
  name: string;
  status: string;
  track: string | null;
  entity: string | null;
  responsible: string | null;
  followUp: string | null;
  receiveDate: string | null;
  lastActionDate: string | null;
  dueDate: string | null;
  deliveryDate: string | null;
  notes: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task?: ExecutiveTask | null;
  sheets: Array<{ name: string; count: number }>;
  onSuccess: () => void;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'جديد' },
  { value: 'in_progress', label: 'قيد التنفيذ' },
  { value: 'sent', label: 'تم الإرسال' },
  { value: 'editing', label: 'قيد التعديل' },
  { value: 'edited', label: 'تم التعديل' },
  { value: 'approved', label: 'معتمد' },
  { value: 'completed', label: 'مكتملة' },
];

const EMPTY_FORM = {
  name: '',
  sheetName: '',
  status: 'new',
  track: '',
  entity: '',
  responsible: '',
  followUp: '',
  receiveDate: '',
  lastActionDate: '',
  dueDate: '',
  deliveryDate: '',
  notes: '',
};

function toInputDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

export default function ExecutiveTaskModal({ isOpen, onClose, task, sheets, onSuccess }: Props) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!task;

  useEffect(() => {
    if (task) {
      setForm({
        name: task.name || '',
        sheetName: task.sheetName || '',
        status: task.status || 'in_progress',
        track: task.track || '',
        entity: task.entity || '',
        responsible: task.responsible || '',
        followUp: task.followUp || '',
        receiveDate: toInputDate(task.receiveDate),
        lastActionDate: toInputDate(task.lastActionDate),
        dueDate: toInputDate(task.dueDate),
        deliveryDate: toInputDate(task.deliveryDate),
        notes: task.notes || '',
      });
    } else {
      setForm({ ...EMPTY_FORM, sheetName: sheets[0]?.name || 'عام' });
    }
    setErrors({});
  }, [task, isOpen, sheets]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'اسم المهمة مطلوب';
    if (!form.sheetName.trim()) errs.sheetName = 'القسم مطلوب';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        sheetName: form.sheetName.trim(),
        status: form.status,
        track: form.track.trim() || null,
        entity: form.entity.trim() || null,
        responsible: form.responsible.trim() || null,
        followUp: form.followUp.trim() || null,
        receiveDate: form.receiveDate || null,
        lastActionDate: form.lastActionDate || null,
        dueDate: form.dueDate || null,
        deliveryDate: form.deliveryDate || null,
        notes: form.notes.trim() || null,
      };

      if (isEdit && task) {
        await executiveTasksApi.update(task.id, payload);
        toast.success('تم تحديث المهمة بنجاح');
      } else {
        await executiveTasksApi.create(payload);
        toast.success('تم إضافة المهمة بنجاح');
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto glass rounded-2xl border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-white/10 bg-[#0f1117]/95 backdrop-blur-sm rounded-t-2xl">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? 'تعديل المهمة' : 'إضافة مهمة جديدة'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* اسم المهمة */}
          <Field label="اسم المهمة" required error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="أدخل اسم المهمة"
              className={cn(inputClass, errors.name && 'border-red-500/50')}
            />
          </Field>

          {/* القسم + الحالة */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="القسم" required error={errors.sheetName}>
              <div className="relative">
                <input
                  type="text"
                  value={form.sheetName}
                  onChange={(e) => setForm({ ...form, sheetName: e.target.value })}
                  placeholder="اسم القسم"
                  list="sheet-options"
                  className={cn(inputClass, errors.sheetName && 'border-red-500/50')}
                />
                <datalist id="sheet-options">
                  {sheets.map((s) => (
                    <option key={s.name} value={s.name} />
                  ))}
                </datalist>
              </div>
            </Field>

            <Field label="الحالة">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={selectClass}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* المسار + الجهة */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="المسار">
              <input
                type="text"
                value={form.track}
                onChange={(e) => setForm({ ...form, track: e.target.value })}
                placeholder="مثل: الاستشاري، الطباعة..."
                className={inputClass}
              />
            </Field>
            <Field label="الجهة">
              <input
                type="text"
                value={form.entity}
                onChange={(e) => setForm({ ...form, entity: e.target.value })}
                placeholder="مثل: الوزارة..."
                className={inputClass}
              />
            </Field>
          </div>

          {/* المسؤولية + المتابعة */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="المسؤولية">
              <input
                type="text"
                value={form.responsible}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                placeholder="الشخص أو الجهة المسؤولة"
                className={inputClass}
              />
            </Field>
            <Field label="المتابعة">
              <input
                type="text"
                value={form.followUp}
                onChange={(e) => setForm({ ...form, followUp: e.target.value })}
                placeholder="المسؤول عن المتابعة"
                className={inputClass}
              />
            </Field>
          </div>

          {/* التواريخ */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="تاريخ الاستلام">
              <input
                type="date"
                value={form.receiveDate}
                onChange={(e) => setForm({ ...form, receiveDate: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="تاريخ آخر إجراء">
              <input
                type="date"
                value={form.lastActionDate}
                onChange={(e) => setForm({ ...form, lastActionDate: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="تاريخ الاستحقاق">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="تاريخ التسليم">
              <input
                type="date"
                value={form.deliveryDate}
                onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          {/* الملاحظات */}
          <Field label="الملاحظات">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="ملاحظات إضافية..."
              rows={3}
              className={cn(inputClass, 'resize-none')}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-[#0f1117]/95 backdrop-blur-sm rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'حفظ التعديلات' : 'إضافة المهمة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ───

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors';

const selectClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-brand-500/50 transition-colors';

function Field({ label, required, error, children }: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-red-400 mr-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
