'use client';

import { useState, useEffect, useCallback } from 'react';
import { ganttApi, tracksApi } from '@/lib/api';
import GanttChart, { GanttTask } from '@/components/gantt/gantt-chart';
import toast from 'react-hot-toast';
import {
  X, Save, Trash2, Plus, Link2, Calendar, Users,
  ChevronDown, FileText, Download, Upload,
} from 'lucide-react';

export default function GanttPage() {
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailTab, setDetailTab] = useState<'info' | 'deps' | 'resources'>('info');

  // Form state for create/edit
  const [form, setForm] = useState({
    title: '', titleAr: '', trackId: '', startDate: '', dueDate: '',
    duration: '', isMilestone: false, isSummary: false, parentTaskId: '',
    priority: 'medium', notes: '', progress: 0,
  });

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (selectedTrack) params.trackId = selectedTrack;
      const { data } = await ganttApi.tasks(params);
      setTasks(data);
    } catch (err) {
      toast.error('فشل تحميل المهام');
    } finally {
      setLoading(false);
    }
  }, [selectedTrack]);

  const loadTracks = useCallback(async () => {
    try {
      const { data } = await tracksApi.list();
      setTracks(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    loadTasks();
  }, [selectedTrack]);

  // Task click → open detail panel
  const handleTaskClick = (task: GanttTask) => {
    setSelectedTask(task);
    setDetailTab('info');
  };

  // Create task
  const handleCreate = async () => {
    try {
      if (!form.title || !form.titleAr || !form.trackId) {
        toast.error('العنوان والمسار مطلوبين');
        return;
      }
      await ganttApi.createTask({
        ...form,
        duration: form.duration ? parseFloat(form.duration) : undefined,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        parentTaskId: form.parentTaskId || undefined,
      });
      toast.success('تم إنشاء المهمة');
      setShowCreate(false);
      setForm({ title: '', titleAr: '', trackId: selectedTrack, startDate: '', dueDate: '', duration: '', isMilestone: false, isSummary: false, parentTaskId: '', priority: 'medium', notes: '', progress: 0 });
      loadTasks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إنشاء المهمة');
    }
  };

  // Update task (inline)
  const handleTaskUpdate = async (id: string, data: any) => {
    try {
      await ganttApi.updateTask(id, data);
      loadTasks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل تحديث المهمة');
    }
  };

  // Export MS Project XML
  const handleExport = async () => {
    try {
      const { data } = await ganttApi.exportXML(selectedTrack || undefined);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nusuk-project.xml';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('تم تصدير المشروع بنجاح');
    } catch {
      toast.error('فشل التصدير');
    }
  };

  // Import MS Project XML
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !selectedTrack) {
        toast.error('اختر المسار أولاً');
        return;
      }
      const text = await file.text();
      try {
        const { data } = await ganttApi.importXML(text, selectedTrack);
        toast.success(`تم استيراد ${data.imported} مهمة`);
        loadTasks();
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'فشل الاستيراد');
      }
    };
    input.click();
  };

  // Auto-schedule
  const handleAutoSchedule = async () => {
    if (!selectedTrack) {
      toast.error('اختر مساراً للجدولة التلقائية');
      return;
    }
    try {
      const { data } = await ganttApi.autoSchedule(selectedTrack);
      toast.success(`تمت جدولة ${data.scheduled} مهمة`);
      loadTasks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشلت الجدولة');
    }
  };

  // Set baseline
  const handleSetBaseline = async () => {
    try {
      const { data } = await ganttApi.setBaseline(undefined, selectedTrack || undefined);
      toast.success(`تم تعيين خط الأساس لـ ${data.baselined} مهمة`);
      loadTasks();
    } catch {
      toast.error('فشل تعيين خط الأساس');
    }
  };

  // Save detail edits
  const handleDetailSave = async (field: string, value: any) => {
    if (!selectedTask) return;
    try {
      await ganttApi.updateTask(selectedTask.id, { [field]: value });
      toast.success('تم الحفظ');
      loadTasks();
      // Refresh selected task
      const { data } = await ganttApi.task(selectedTask.id);
      setSelectedTask(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل الحفظ');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/10">
        <h1 className="text-lg font-bold">مخطط جانت</h1>
        <select
          value={selectedTrack}
          onChange={(e) => setSelectedTrack(e.target.value)}
          className="input-field text-sm py-1.5 px-3 w-48"
        >
          <option value="">جميع المسارات</option>
          {tracks.map((t: any) => (
            <option key={t.id} value={t.id}>{t.nameAr || t.name}</option>
          ))}
        </select>
      </div>

      {/* Gantt + Detail Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Gantt */}
        <div className={`flex-1 ${selectedTask ? 'w-[calc(100%-400px)]' : 'w-full'} transition-all`}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">جاري التحميل...</div>
          ) : (
            <GanttChart
              tasks={tasks}
              onTaskClick={handleTaskClick}
              onTaskUpdate={(id, data) => handleTaskUpdate(id, data)}
              onExportXML={handleExport}
              onImportXML={handleImport}
              onAutoSchedule={handleAutoSchedule}
              onSetBaseline={handleSetBaseline}
              onCreateTask={() => { setShowCreate(true); setForm(f => ({ ...f, trackId: selectedTrack })); }}
            />
          )}
        </div>

        {/* Detail Panel */}
        {selectedTask && (
          <div className="w-[400px] flex-shrink-0 border-r border-white/10 bg-gray-900/50 overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 z-10 border-b border-white/10 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm truncate flex-1">
                  {selectedTask.titleAr || selectedTask.title}
                </h3>
                <button onClick={() => setSelectedTask(null)} className="text-gray-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Tabs */}
              <div className="flex gap-2 mt-2">
                {(['info', 'deps', 'resources'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    className={`text-xs px-2 py-1 rounded ${detailTab === tab ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400'}`}
                  >
                    {tab === 'info' ? 'التفاصيل' : tab === 'deps' ? 'الارتباطات' : 'الموارد'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-3 text-sm">
              {detailTab === 'info' && (
                <>
                  {/* Status + Progress */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">الحالة</label>
                      <select
                        value={selectedTask.status}
                        onChange={(e) => handleDetailSave('status', e.target.value)}
                        className="input-field text-xs py-1 w-full"
                      >
                        <option value="pending">معلقة</option>
                        <option value="in_progress">قيد التنفيذ</option>
                        <option value="under_review">تحت المراجعة</option>
                        <option value="completed">مكتملة</option>
                        <option value="delayed">متأخرة</option>
                        <option value="cancelled">ملغاة</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">التقدم</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0} max={100}
                          value={selectedTask.progress}
                          onChange={(e) => handleDetailSave('progress', parseInt(e.target.value))}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-8">{Math.round(selectedTask.progress)}%</span>
                      </div>
                    </div>
                  </div>
                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">تاريخ البداية</label>
                      <input
                        type="date"
                        value={selectedTask.startDate?.split('T')[0] || ''}
                        onChange={(e) => handleDetailSave('startDate', e.target.value)}
                        className="input-field text-xs py-1 w-full"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">تاريخ النهاية</label>
                      <input
                        type="date"
                        value={selectedTask.dueDate?.split('T')[0] || ''}
                        onChange={(e) => handleDetailSave('dueDate', e.target.value)}
                        className="input-field text-xs py-1 w-full"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  {/* Duration + Priority */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">المدة (أيام عمل)</label>
                      <input
                        type="number" min={0}
                        value={selectedTask.duration || ''}
                        onChange={(e) => handleDetailSave('duration', parseFloat(e.target.value) || 0)}
                        className="input-field text-xs py-1 w-full"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">الأولوية</label>
                      <select
                        value={selectedTask.priority}
                        onChange={(e) => handleDetailSave('priority', e.target.value)}
                        className="input-field text-xs py-1 w-full"
                      >
                        <option value="low">منخفضة</option>
                        <option value="medium">متوسطة</option>
                        <option value="high">عالية</option>
                        <option value="critical">حرجة</option>
                      </select>
                    </div>
                  </div>
                  {/* Baseline variance */}
                  {selectedTask.baselineStart && (
                    <div className="bg-white/5 rounded-lg p-3 text-xs">
                      <div className="text-gray-500 mb-1 font-medium">خط الأساس</div>
                      <div className="flex justify-between text-gray-400">
                        <span>البداية: {new Date(selectedTask.baselineStart).toLocaleDateString('ar-SA')}</span>
                        <span>النهاية: {selectedTask.baselineFinish ? new Date(selectedTask.baselineFinish).toLocaleDateString('ar-SA') : '-'}</span>
                      </div>
                    </div>
                  )}
                  {/* Slack */}
                  {(selectedTask.totalSlack != null || selectedTask.freeSlack != null) && (
                    <div className="bg-white/5 rounded-lg p-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">الفائض الإجمالي: <span className="text-white">{selectedTask.totalSlack || 0} يوم</span></span>
                        <span className="text-gray-500">الفائض الحر: <span className="text-white">{selectedTask.freeSlack || 0} يوم</span></span>
                      </div>
                      {selectedTask.isCritical && (
                        <span className="text-red-400 mt-1 block">🔴 مهمة حرجة (على المسار الحرج)</span>
                      )}
                    </div>
                  )}
                  {/* WBS */}
                  {selectedTask.wbs && (
                    <div className="text-xs text-gray-500">
                      WBS: <span className="text-white">{selectedTask.wbs}</span>
                    </div>
                  )}
                </>
              )}

              {detailTab === 'deps' && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 font-medium mb-2">السابقات (Predecessors)</div>
                  {selectedTask.predecessors?.map((dep) => (
                    <div key={dep.id} className="flex items-center justify-between bg-white/5 rounded px-2 py-1.5">
                      <span className="text-xs">{dep.predecessor.titleAr || dep.predecessor.title}</span>
                      <span className="text-[10px] text-gray-400">{dep.type}{dep.lag ? (dep.lag > 0 ? `+${dep.lag}` : dep.lag) : ''}</span>
                    </div>
                  ))}
                  {(!selectedTask.predecessors || selectedTask.predecessors.length === 0) && (
                    <div className="text-xs text-gray-500">لا توجد سابقات</div>
                  )}
                  <div className="text-xs text-gray-500 font-medium mt-3 mb-2">اللاحقات (Successors)</div>
                  {selectedTask.successors?.map((dep) => (
                    <div key={dep.id} className="flex items-center justify-between bg-white/5 rounded px-2 py-1.5">
                      <span className="text-xs">{dep.successor.titleAr || dep.successor.title}</span>
                      <span className="text-[10px] text-gray-400">{dep.type}{dep.lag ? (dep.lag > 0 ? `+${dep.lag}` : dep.lag) : ''}</span>
                    </div>
                  ))}
                  {(!selectedTask.successors || selectedTask.successors.length === 0) && (
                    <div className="text-xs text-gray-500">لا توجد لاحقات</div>
                  )}
                </div>
              )}

              {detailTab === 'resources' && (
                <div className="space-y-2">
                  {selectedTask.resourceAssignments?.map((ra) => (
                    <div key={ra.user.id} className="flex items-center justify-between bg-white/5 rounded px-2 py-1.5">
                      <span className="text-xs">{ra.user.nameAr || ra.user.name}</span>
                    </div>
                  ))}
                  {selectedTask.assignments?.map((a) => (
                    <div key={a.user.id} className="flex items-center justify-between bg-white/5 rounded px-2 py-1.5">
                      <span className="text-xs">{a.user.nameAr || a.user.name}</span>
                    </div>
                  ))}
                  {(!selectedTask.resourceAssignments?.length && !selectedTask.assignments?.length) && (
                    <div className="text-xs text-gray-500">لا توجد موارد معينة</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 w-[500px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">مهمة جديدة</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">العنوان بالعربية *</label>
                  <input value={form.titleAr} onChange={(e) => setForm(f => ({ ...f, titleAr: e.target.value }))} className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Title (EN) *</label>
                  <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="input-field text-sm w-full" dir="ltr" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">المسار *</label>
                <select value={form.trackId} onChange={(e) => setForm(f => ({ ...f, trackId: e.target.value }))} className="input-field text-sm w-full">
                  <option value="">اختر المسار</option>
                  {tracks.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.nameAr || t.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">البداية</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} className="input-field text-sm w-full" dir="ltr" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">النهاية</label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} className="input-field text-sm w-full" dir="ltr" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">المدة (أيام)</label>
                  <input type="number" min={0} value={form.duration} onChange={(e) => setForm(f => ({ ...f, duration: e.target.value }))} className="input-field text-sm w-full" dir="ltr" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">الأولوية</label>
                  <select value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))} className="input-field text-sm w-full">
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                    <option value="critical">حرجة</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">مهمة أب</label>
                  <select value={form.parentTaskId} onChange={(e) => setForm(f => ({ ...f, parentTaskId: e.target.value }))} className="input-field text-sm w-full">
                    <option value="">بدون (جذر)</option>
                    {tasks.filter(t => t.isSummary).map(t => (
                      <option key={t.id} value={t.id}>{t.titleAr || t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={form.isMilestone} onChange={(e) => setForm(f => ({ ...f, isMilestone: e.target.checked }))} />
                  محطة (Milestone)
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={form.isSummary} onChange={(e) => setForm(f => ({ ...f, isSummary: e.target.checked }))} />
                  مهمة ملخصة (Summary)
                </label>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">ملاحظات</label>
                <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field text-sm w-full" rows={2} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleCreate} className="btn-primary flex-1 py-2 text-sm">إنشاء</button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 py-2 text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
