'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '@/lib/api';
import { PRIORITY_LABELS, cn } from '@/lib/utils';
import { Task } from '@/stores/tasks';

interface Track {
  id: string;
  nameAr: string;
  color?: string;
}

interface User {
  id: string;
  name: string;
  nameAr: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task?: Task | null;
  tracks: Track[];
  users: User[];
  onSuccess: () => void;
  defaultTrackId?: string;
}

const EMPTY_FORM = {
  titleAr: '',
  title: '',
  descriptionAr: '',
  priority: 'medium',
  trackId: '',
  dueDate: '',
  assigneeIds: [] as string[],
};

export default function TaskModal({ isOpen, onClose, task, tracks, users, onSuccess, defaultTrackId }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const isEdit = !!task;

  useEffect(() => {
    if (isOpen) {
      if (task) {
        setForm({
          titleAr: task.titleAr || '',
          title: task.title || '',
          descriptionAr: task.descriptionAr || '',
          priority: task.priority || 'medium',
          trackId: task.trackId || '',
          dueDate: task.dueDate ? task.dueDate.substring(0, 10) : '',
          assigneeIds: task.assignments?.map((a) => a.userId || a.user?.id).filter(Boolean) as string[] || [],
        });
      } else {
        setForm({ ...EMPTY_FORM, trackId: defaultTrackId || '' });
      }
      setUserSearch('');
    }
  }, [isOpen, task]);

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) => u.nameAr?.includes(userSearch) || u.name?.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  if (!isOpen) return null;

  const updateField = (name: string, value: any) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleUser = (userId: string) => {
    setForm((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(userId)
        ? prev.assigneeIds.filter((id) => id !== userId)
        : [...prev.assigneeIds, userId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titleAr.trim()) {
      toast.error('العنوان بالعربية مطلوب');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        titleAr: form.titleAr,
        title: form.title || form.titleAr,
        descriptionAr: form.descriptionAr,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        trackId: form.trackId || undefined,
        assigneeType: 'GLOBAL',
        assigneeIds: form.assigneeIds.length > 0 ? form.assigneeIds : undefined,
      };

      if (isEdit && task) {
        await tasksApi.update(task.id, payload);
        toast.success('تم تحديث المهمة');
      } else {
        await tasksApi.create(payload);
        toast.success('تم إنشاء المهمة');
      }

      onSuccess();
      onClose();
    } catch {
      toast.error(isEdit ? 'فشل تحديث المهمة' : 'فشل إنشاء المهمة');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedUsers = users.filter((u) => form.assigneeIds.includes(u.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="glass relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">
            {isEdit ? 'تعديل المهمة' : 'إضافة مهمة'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[60vh] p-6 space-y-4">
          {/* العنوان بالعربية */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              العنوان بالعربية <span className="text-red-400 mr-1">*</span>
            </label>
            <input
              type="text"
              value={form.titleAr}
              onChange={(e) => updateField('titleAr', e.target.value)}
              placeholder="عنوان المهمة بالعربية"
              required
              className="input-field"
            />
          </div>

          {/* العنوان بالإنجليزية */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">العنوان بالإنجليزية</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Task title in English"
              dir="ltr"
              className="input-field text-left"
            />
          </div>

          {/* الوصف */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">الوصف</label>
            <textarea
              value={form.descriptionAr}
              onChange={(e) => updateField('descriptionAr', e.target.value)}
              placeholder="وصف المهمة..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* الأولوية */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">الأولوية</label>
            <select
              value={form.priority}
              onChange={(e) => updateField('priority', e.target.value)}
              className="input-field"
            >
              {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* المسار */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">المسار</label>
            <select
              value={form.trackId}
              onChange={(e) => updateField('trackId', e.target.value)}
              className="input-field"
            >
              <option value="">حدد المسار</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.nameAr}</option>
              ))}
            </select>
          </div>

          {/* تاريخ الاستحقاق */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">تاريخ الاستحقاق</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => updateField('dueDate', e.target.value)}
              className="input-field"
            />
          </div>

          {/* المسؤولون */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">المسؤولون</label>

            {/* Selected users chips */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/20 px-2.5 py-1 text-xs font-medium text-brand-300"
                  >
                    {u.nameAr || u.name}
                    <button
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className="text-brand-400 hover:text-white transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search + user list */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="relative mb-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="بحث في الموظفين..."
                  className="input-field pr-9 text-sm"
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-2">لا يوجد موظفون</p>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = form.assigneeIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          isSelected ? 'bg-brand-500/20 text-brand-300' : 'text-gray-300 hover:bg-white/5',
                        )}
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/30 text-[10px] font-bold text-brand-200 shrink-0">
                          {u.nameAr?.charAt(0) || u.name?.charAt(0) || '?'}
                        </div>
                        <span className="flex-1 text-right">{u.nameAr || u.name}</span>
                        {isSelected && <Check className="h-4 w-4 text-brand-400 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-brand-500/20 px-5 py-2.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-500/30 disabled:opacity-50"
          >
            {submitting ? 'جاري الحفظ...' : isEdit ? 'تحديث' : 'إنشاء'}
          </button>
        </div>
      </div>
    </div>
  );
}
