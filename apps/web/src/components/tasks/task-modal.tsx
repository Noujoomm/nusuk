'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Check, Plus, Trash2, Upload, FileText, Loader2, CheckSquare } from 'lucide-react';
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

interface ChecklistDraft {
  id: string;
  title: string;
  isNew: boolean;
}

interface FileDraft {
  id: string;
  file?: File;
  fileName: string;
  fileSize: number;
  isNew: boolean;
  isExisting?: boolean;
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

  // Checklist
  const [checklistItems, setChecklistItems] = useState<ChecklistDraft[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  // Files
  const [files, setFiles] = useState<FileDraft[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        // Load existing checklist
        setChecklistItems(
          (task.checklist || []).map((c: any) => ({ id: c.id, title: c.titleAr || c.title, isNew: false }))
        );
        // Load existing files
        setFiles(
          (task.files || []).map((f: any) => ({ id: f.id, fileName: f.fileName, fileSize: f.fileSize, isNew: false, isExisting: true }))
        );
      } else {
        setForm({ ...EMPTY_FORM, trackId: defaultTrackId || '' });
        setChecklistItems([]);
        setFiles([]);
      }
      setUserSearch('');
      setNewChecklistTitle('');
    }
  }, [isOpen, task]);

  // Load full task detail for edit mode
  useEffect(() => {
    if (isOpen && task?.id) {
      tasksApi.get(task.id).then(({ data }) => {
        setChecklistItems(
          (data.checklist || []).map((c: any) => ({ id: c.id, title: c.titleAr || c.title, isNew: false }))
        );
        setFiles(
          (data.files || []).map((f: any) => ({ id: f.id, fileName: f.fileName, fileSize: f.fileSize, isNew: false, isExisting: true }))
        );
      }).catch(() => {});
    }
  }, [isOpen, task?.id]);

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

  // Checklist handlers
  const addChecklistItem = () => {
    if (!newChecklistTitle.trim()) return;
    setChecklistItems((prev) => [...prev, { id: `new-${Date.now()}`, title: newChecklistTitle.trim(), isNew: true }]);
    setNewChecklistTitle('');
  };

  const removeChecklistItem = (id: string) => {
    setChecklistItems((prev) => prev.filter((c) => c.id !== id));
  };

  // File handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles: FileDraft[] = Array.from(selected).map((f) => ({
      id: `new-${Date.now()}-${f.name}`,
      file: f,
      fileName: f.name,
      fileSize: f.size,
      isNew: true,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

      let taskId: string;

      if (isEdit && task) {
        await tasksApi.update(task.id, payload);
        taskId = task.id;

        // Delete removed checklist items
        const existingIds = checklistItems.filter((c) => !c.isNew).map((c) => c.id);
        const originalIds = (task.checklist || []).map((c: any) => c.id);
        for (const id of originalIds) {
          if (!existingIds.includes(id)) {
            await tasksApi.deleteChecklistItem(taskId, id).catch(() => {});
          }
        }

        // Delete removed files
        const existingFileIds = files.filter((f) => f.isExisting).map((f) => f.id);
        const originalFileIds = (task.files || []).map((f: any) => f.id);
        for (const id of originalFileIds) {
          if (!existingFileIds.includes(id)) {
            await tasksApi.deleteTaskFile(taskId, id).catch(() => {});
          }
        }

        toast.success('تم تحديث المهمة');
      } else {
        const res = await tasksApi.create(payload);
        taskId = res.data.id;
        toast.success('تم إنشاء المهمة');
      }

      // Create new checklist items
      const newChecklist = checklistItems.filter((c) => c.isNew);
      for (const item of newChecklist) {
        await tasksApi.createChecklistItem(taskId, { title: item.title, titleAr: item.title }).catch(() => {});
      }

      // Upload new files
      const newFiles = files.filter((f) => f.isNew && f.file);
      for (const f of newFiles) {
        await tasksApi.uploadTaskFile(taskId, f.file!).catch(() => {});
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
              <div className="max-h-32 overflow-y-auto space-y-1">
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

          {/* قائمة المهام (Checklist) */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-300">
              <CheckSquare className="h-4 w-4" />
              قائمة المهام
            </label>

            {checklistItems.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                    <CheckSquare className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                    <span className="flex-1 text-sm text-gray-300">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(item.id)}
                      className="p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newChecklistTitle}
                onChange={(e) => setNewChecklistTitle(e.target.value)}
                placeholder="أضف بند جديد..."
                className="input-field flex-1 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
              />
              <button
                type="button"
                onClick={addChecklistItem}
                disabled={!newChecklistTitle.trim()}
                className="rounded-xl bg-brand-500/20 px-3 py-2 text-brand-300 hover:bg-brand-500/30 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* رفع الملفات */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-300">
              <Upload className="h-4 w-4" />
              المرفقات
            </label>

            {files.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                    <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="flex-1 text-sm text-gray-300 truncate">{f.fileName}</span>
                    <span className="text-[10px] text-gray-500 shrink-0">{formatFileSize(f.fileSize)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm text-gray-400 hover:border-brand-500/50 hover:text-brand-300 transition-colors w-full justify-center"
            >
              <Upload className="h-4 w-4" />
              اختر ملفات للرفع
            </button>
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
            {submitting ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />جاري الحفظ...</span> : isEdit ? 'تحديث' : 'إنشاء'}
          </button>
        </div>
      </div>
    </div>
  );
}
