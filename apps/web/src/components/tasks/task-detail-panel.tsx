'use client';

import { useState, useEffect } from 'react';
import {
  X, Calendar, Flag, Activity, Users, User, Clock, FileText, ChevronLeft,
  Building2, Globe, History, CheckSquare, MessageSquare, StickyNote, RefreshCw,
  Plus, Trash2, Loader2, Send, Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  cn, formatDate, formatDateTime,
  TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS,
  ASSIGNEE_TYPE_LABELS, ASSIGNEE_TYPE_COLORS,
  CHECKLIST_STATUS_LABELS, CHECKLIST_STATUS_COLORS,
} from '@/lib/utils';
import { tasksApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { Task } from '@/stores/tasks';
import CommentThread from '@/components/comments/comment-thread';

interface Props {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_FLOW: Record<string, string[]> = {
  pending: ['in_progress'],
  in_progress: ['completed', 'delayed'],
  delayed: ['in_progress', 'completed'],
  completed: [],
  cancelled: [],
};

type TabKey = 'details' | 'checklist' | 'updates' | 'notes' | 'comments' | 'audit';

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATED: 'إنشاء', UPDATED: 'تحديث', STATUS_CHANGED: 'تغيير الحالة',
  COMMENT_ADDED: 'إضافة تعليق', REASSIGNED: 'إعادة تعيين', DELETED: 'حذف',
  CHECKLIST_ADDED: 'إضافة بند', CHECKLIST_STATUS_CHANGED: 'تغيير حالة بند',
  CHECKLIST_UPDATED: 'تحديث بند', CHECKLIST_DELETED: 'حذف بند',
  ADMIN_NOTE_ADDED: 'ملاحظة إدارية', ADMIN_NOTE_UPDATED: 'تحديث ملاحظة',
  ADMIN_NOTE_DELETED: 'حذف ملاحظة', UPDATE_ADDED: 'تحديث يومي',
};

const ASSIGNEE_TYPE_ICONS: Record<string, typeof Users> = {
  TRACK: Users, USER: User, HR: Building2, GLOBAL: Globe,
};

export default function TaskDetailPanel({ task: initialTask, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const [task, setTask] = useState(initialTask);
  const [detailLoading, setDetailLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [progress, setProgress] = useState(initialTask.progress ?? 0);
  const [savingProgress, setSavingProgress] = useState(false);

  // Checklist state
  const [checklistItems, setChecklistItems] = useState(initialTask.checklist || []);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);

  // Admin Notes state
  const [adminNotes, setAdminNotes] = useState<any[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Task Updates state
  const [taskUpdates, setTaskUpdates] = useState(initialTask.taskUpdates || []);
  const [newUpdate, setNewUpdate] = useState('');
  const [addingUpdate, setAddingUpdate] = useState(false);

  // Load full task details on mount
  useEffect(() => {
    const loadDetail = async () => {
      try {
        const { data } = await tasksApi.get(initialTask.id);
        setTask(data);
        setChecklistItems(data.checklist || []);
        setTaskUpdates(data.taskUpdates || []);
        setProgress(data.progress ?? 0);
      } catch {
        // fallback to initial data
      } finally {
        setDetailLoading(false);
      }
    };
    loadDetail();
  }, [initialTask.id]);

  const statusLabel = TASK_STATUS_LABELS[task.status] || task.status;
  const statusColor = TASK_STATUS_COLORS[task.status] || 'bg-gray-500/20 text-gray-300';
  const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority;
  const priorityColor = PRIORITY_COLORS[task.priority] || 'bg-gray-500/20 text-gray-300';
  const assigneeTypeLabel = ASSIGNEE_TYPE_LABELS[task.assigneeType] || task.assigneeType;
  const assigneeTypeColor = ASSIGNEE_TYPE_COLORS[task.assigneeType] || 'bg-gray-500/20 text-gray-300';
  const AssigneeIcon = ASSIGNEE_TYPE_ICONS[task.assigneeType] || Globe;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed' && task.status !== 'cancelled';
  const isAssigned = task.assignments?.some((a) => a.userId === user?.id);
  const isDirectAssignee = task.assigneeType === 'USER' && task.assigneeUserId === user?.id;
  const isAdminOrPm = user?.role === 'admin' || user?.role === 'pm';
  const isTrackLead = user?.role === 'track_lead';
  const canChangeStatus = isAssigned || isDirectAssignee || isAdminOrPm;
  const canManageChecklist = isAdminOrPm || isTrackLead;
  const nextStatuses = STATUS_FLOW[task.status] || [];

  // Load admin notes when tab activates (admin/pm only)
  useEffect(() => {
    if (activeTab === 'notes' && isAdminOrPm && !notesLoaded) {
      tasksApi.getAdminNotes(task.id)
        .then((res) => { setAdminNotes(res.data || []); setNotesLoaded(true); })
        .catch(() => setNotesLoaded(true));
    }
  }, [activeTab, isAdminOrPm, notesLoaded, task.id]);

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await tasksApi.updateStatus(task.id, newStatus);
      toast.success('تم تحديث حالة المهمة');
      onUpdate();
    } catch { toast.error('فشل تحديث الحالة'); }
    finally { setUpdatingStatus(false); }
  };

  const handleProgressSave = async () => {
    setSavingProgress(true);
    try {
      await tasksApi.update(task.id, { progress });
      toast.success('تم تحديث التقدم');
      onUpdate();
    } catch { toast.error('فشل تحديث التقدم'); }
    finally { setSavingProgress(false); }
  };

  // ── Checklist handlers ──
  const handleAddChecklist = async () => {
    if (!newChecklistTitle.trim()) return;
    setAddingChecklist(true);
    try {
      const { data } = await tasksApi.createChecklistItem(task.id, { title: newChecklistTitle, titleAr: newChecklistTitle });
      setChecklistItems((prev) => [...prev, data]);
      setNewChecklistTitle('');
      toast.success('تمت إضافة البند');
    } catch { toast.error('فشل إضافة البند'); }
    finally { setAddingChecklist(false); }
  };

  const handleChecklistStatus = async (itemId: string, status: string) => {
    try {
      const { data } = await tasksApi.updateChecklistItem(task.id, itemId, { status });
      setChecklistItems((prev) => prev.map((i) => (i.id === itemId ? data : i)));
      toast.success('تم تحديث الحالة');
    } catch { toast.error('فشل التحديث'); }
  };

  const handleDeleteChecklist = async (itemId: string) => {
    try {
      await tasksApi.deleteChecklistItem(task.id, itemId);
      setChecklistItems((prev) => prev.filter((i) => i.id !== itemId));
      toast.success('تم حذف البند');
    } catch { toast.error('فشل الحذف'); }
  };

  // ── Admin Notes handlers ──
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const { data } = await tasksApi.createAdminNote(task.id, { content: newNote });
      setAdminNotes((prev) => [data, ...prev]);
      setNewNote('');
      toast.success('تمت إضافة الملاحظة');
    } catch { toast.error('فشل إضافة الملاحظة'); }
    finally { setAddingNote(false); }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await tasksApi.deleteAdminNote(task.id, noteId);
      setAdminNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success('تم حذف الملاحظة');
    } catch { toast.error('فشل الحذف'); }
  };

  // ── Task Updates handlers ──
  const handleAddUpdate = async () => {
    if (!newUpdate.trim()) return;
    setAddingUpdate(true);
    try {
      const { data } = await tasksApi.createTaskUpdate(task.id, { content: newUpdate });
      setTaskUpdates((prev) => [data, ...prev]);
      setNewUpdate('');
      toast.success('تم إضافة التحديث');
    } catch { toast.error('فشل إضافة التحديث'); }
    finally { setAddingUpdate(false); }
  };

  let assigneeDisplay = '';
  if (task.assigneeType === 'TRACK' && task.assigneeTrack) assigneeDisplay = task.assigneeTrack.nameAr;
  else if (task.assigneeType === 'USER' && task.assigneeUser) assigneeDisplay = task.assigneeUser.nameAr || task.assigneeUser.name;
  else if (task.assigneeType === 'HR') assigneeDisplay = 'قسم الموارد البشرية';
  else if (task.assigneeType === 'GLOBAL') assigneeDisplay = 'الجميع';

  const tabs: { key: TabKey; label: string; icon: typeof Activity; count?: number }[] = [
    { key: 'details', label: 'التفاصيل', icon: Activity },
    { key: 'checklist', label: 'القائمة', icon: CheckSquare, count: checklistItems.length },
    { key: 'updates', label: 'التحديثات', icon: RefreshCw, count: taskUpdates.length },
    ...(isAdminOrPm ? [{ key: 'notes' as TabKey, label: 'ملاحظات', icon: StickyNote, count: task._count?.adminNotes }] : []),
    { key: 'comments', label: 'التعليقات', icon: MessageSquare },
    { key: 'audit', label: 'السجل', icon: History },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed top-0 left-0 h-full w-[600px] max-w-full glass border-r border-white/10 z-50 overflow-auto animate-in slide-in-from-left">
        {/* Header */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white truncate">{task.titleAr || task.title}</h2>
              {task.scopeBlock && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Hash className="w-3.5 h-3.5 text-brand-400" />
                  <span className="text-xs text-brand-300 font-mono">{task.scopeBlock.code}</span>
                  <span className="text-xs text-gray-400">{task.scopeBlock.title}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={cn('px-2.5 py-0.5 rounded-lg text-xs font-medium', statusColor)}>{statusLabel}</span>
                <span className={cn('px-2.5 py-0.5 rounded-lg text-xs font-medium', priorityColor)}>{priorityLabel}</span>
                <span className={cn('px-2.5 py-0.5 rounded-lg text-xs font-medium flex items-center gap-1', assigneeTypeColor)}>
                  <AssigneeIcon className="h-3 w-3" />{assigneeTypeLabel}
                </span>
                {isOverdue && <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-300">متأخرة</span>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 p-3 border-b border-white/10 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap',
                activeTab === tab.key ? 'bg-brand-500/20 text-brand-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="bg-white/10 rounded-full px-1.5 py-0.5 text-[10px]">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {/* ── Details Tab ── */}
          {activeTab === 'details' && (
            <div className="space-y-3">
              {canChangeStatus && nextStatuses.length > 0 && (
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-2">تغيير الحالة</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {nextStatuses.map((s) => (
                      <button key={s} onClick={() => handleStatusChange(s)} disabled={updatingStatus}
                        className={cn('rounded-xl px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50 hover:opacity-80', TASK_STATUS_COLORS[s] || 'bg-gray-500/20 text-gray-300')}
                      >
                        <span className="flex items-center gap-1.5"><ChevronLeft className="h-3 w-3" />{TASK_STATUS_LABELS[s] || s}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              <div className="bg-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">التقدم</span>
                  <span className="text-sm text-white font-medium">{progress}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))}
                  disabled={!canChangeStatus} className="w-full h-2 rounded-full appearance-none bg-white/10 accent-brand-500 cursor-pointer disabled:cursor-default disabled:opacity-60" />
                {canChangeStatus && progress !== (task.progress ?? 0) && (
                  <button onClick={handleProgressSave} disabled={savingProgress}
                    className="mt-2 rounded-lg bg-brand-500/20 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/30 transition-colors disabled:opacity-50">
                    {savingProgress ? 'جاري الحفظ...' : 'حفظ التقدم'}
                  </button>
                )}
              </div>

              {/* Assignee */}
              <div className="bg-white/5 rounded-xl p-3">
                <span className="text-sm text-gray-400 flex items-center gap-2 mb-2"><AssigneeIcon className="w-4 h-4" />معين إلى</span>
                <div className="flex items-center gap-2">
                  <span className={cn('px-2.5 py-0.5 rounded-lg text-xs font-medium', assigneeTypeColor)}>{assigneeTypeLabel}</span>
                  {assigneeDisplay && <span className="text-sm text-white">{assigneeDisplay}</span>}
                </div>
              </div>

              {/* Track + Scope Block */}
              {task.track && (
                <div className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                  <span className="text-sm text-gray-400 flex items-center gap-2"><FileText className="w-4 h-4" />المسار</span>
                  <span className="rounded-lg px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${task.track.color || '#6366f1'}20`, color: task.track.color || '#818cf8' }}>
                    {task.track.nameAr}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                <span className="text-sm text-gray-400 flex items-center gap-2"><Calendar className="w-4 h-4" />تاريخ الاستحقاق</span>
                <span className={cn('text-sm', isOverdue ? 'text-red-400' : 'text-white')}>{task.dueDate ? formatDate(task.dueDate) : '---'}</span>
              </div>

              <div className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                <span className="text-sm text-gray-400 flex items-center gap-2"><User className="w-4 h-4" />أنشئ بواسطة</span>
                <span className="text-sm text-white">{task.createdBy?.nameAr || task.createdBy?.name || '---'}</span>
              </div>

              <div className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                <span className="text-sm text-gray-400 flex items-center gap-2"><Clock className="w-4 h-4" />تاريخ الإنشاء</span>
                <span className="text-sm text-white" dir="ltr">{task.createdAt ? formatDateTime(task.createdAt) : '---'}</span>
              </div>

              {task.descriptionAr && (
                <div className="bg-white/5 rounded-xl p-3">
                  <span className="text-sm text-gray-400 flex items-center gap-2 mb-2"><FileText className="w-4 h-4" />الوصف</span>
                  <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{task.descriptionAr}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Checklist Tab ── */}
          {activeTab === 'checklist' && (
            <div className="space-y-3">
              {canManageChecklist && (
                <div className="flex gap-2">
                  <input type="text" value={newChecklistTitle} onChange={(e) => setNewChecklistTitle(e.target.value)}
                    placeholder="أضف بند جديد..." className="input-field flex-1 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklist()} />
                  <button onClick={handleAddChecklist} disabled={addingChecklist || !newChecklistTitle.trim()}
                    className="rounded-xl bg-brand-500/20 px-3 py-2 text-brand-300 hover:bg-brand-500/30 disabled:opacity-50 transition-colors">
                    {addingChecklist ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {checklistItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">لا توجد بنود في القائمة</p>
                </div>
              ) : (
                checklistItems.map((item) => (
                  <div key={item.id} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{item.titleAr || item.title}</p>
                        {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
                        <span className={cn('inline-block mt-1.5 px-2 py-0.5 rounded-lg text-[10px] font-medium', CHECKLIST_STATUS_COLORS[item.status] || 'bg-gray-500/20 text-gray-300')}>
                          {CHECKLIST_STATUS_LABELS[item.status] || item.status}
                        </span>
                      </div>
                      {canManageChecklist && (
                        <div className="flex items-center gap-1">
                          <select value={item.status} onChange={(e) => handleChecklistStatus(item.id, e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg text-[10px] text-gray-300 px-1.5 py-1">
                            {Object.entries(CHECKLIST_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button onClick={() => handleDeleteChecklist(item.id)} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Task Updates Tab ── */}
          {activeTab === 'updates' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <textarea value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)}
                  placeholder="أضف تحديث يومي..." rows={2} className="input-field flex-1 text-sm resize-none" />
                <button onClick={handleAddUpdate} disabled={addingUpdate || !newUpdate.trim()}
                  className="rounded-xl bg-brand-500/20 px-3 text-brand-300 hover:bg-brand-500/30 disabled:opacity-50 transition-colors self-end py-2">
                  {addingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>

              {taskUpdates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">لا توجد تحديثات</p>
                </div>
              ) : (
                taskUpdates.map((upd: any) => (
                  <div key={upd.id} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/30 text-[10px] font-bold text-brand-200">
                          {upd.author?.nameAr?.charAt(0) || '?'}
                        </div>
                        <span className="text-xs font-medium text-white">{upd.author?.nameAr || upd.author?.name}</span>
                      </div>
                      <span className="text-[10px] text-gray-500" dir="ltr">{formatDateTime(upd.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{upd.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Admin Notes Tab ── */}
          {activeTab === 'notes' && isAdminOrPm && (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 mb-2">
                <p className="text-xs text-amber-300">ملاحظات خاصة مرئية فقط للإدارة ومدير المشروع</p>
              </div>
              <div className="flex gap-2">
                <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)}
                  placeholder="أضف ملاحظة إدارية..." rows={2} className="input-field flex-1 text-sm resize-none" />
                <button onClick={handleAddNote} disabled={addingNote || !newNote.trim()}
                  className="rounded-xl bg-amber-500/20 px-3 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 transition-colors self-end py-2">
                  {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
              </div>

              {!notesLoaded ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
              ) : adminNotes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">لا توجد ملاحظات إدارية</p>
                </div>
              ) : (
                adminNotes.map((note: any) => (
                  <div key={note.id} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-amber-300">{note.author?.nameAr || note.author?.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500" dir="ltr">{formatDateTime(note.createdAt)}</span>
                        <button onClick={() => handleDeleteNote(note.id)} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Comments Tab ── */}
          {activeTab === 'comments' && <CommentThread entityType="task" entityId={task.id} />}

          {/* ── Audit Tab ── */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              {task.auditLogs && task.auditLogs.length > 0 ? (
                task.auditLogs.map((log) => (
                  <div key={log.id} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <History className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs font-medium text-brand-300">{AUDIT_ACTION_LABELS[log.action] || log.action}</span>
                      </div>
                      <span className="text-[10px] text-gray-500" dir="ltr">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-400">بواسطة {log.actor?.nameAr || log.actor?.name || '---'}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">لا يوجد سجل تعديلات</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
