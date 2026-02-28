'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { tracksApi, recordsApi, employeesApi, deliverablesApi, scopesApi, penaltiesApi, trackKpisApi, dailyUpdatesApi, filesApi, tasksApi, usersApi, commentsApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { getSocket, joinTrack, leaveTrack } from '@/lib/socket';
import { STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS, CONTRACT_TYPE_LABELS, formatDate, formatNumber, TASK_STATUS_LABELS, TASK_STATUS_COLORS, cn } from '@/lib/utils';
import {
  Plus, Search, Edit3, Trash2, ChevronLeft, ChevronRight, X,
  Users, Package, Target, AlertTriangle, ClipboardList, ChevronDown,
  BarChart3, FileText, TrendingUp, Upload, Paperclip, Clock, CheckCircle2, AlertCircle, XCircle, Send,
  Download, MessageCircle,
} from 'lucide-react';
import RecordModal from '@/components/record-modal';
import RecordDetailPanel from '@/components/record-detail-panel';
import ScopeBlocksPanel from '@/components/scope-blocks-panel';
import InlineEdit from '@/components/inline-edit';
import toast from 'react-hot-toast';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis } from 'recharts';
import TaskCard from '@/components/tasks/task-card';
import TaskModal from '@/components/tasks/task-modal';
import TaskDetailPanel from '@/components/tasks/task-detail-panel';
import { Task } from '@/stores/tasks';
import CommentThread from '@/components/comments/comment-thread';

interface Track {
  id: string;
  name: string;
  nameAr: string;
  color: string;
  fieldSchema: any;
  employees?: any[];
  deliverables?: any[];
  kpis?: any[];
  penalties?: any[];
  scopes?: any[];
  _count?: any;
}

interface RecordItem {
  id: string;
  title: string;
  titleAr: string;
  status: string;
  priority: string;
  owner: string;
  progress: number;
  version: number;
  dueDate: string;
  extraFields: any;
  createdBy: { id: string; name: string; nameAr: string };
  createdAt: string;
}

interface TrackStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

const STATUS_CHART_COLORS: Record<string, string> = {
  draft: '#6b7280',
  active: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
};

const PRIORITY_CHART_COLORS: Record<string, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

export default function TrackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, hasPermission } = useAuth();
  const [track, setTrack] = useState<Track | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [stats, setStats] = useState<TrackStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<RecordItem | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null);
  const [activeTab, setActiveTab] = useState<'records' | 'tasks' | 'details' | 'stats' | 'scope' | 'updates' | 'comments' | 'attachments'>('records');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Daily updates state
  const [dailyUpdates, setDailyUpdates] = useState<any[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateForm, setUpdateForm] = useState({ titleAr: '', content: '', status: 'in_progress', progress: 0 });
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);

  // Entity CRUD state
  const [entityModal, setEntityModal] = useState<{ type: string; data: any | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; label: string } | null>(null);

  // Tasks state
  const [trackTasks, setTrackTasks] = useState<Task[]>([]);
  const [trackTasksTotal, setTrackTasksTotal] = useState(0);
  const [trackTasksLoading, setTrackTasksLoading] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; nameAr: string }[]>([]);
  const [allTracks, setAllTracks] = useState<{ id: string; nameAr: string; color?: string }[]>([]);

  // Track progress state
  const [trackProgress, setTrackProgress] = useState<any>(null);
  const [trackProgressLoading, setTrackProgressLoading] = useState(false);

  // Track attachments state
  const [trackFiles, setTrackFiles] = useState<any[]>([]);
  const [trackFilesLoading, setTrackFilesLoading] = useState(false);
  const [uploadingTrackFile, setUploadingTrackFile] = useState(false);
  const [trackFileNotes, setTrackFileNotes] = useState('');
  const [deletingTrackFileId, setDeletingTrackFileId] = useState<string | null>(null);

  const canEdit = hasPermission(id, 'edit');
  const canCreate = hasPermission(id, 'create');
  const canDelete = hasPermission(id, 'delete');
  const isAdmin = user?.role === 'admin' || user?.role === 'pm';
  const pageSize = 20;

  const loadTrack = useCallback(async () => {
    try {
      const res = await tracksApi.get(id);
      setTrack(res.data);
    } catch {
      toast.error('فشل تحميل المسار');
    }
  }, [id]);

  const loadRecords = useCallback(async () => {
    try {
      const { data } = await recordsApi.listByTrack(id, {
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setRecords(data.data);
      setTotal(data.total);
    } catch {}
  }, [id, page, search, statusFilter]);

  useEffect(() => {
    const init = async () => {
      try {
        const [trackRes, statsRes] = await Promise.all([
          tracksApi.get(id),
          recordsApi.stats(id).catch(() => ({ data: null })),
        ]);
        setTrack(trackRes.data);
        setStats(statsRes.data);
      } catch {
        toast.error('فشل تحميل المسار');
      }
      setLoading(false);
    };
    init();
    loadRecords();

    joinTrack(id);
    const socket = getSocket();
    socket.on('track.record.created', () => loadRecords());
    socket.on('track.record.updated', () => loadRecords());
    socket.on('track.record.deleted', () => loadRecords());

    return () => {
      leaveTrack(id);
      socket.off('track.record.created');
      socket.off('track.record.updated');
      socket.off('track.record.deleted');
    };
  }, [id, loadRecords]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const loadDailyUpdates = useCallback(async () => {
    setUpdatesLoading(true);
    try {
      const { data } = await dailyUpdatesApi.list({ trackId: id, pageSize: 50 });
      setDailyUpdates(data.data);
    } catch {}
    setUpdatesLoading(false);
  }, [id]);

  useEffect(() => {
    if (activeTab === 'updates') loadDailyUpdates();
  }, [activeTab, loadDailyUpdates]);

  // Load track tasks
  const loadTrackTasks = useCallback(async () => {
    setTrackTasksLoading(true);
    try {
      const params: any = {};
      if (taskStatusFilter) params.status = taskStatusFilter;
      if (taskSearch) params.search = taskSearch;
      const { data } = await tasksApi.byTrack(id, params);
      setTrackTasks(data.data || data || []);
      setTrackTasksTotal(Array.isArray(data) ? data.length : data.total || 0);
    } catch {
      setTrackTasks([]);
    }
    setTrackTasksLoading(false);
  }, [id, taskStatusFilter, taskSearch]);

  useEffect(() => {
    if (activeTab === 'tasks') {
      loadTrackTasks();
      // Load track progress
      setTrackProgressLoading(true);
      tasksApi.trackProgress(id).then(({ data }) => setTrackProgress(data)).catch(() => {}).finally(() => setTrackProgressLoading(false));
    }
  }, [activeTab, loadTrackTasks]);

  // Load users + tracks for task modal
  useEffect(() => {
    if (activeTab === 'tasks' && allUsers.length === 0) {
      Promise.all([usersApi.list(), tracksApi.list()]).then(([uRes, tRes]) => {
        setAllUsers(uRes.data?.data || uRes.data || []);
        setAllTracks(tRes.data?.data || tRes.data || []);
      }).catch(() => {});
    }
  }, [activeTab, allUsers.length]);

  // Load track attachments
  const loadTrackFiles = useCallback(async () => {
    setTrackFilesLoading(true);
    try {
      const { data } = await filesApi.list({ trackId: id, pageSize: 100 });
      setTrackFiles(data.data || []);
    } catch {}
    setTrackFilesLoading(false);
  }, [id]);

  useEffect(() => {
    if (activeTab === 'attachments') loadTrackFiles();
  }, [activeTab, loadTrackFiles]);

  const ALLOWED_TRACK_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'zip'];
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  const handleTrackFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_TRACK_EXTENSIONS.includes(ext)) {
      toast.error(`الصيغة غير مسموح بها. الصيغ المسموحة: ${ALLOWED_TRACK_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('الحد الأقصى لحجم الملف 25 ميجابايت');
      return;
    }

    setUploadingTrackFile(true);
    try {
      await filesApi.upload(file, { trackId: id, category: 'track_attachment', notes: trackFileNotes || undefined });
      toast.success('تم رفع الملف');
      setTrackFileNotes('');
      loadTrackFiles();
    } catch {
      toast.error('فشل رفع الملف');
    }
    setUploadingTrackFile(false);
  };

  const handleDownloadFile = async (fileRecord: any) => {
    try {
      const { data } = await filesApi.download(fileRecord.id);
      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileRecord.fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('فشل تحميل الملف');
    }
  };

  const handleDeleteTrackFile = async (fileId: string) => {
    setDeletingTrackFileId(fileId);
    try {
      await filesApi.delete(fileId);
      toast.success('تم حذف الملف');
      loadTrackFiles();
    } catch {
      toast.error('فشل حذف الملف');
    }
    setDeletingTrackFileId(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const handleSubmitUpdate = async () => {
    if (!updateForm.titleAr.trim() || !updateForm.content.trim()) {
      toast.error('يجب تعبئة العنوان والمحتوى');
      return;
    }
    setSubmittingUpdate(true);
    try {
      // Upload files first
      const uploadedFiles: any[] = [];
      for (const file of updateFiles) {
        const { data } = await filesApi.upload(file, { trackId: id, category: 'daily_update' });
        uploadedFiles.push({
          id: data.id,
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          filePath: data.filePath,
        });
      }

      await dailyUpdatesApi.create({
        title: updateForm.titleAr,
        titleAr: updateForm.titleAr,
        content: updateForm.content,
        contentAr: updateForm.content,
        type: 'track',
        trackId: id,
        status: updateForm.status,
        progress: updateForm.progress,
        attachments: uploadedFiles,
      });

      toast.success('تم إضافة التحديث');
      setShowUpdateForm(false);
      setUpdateForm({ titleAr: '', content: '', status: 'in_progress', progress: 0 });
      setUpdateFiles([]);
      loadDailyUpdates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إضافة التحديث');
    }
    setSubmittingUpdate(false);
  };

  const handleDeleteUpdate = async (updateId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التحديث؟')) return;
    try {
      await dailyUpdatesApi.delete(updateId);
      toast.success('تم حذف التحديث');
      loadDailyUpdates();
    } catch {
      toast.error('فشل حذف التحديث');
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      await recordsApi.delete(recordId);
      toast.success('تم حذف السجل');
      loadRecords();
    } catch {
      toast.error('فشل حذف السجل');
    }
  };

  // Generic entity delete
  const handleEntityDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id: entityId } = deleteConfirm;
    try {
      if (type === 'employee') await employeesApi.delete(entityId);
      else if (type === 'deliverable') await deliverablesApi.delete(entityId);
      else if (type === 'kpi') await trackKpisApi.delete(entityId);
      else if (type === 'penalty') await penaltiesApi.delete(entityId);
      else if (type === 'scope') await scopesApi.delete(entityId);
      toast.success('تم الحذف بنجاح');
      setDeleteConfirm(null);
      loadTrack();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  // Entity save (create/update)
  const handleEntitySave = async (type: string, data: any, editId?: string) => {
    try {
      if (type === 'employee') {
        if (editId) await employeesApi.update(editId, data);
        else await employeesApi.create({ ...data, trackId: id });
      } else if (type === 'deliverable') {
        if (editId) await deliverablesApi.update(editId, data);
        else await deliverablesApi.create({ ...data, trackId: id });
      } else if (type === 'kpi') {
        if (editId) await trackKpisApi.update(editId, data);
        else await trackKpisApi.create({ ...data, trackId: id });
      } else if (type === 'penalty') {
        if (editId) await penaltiesApi.update(editId, data);
        else await penaltiesApi.create({ ...data, trackId: id });
      } else if (type === 'scope') {
        if (editId) await scopesApi.update(editId, data);
        else await scopesApi.create({ ...data, trackId: id });
      }
      toast.success(editId ? 'تم التعديل بنجاح' : 'تمت الإضافة بنجاح');
      setEntityModal(null);
      loadTrack();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشلت العملية');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  // Stats calculations
  const completedCount = stats?.byStatus?.completed || 0;
  const inProgressCount = stats?.byStatus?.in_progress || 0;
  const totalStats = stats?.total || 0;
  const completionRate = totalStats > 0 ? Math.round((completedCount / totalStats) * 100) : 0;

  const statusChartData = stats?.byStatus
    ? Object.entries(stats.byStatus).filter(([, v]) => v > 0).map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v, key: k }))
    : [];

  const priorityChartData = stats?.byPriority
    ? Object.entries(stats.byPriority).filter(([, v]) => v > 0).map(([k, v]) => ({ name: PRIORITY_LABELS[k] || k, value: v, key: k }))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${track?.color}20` }}
          >
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: track?.color }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{track?.nameAr}</h1>
            <p className="text-gray-400 text-sm">{track?.name} · {total} سجل</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => { setEditRecord(null); setModalOpen(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            سجل جديد
          </button>
        )}
      </div>

      {/* Quick Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'إجمالي', value: totalStats, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/20' },
            { label: 'مكتمل', value: completedCount, icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
            { label: 'قيد التنفيذ', value: inProgressCount, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/20' },
            { label: 'الموظفين', value: track?._count?.employees || 0, icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/20' },
            { label: 'الإنجاز', value: `${completionRate}%`, icon: BarChart3, color: 'text-teal-400', bg: 'bg-teal-500/20' },
          ].map((s) => (
            <div key={s.label} className="glass p-3 flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${s.bg}`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold">{typeof s.value === 'number' ? formatNumber(s.value) : s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'records' as const, label: `السجلات (${total})` },
          { key: 'tasks' as const, label: 'المهام' },
          { key: 'updates' as const, label: 'التحديثات اليومية' },
          { key: 'attachments' as const, label: 'المرفقات' },
          { key: 'comments' as const, label: 'التعليقات' },
          { key: 'scope' as const, label: 'نطاق العمل' },
          { key: 'stats' as const, label: 'الإحصائيات' },
          { key: 'details' as const, label: 'تفاصيل المسار' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-brand-500/20 text-brand-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Status Chart */}
            <div className="glass p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                توزيع الحالات
              </h3>
              {statusChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={statusChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                      {statusChartData.map((entry) => (
                        <Cell key={entry.key} fill={STATUS_CHART_COLORS[entry.key] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', direction: 'rtl' }} />
                    <Legend formatter={(value) => <span className="text-xs text-gray-400">{value}</span>} iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-500 text-sm">لا توجد بيانات</div>
              )}
            </div>

            {/* Priority Chart */}
            <div className="glass p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                توزيع الأولويات
              </h3>
              {priorityChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={priorityChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                      {priorityChartData.map((entry) => (
                        <Cell key={entry.key} fill={PRIORITY_CHART_COLORS[entry.key] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', direction: 'rtl' }} />
                    <Legend formatter={(value) => <span className="text-xs text-gray-400">{value}</span>} iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-500 text-sm">لا توجد بيانات</div>
              )}
            </div>
          </div>

          {/* Completion Progress */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">تقدم الإنجاز</h3>
            <div className="flex items-center gap-6">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={track?.color || '#14b8a6'} strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${completionRate * 2.51} 251`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold" style={{ color: track?.color }}>{completionRate}%</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {Object.entries(stats.byStatus || {}).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-20">{STATUS_LABELS[key] || key}</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${totalStats > 0 ? (value / totalStats) * 100 : 0}%`,
                          backgroundColor: STATUS_CHART_COLORS[key] || '#6b7280',
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-300 w-8 text-left">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Header + Add button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {trackTasksTotal > 0 ? `${trackTasksTotal} مهمة` : 'لا توجد مهام'}
            </p>
            {isAdmin && (
              <button
                onClick={() => setTaskModalOpen(true)}
                className="rounded-xl bg-brand-500/20 px-4 py-2.5 text-sm font-medium text-brand-300 hover:bg-brand-500/30 transition-colors flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                إضافة مهمة
              </button>
            )}
          </div>

          {/* Track Progress Dashboard */}
          {trackProgress && !trackProgressLoading && trackProgress.totalTasks > 0 && (
            <div className="space-y-3">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-white">{trackProgress.totalTasks}</p>
                  <p className="text-xs text-gray-400">إجمالي المهام</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{Math.round(trackProgress.weightedProgress)}%</p>
                  <p className="text-xs text-gray-400">التقدم الموزون</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{Math.round(trackProgress.simpleProgress)}%</p>
                  <p className="text-xs text-gray-400">نسبة الإنجاز</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className={cn('text-2xl font-bold', trackProgress.overdueTasks > 0 ? 'text-red-400' : 'text-gray-400')}>{trackProgress.overdueTasks}</p>
                  <p className="text-xs text-gray-400">متأخرة</p>
                </div>
              </div>

              {/* Weighted Progress Bar */}
              <div className="bg-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">شريط التقدم الموزون</span>
                  <span className="text-sm font-medium text-white">{Math.round(trackProgress.weightedProgress)}%</span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden flex">
                  {trackProgress.byStatus?.completed > 0 && (
                    <div className="bg-emerald-500 h-full" style={{ width: `${(trackProgress.byStatus.completed / trackProgress.totalTasks) * 100}%` }} />
                  )}
                  {trackProgress.byStatus?.under_review > 0 && (
                    <div className="bg-orange-500 h-full" style={{ width: `${(trackProgress.byStatus.under_review / trackProgress.totalTasks) * 100}%` }} />
                  )}
                  {trackProgress.byStatus?.in_progress > 0 && (
                    <div className="bg-blue-500 h-full" style={{ width: `${(trackProgress.byStatus.in_progress / trackProgress.totalTasks) * 100}%` }} />
                  )}
                  {trackProgress.byStatus?.delayed > 0 && (
                    <div className="bg-amber-500 h-full" style={{ width: `${(trackProgress.byStatus.delayed / trackProgress.totalTasks) * 100}%` }} />
                  )}
                  {trackProgress.byStatus?.pending > 0 && (
                    <div className="bg-gray-500 h-full" style={{ width: `${(trackProgress.byStatus.pending / trackProgress.totalTasks) * 100}%` }} />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  {trackProgress.byStatus?.completed > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-full bg-emerald-500" />مكتملة: {trackProgress.byStatus.completed}</span>
                  )}
                  {trackProgress.byStatus?.under_review > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-full bg-orange-500" />تحت المراجعة: {trackProgress.byStatus.under_review}</span>
                  )}
                  {trackProgress.byStatus?.in_progress > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-full bg-blue-500" />قيد التنفيذ: {trackProgress.byStatus.in_progress}</span>
                  )}
                  {trackProgress.byStatus?.delayed > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-full bg-amber-500" />متأخرة: {trackProgress.byStatus.delayed}</span>
                  )}
                  {trackProgress.byStatus?.pending > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-full bg-gray-500" />معلقة: {trackProgress.byStatus.pending}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Status Distribution Chart */}
          {trackProgress && trackProgress.totalTasks > 0 && (
            <div className="bg-white/5 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">توزيع حالات المهام</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { name: 'معلقة', value: trackProgress.byStatus?.pending || 0, fill: '#6b7280' },
                  { name: 'قيد التنفيذ', value: trackProgress.byStatus?.in_progress || 0, fill: '#3b82f6' },
                  { name: 'تحت المراجعة', value: trackProgress.byStatus?.under_review || 0, fill: '#f97316' },
                  { name: 'مكتملة', value: trackProgress.byStatus?.completed || 0, fill: '#10b981' },
                  { name: 'متأخرة', value: trackProgress.byStatus?.delayed || 0, fill: '#ef4444' },
                  { name: 'ملغاة', value: trackProgress.byStatus?.cancelled || 0, fill: '#71717a' },
                ].filter(d => d.value > 0)} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                    {[
                      { name: 'معلقة', fill: '#6b7280' },
                      { name: 'قيد التنفيذ', fill: '#3b82f6' },
                      { name: 'تحت المراجعة', fill: '#f97316' },
                      { name: 'مكتملة', fill: '#10b981' },
                      { name: 'متأخرة', fill: '#ef4444' },
                      { name: 'ملغاة', fill: '#71717a' },
                    ].filter((_, i) => {
                      const vals = [trackProgress.byStatus?.pending, trackProgress.byStatus?.in_progress, trackProgress.byStatus?.under_review, trackProgress.byStatus?.completed, trackProgress.byStatus?.delayed, trackProgress.byStatus?.cancelled];
                      return (vals[i] || 0) > 0;
                    }).map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="بحث في المهام..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="input-field pr-10"
              />
            </div>
            <select
              value={taskStatusFilter}
              onChange={(e) => setTaskStatusFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="">كل الحالات</option>
              {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Task Cards */}
          {trackTasksLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : trackTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <ClipboardList className="h-12 w-12" />
              <p className="text-sm">لا توجد مهام لهذا المسار</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trackTasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={setSelectedTask} onStatusChange={loadTrackTasks} />
              ))}
            </div>
          )}

          {/* Task Modal */}
          <TaskModal
            isOpen={taskModalOpen}
            onClose={() => setTaskModalOpen(false)}
            tracks={allTracks.length > 0 ? allTracks : track ? [{ id: track.id, nameAr: track.nameAr, color: track.color }] : []}
            users={allUsers}
            onSuccess={loadTrackTasks}
            defaultTrackId={id}
          />

          {/* Task Detail Panel */}
          {selectedTask && (
            <TaskDetailPanel
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={loadTrackTasks}
            />
          )}
        </div>
      )}

      {/* Scope Blocks Tab */}
      {/* Daily Updates Tab */}
      {activeTab === 'updates' && (
        <div className="space-y-4">
          {/* Add update button */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">التحديثات اليومية</h3>
            <button
              onClick={() => setShowUpdateForm(!showUpdateForm)}
              className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              إضافة تحديث
            </button>
          </div>

          {/* New Update Form */}
          {showUpdateForm && (
            <div className="glass p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">عنوان التحديث</label>
                <input
                  type="text"
                  value={updateForm.titleAr}
                  onChange={(e) => setUpdateForm({ ...updateForm, titleAr: e.target.value })}
                  className="input-field"
                  placeholder="مثال: تحديث أعمال التوزيع..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">تفاصيل التحديث</label>
                <textarea
                  value={updateForm.content}
                  onChange={(e) => setUpdateForm({ ...updateForm, content: e.target.value })}
                  className="input-field min-h-[100px] resize-y"
                  placeholder="اكتب تفاصيل التحديث هنا..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">الحالة</label>
                  <select
                    value={updateForm.status}
                    onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value })}
                    className="input-field"
                  >
                    <option value="in_progress">قيد التنفيذ</option>
                    <option value="completed">مكتمل</option>
                    <option value="delayed">متأخر</option>
                    <option value="rejected">مرفوض</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">نسبة الإنجاز ({updateForm.progress}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={updateForm.progress}
                    onChange={(e) => setUpdateForm({ ...updateForm, progress: parseInt(e.target.value) })}
                    className="w-full accent-brand-500"
                  />
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">المرفقات</label>
                <div className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:border-brand-500/30 transition-colors">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) setUpdateFiles([...updateFiles, ...Array.from(e.target.files)]);
                    }}
                    className="hidden"
                    id="update-files"
                  />
                  <label htmlFor="update-files" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-gray-500" />
                    <span className="text-sm text-gray-400">اضغط لرفع الملفات</span>
                    <span className="text-xs text-gray-500">PDF, Word, Excel, صور</span>
                  </label>
                </div>
                {updateFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {updateFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm text-gray-300">{file.name}</span>
                          <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button onClick={() => setUpdateFiles(updateFiles.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowUpdateForm(false); setUpdateFiles([]); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
                  إلغاء
                </button>
                <button
                  onClick={handleSubmitUpdate}
                  disabled={submittingUpdate}
                  className="btn-primary flex items-center gap-2 px-6 py-2 text-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submittingUpdate ? 'جاري الإرسال...' : 'نشر التحديث'}
                </button>
              </div>
            </div>
          )}

          {/* Updates List */}
          {updatesLoading ? (
            <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
          ) : dailyUpdates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">لا توجد تحديثات بعد</div>
          ) : (
            <div className="space-y-3">
              {dailyUpdates.map((update) => {
                const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
                  completed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'مكتمل' },
                  in_progress: { icon: Clock, color: 'text-amber-400', label: 'قيد التنفيذ' },
                  delayed: { icon: AlertCircle, color: 'text-red-400', label: 'متأخر' },
                  rejected: { icon: XCircle, color: 'text-red-500', label: 'مرفوض' },
                };
                const st = statusConfig[update.status] || statusConfig.in_progress;
                const StatusIcon = st.icon;
                const attachments = (update.attachments as any[]) || [];

                return (
                  <div key={update.id} className="glass p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-300 text-sm font-bold">
                          {(update.author?.nameAr || '؟')[0]}
                        </div>
                        <div>
                          <span className="text-sm text-white font-medium">{update.author?.nameAr || update.author?.name}</span>
                          <span className="text-xs text-gray-500 mr-2">
                            {new Date(update.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/5 ${st.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {st.label}
                        </span>
                        {(update.authorId === user?.id || isAdmin) && (
                          <button onClick={() => handleDeleteUpdate(update.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <h4 className="text-white font-semibold mb-1">{update.titleAr || update.title}</h4>
                    <p className="text-gray-400 text-sm whitespace-pre-wrap leading-relaxed">{update.contentAr || update.content}</p>

                    {/* Progress bar */}
                    {update.progress > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>الإنجاز</span>
                          <span>{update.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all"
                            style={{ width: `${update.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {attachments.map((att: any, i: number) => (
                          <a
                            key={i}
                            href={att.filePath ? `/api/files/download/${att.id}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 transition-colors"
                          >
                            <Paperclip className="w-3 h-3 text-gray-500" />
                            {att.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Attachments Tab */}
      {activeTab === 'attachments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Paperclip className="w-5 h-5 text-brand-300" />
              المرفقات
            </h3>
          </div>

          {/* Upload area */}
          <div className="glass rounded-xl border border-white/10 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="ملاحظات (اختياري)"
                value={trackFileNotes}
                onChange={(e) => setTrackFileNotes(e.target.value)}
                className="input-field flex-1"
              />
              <label className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors',
                uploadingTrackFile ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed' : 'bg-brand-500/20 text-brand-300 hover:bg-brand-500/30'
              )}>
                {uploadingTrackFile ? (
                  <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                رفع ملف
                <input type="file" className="hidden" onChange={handleTrackFileUpload} disabled={uploadingTrackFile}
                  accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip" />
              </label>
            </div>
            <p className="text-[11px] text-gray-500">
              الصيغ المسموحة: PDF, DOCX, XLSX, PPTX, PNG, JPG, ZIP — الحد الأقصى: 25 ميجابايت
            </p>
          </div>

          {/* Files list */}
          {trackFilesLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : trackFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <Paperclip className="h-12 w-12" />
              <p className="text-sm">لا توجد مرفقات بعد</p>
            </div>
          ) : (
            <div className="glass overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-right p-4 text-sm font-medium text-gray-400">اسم الملف</th>
                      <th className="text-right p-4 text-sm font-medium text-gray-400">النوع</th>
                      <th className="text-right p-4 text-sm font-medium text-gray-400">الحجم</th>
                      <th className="text-right p-4 text-sm font-medium text-gray-400">الرافع</th>
                      <th className="text-right p-4 text-sm font-medium text-gray-400">التاريخ</th>
                      <th className="text-right p-4 text-sm font-medium text-gray-400">ملاحظات</th>
                      <th className="text-right p-4 text-sm font-medium text-gray-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackFiles.map((f: any) => (
                      <tr key={f.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="text-sm font-medium truncate max-w-[200px]" dir="ltr">{f.fileName}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded" dir="ltr">
                            {f.fileName?.split('.').pop()?.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-gray-400" dir="ltr">{formatFileSize(f.fileSize)}</td>
                        <td className="p-4 text-sm text-gray-300">{f.uploadedBy?.nameAr || f.uploadedBy?.name || '-'}</td>
                        <td className="p-4 text-sm text-gray-400">{formatDate(f.createdAt)}</td>
                        <td className="p-4 text-sm text-gray-400 max-w-[150px] truncate">{f.notes || '-'}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDownloadFile(f)}
                              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-brand-300 transition-colors"
                              title="تحميل"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteTrackFile(f.id)}
                                disabled={deletingTrackFileId === f.id}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-30"
                                title="حذف"
                              >
                                {deletingTrackFileId === f.id ? (
                                  <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comments Tab */}
      {activeTab === 'comments' && (
        <div className="max-w-3xl">
          <CommentThread entityType="track" entityId={id} />
        </div>
      )}

      {activeTab === 'scope' && track && (
        <ScopeBlocksPanel trackId={id} trackColor={track.color} />
      )}

      {/* Details Tab */}
      {activeTab === 'details' && track && (
        <div className="space-y-4">
          {/* Stat badges */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'الموظفين', count: track._count?.employees || 0, icon: Users, color: 'text-blue-400' },
              { label: 'المخرجات', count: track._count?.deliverables || 0, icon: Package, color: 'text-emerald-400' },
              { label: 'مؤشرات الأداء', count: track._count?.kpis || 0, icon: Target, color: 'text-violet-400' },
              { label: 'الغرامات', count: track._count?.penalties || 0, icon: AlertTriangle, color: 'text-red-400' },
              { label: 'نطاق العمل', count: track._count?.scopes || 0, icon: ClipboardList, color: 'text-amber-400' },
            ].map((s) => (
              <div key={s.label} className="glass px-4 py-3 flex items-center gap-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-sm font-medium">{s.count}</span>
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>

          {/* الموارد البشرية */}
          <DetailSection
            title={`الموارد البشرية (${track.employees?.length || 0})`}
            icon={<Users className="w-4 h-4 text-blue-400" />}
            isOpen={expandedSection === 'employees'}
            onToggle={() => setExpandedSection(expandedSection === 'employees' ? null : 'employees')}
            onAdd={isAdmin ? () => setEntityModal({ type: 'employee', data: null }) : undefined}
          >
            {track.employees && track.employees.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">الاسم</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">المنصب</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">نوع العقد</th>
                      {isAdmin && <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">إجراءات</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {track.employees.map((emp: any) => (
                      <tr key={emp.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: `${track.color}20`, color: track.color }}>
                              {emp.fullNameAr?.charAt(0) || '?'}
                            </div>
                            <div>
                              <InlineEdit
                                value={emp.fullNameAr || ''}
                                onSave={async (v) => { await employeesApi.update(emp.id, { fullNameAr: v }); loadTrack(); }}
                                canEdit={isAdmin}
                                className="font-medium text-sm"
                                autoSave
                              />
                              <InlineEdit
                                value={emp.fullName || ''}
                                onSave={async (v) => { await employeesApi.update(emp.id, { fullName: v }); loadTrack(); }}
                                canEdit={isAdmin}
                                className="text-xs text-gray-500"
                                placeholder="English name"
                                autoSave
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <InlineEdit
                            value={emp.positionAr || emp.position || ''}
                            onSave={async (v) => { await employeesApi.update(emp.id, { positionAr: v }); loadTrack(); }}
                            canEdit={isAdmin}
                            className="text-gray-400 text-sm"
                            placeholder="-"
                            autoSave
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">
                            {CONTRACT_TYPE_LABELS[emp.contractType] || emp.contractType || 'غير محدد'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEntityModal({ type: 'employee', data: emp })}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ type: 'employee', id: emp.id, label: emp.fullNameAr || emp.fullName })}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">لا يوجد موظفين</p>
            )}
          </DetailSection>

          {/* المخرجات - Deliverables */}
          <DetailSection
            title={`المخرجات (${track.deliverables?.length || 0})`}
            icon={<Package className="w-4 h-4 text-emerald-400" />}
            isOpen={expandedSection === 'deliverables'}
            onToggle={() => setExpandedSection(expandedSection === 'deliverables' ? null : 'deliverables')}
            onAdd={isAdmin ? () => setEntityModal({ type: 'deliverable', data: null }) : undefined}
          >
            {track.deliverables && track.deliverables.length > 0 ? (
              <div className="space-y-3">
                {track.deliverables.map((d: any, i: number) => (
                  <div key={d.id} className="p-3 bg-white/5 rounded-lg group/item">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-xs text-emerald-400 font-bold bg-emerald-500/20 rounded px-1.5 py-0.5">{i + 1}</span>
                      <div className="flex-1">
                        <InlineEdit
                          value={d.nameAr || ''}
                          onSave={async (v) => { await deliverablesApi.update(d.id, { nameAr: v }); loadTrack(); }}
                          canEdit={isAdmin}
                          className="font-medium text-sm"
                          autoSave
                        />
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <button onClick={() => setEntityModal({ type: 'deliverable', data: d })} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteConfirm({ type: 'deliverable', id: d.id, label: d.nameAr })} className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                    {d.outputs && (
                      <div className="mr-7">
                        <p className="text-xs text-gray-500 mb-0.5">المخرجات:</p>
                        <p className="text-xs text-gray-400 whitespace-pre-line">{d.outputs}</p>
                      </div>
                    )}
                    {d.deliveryIndicators && (
                      <div className="mr-7 mt-1">
                        <p className="text-xs text-gray-500 mb-0.5">مؤشرات التسليم:</p>
                        <p className="text-xs text-gray-400 whitespace-pre-line">{d.deliveryIndicators}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">لا توجد مخرجات</p>
            )}
          </DetailSection>

          {/* مؤشرات الأداء - KPIs */}
          <DetailSection
            title={`مؤشرات الأداء (${track.kpis?.length || 0})`}
            icon={<Target className="w-4 h-4 text-violet-400" />}
            isOpen={expandedSection === 'kpis'}
            onToggle={() => setExpandedSection(expandedSection === 'kpis' ? null : 'kpis')}
            onAdd={isAdmin ? () => setEntityModal({ type: 'kpi', data: null }) : undefined}
          >
            {track.kpis && track.kpis.length > 0 ? (
              <div className="space-y-2">
                {track.kpis.map((k: any, i: number) => (
                  <div key={k.id} className="p-3 bg-violet-500/5 border border-violet-500/10 rounded-lg text-sm flex items-start gap-2 group/item">
                    <span className="text-xs text-violet-400 font-bold bg-violet-500/20 rounded px-1.5 py-0.5 mt-0.5">{i + 1}</span>
                    <div className="flex-1">
                      <InlineEdit
                        value={k.nameAr || ''}
                        onSave={async (v) => { await trackKpisApi.update(k.id, { nameAr: v }); loadTrack(); }}
                        canEdit={isAdmin}
                        className="whitespace-pre-line text-sm"
                        autoSave
                      />
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => setEntityModal({ type: 'kpi', data: k })} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteConfirm({ type: 'kpi', id: k.id, label: k.nameAr })} className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">لا توجد مؤشرات أداء</p>
            )}
          </DetailSection>

          {/* الغرامات - Penalties */}
          <DetailSection
            title={`الغرامات (${track.penalties?.length || 0})`}
            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
            isOpen={expandedSection === 'penalties'}
            onToggle={() => setExpandedSection(expandedSection === 'penalties' ? null : 'penalties')}
            onAdd={isAdmin ? () => setEntityModal({ type: 'penalty', data: null }) : undefined}
          >
            {track.penalties && track.penalties.length > 0 ? (
              <div className="space-y-2">
                {track.penalties.map((p: any, i: number) => (
                  <div key={p.id} className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-sm flex items-start gap-2 group/item">
                    <span className="text-xs text-red-400 font-bold bg-red-500/20 rounded px-1.5 py-0.5 mt-0.5">{i + 1}</span>
                    <span className="whitespace-pre-line flex-1">{p.violationAr}</span>
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => setEntityModal({ type: 'penalty', data: p })} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteConfirm({ type: 'penalty', id: p.id, label: p.violationAr })} className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">لا توجد غرامات</p>
            )}
          </DetailSection>

          {/* نطاق العمل - Scopes */}
          <DetailSection
            title={`نطاق العمل (${track.scopes?.length || 0})`}
            icon={<ClipboardList className="w-4 h-4 text-amber-400" />}
            isOpen={expandedSection === 'scopes'}
            onToggle={() => setExpandedSection(expandedSection === 'scopes' ? null : 'scopes')}
            onAdd={isAdmin ? () => setEntityModal({ type: 'scope', data: null }) : undefined}
          >
            {track.scopes && track.scopes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {track.scopes.map((s: any, i: number) => (
                  <div key={s.id} className="group/item relative rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 hover:border-amber-500/30 transition-all duration-200">
                    <div className="flex items-start gap-3 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                        style={{ backgroundColor: `${track.color}20`, color: track.color }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm leading-snug">{s.titleAr}</h4>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => setEntityModal({ type: 'scope', data: s })} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteConfirm({ type: 'scope', id: s.id, label: s.titleAr })} className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-xs text-gray-400 leading-relaxed mr-11 whitespace-pre-line line-clamp-3">
                        {s.description}
                      </p>
                    )}
                    <div className="absolute top-0 right-0 w-1 h-full rounded-r-xl" style={{ backgroundColor: `${track.color}40` }} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">لا يوجد نطاق عمل</p>
            )}
          </DetailSection>
        </div>
      )}

      {/* Records Tab */}
      {activeTab === 'records' && <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input-field pr-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-field w-auto"
        >
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Records Table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-right p-4 text-sm font-medium text-gray-400">العنوان</th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">الحالة</th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">الأولوية</th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">المسؤول</th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">التقدم</th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">التاريخ</th>
                {(canEdit || canDelete) && (
                  <th className="text-right p-4 text-sm font-medium text-gray-400">إجراءات</th>
                )}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedRecord(record)}>
                  <td className="p-4">
                    <p className="font-medium">{record.titleAr || record.title}</p>
                    <p className="text-xs text-gray-500">{record.createdBy?.nameAr}</p>
                  </td>
                  <td className="p-4">
                    <span className={`badge ${STATUS_COLORS[record.status] || ''}`}>
                      {STATUS_LABELS[record.status] || record.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`badge ${PRIORITY_COLORS[record.priority] || ''}`}>
                      {PRIORITY_LABELS[record.priority] || record.priority}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-300">{record.owner || '-'}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${record.progress}%`, backgroundColor: track?.color || '#6366f1' }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{record.progress}%</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-400">{formatDate(record.createdAt)}</td>
                  {(canEdit || canDelete) && (
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditRecord(record); setModalOpen(true); }}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    لا توجد سجلات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-white/10">
            <span className="text-sm text-gray-400">
              صفحة {page} من {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Record Modal */}
      {modalOpen && (
        <RecordModal
          trackId={id}
          record={editRecord}
          fieldSchema={track?.fieldSchema}
          onClose={() => { setModalOpen(false); setEditRecord(null); }}
          onSave={() => { setModalOpen(false); setEditRecord(null); loadRecords(); }}
        />
      )}

      {/* Record Detail Panel */}
      {selectedRecord && (
        <RecordDetailPanel
          record={selectedRecord}
          trackId={id}
          canEdit={canEdit}
          onClose={() => setSelectedRecord(null)}
          onUpdate={() => { loadRecords(); }}
        />
      )}
      </>}

      {/* Entity CRUD Modal */}
      {entityModal && (
        <EntityFormModal
          type={entityModal.type}
          data={entityModal.data}
          onClose={() => setEntityModal(null)}
          onSave={handleEntitySave}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="glass p-6 w-full max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-400">تأكيد الحذف</h3>
            <p className="text-sm text-gray-300">
              هل أنت متأكد من حذف <strong>{deleteConfirm.label}</strong>؟
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleEntityDelete}
                className="flex-1 py-2 px-4 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-medium transition-colors"
              >
                نعم، احذف
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 px-4 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 text-sm font-medium transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Section with Add button ───

function DetailSection({ title, icon, isOpen, onToggle, onAdd, children }: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center">
        <button onClick={onToggle} className="flex-1 flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium">{title}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {onAdd && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="ml-2 mr-4 p-1.5 rounded-lg bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-colors"
            title="إضافة"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ─── Entity Form Modal ───

const ENTITY_CONFIG: Record<string, { title: string; titleEdit: string; fields: Array<{ key: string; label: string; type: 'text' | 'textarea' | 'select'; required?: boolean; dir?: string; options?: { value: string; label: string }[] }> }> = {
  employee: {
    title: 'إضافة موظف',
    titleEdit: 'تعديل موظف',
    fields: [
      { key: 'fullNameAr', label: 'الاسم (عربي)', type: 'text', required: true },
      { key: 'fullName', label: 'الاسم (إنجليزي)', type: 'text', required: true, dir: 'ltr' },
      { key: 'positionAr', label: 'المنصب (عربي)', type: 'text' },
      { key: 'position', label: 'المنصب (إنجليزي)', type: 'text', dir: 'ltr' },
      { key: 'contractType', label: 'نوع العقد', type: 'select', options: [
        { value: '', label: 'غير محدد' },
        { value: 'full_time', label: 'دوام كامل' },
        { value: 'part_time', label: 'دوام جزئي' },
        { value: 'contract', label: 'عقد' },
        { value: 'freelance', label: 'مستقل' },
        { value: 'secondment', label: 'إعارة' },
        { value: 'monthly', label: 'شهري' },
        { value: 'seasonal', label: 'موسمي' },
      ]},
    ],
  },
  deliverable: {
    title: 'إضافة مخرج',
    titleEdit: 'تعديل مخرج',
    fields: [
      { key: 'nameAr', label: 'الاسم (عربي)', type: 'text', required: true },
      { key: 'name', label: 'الاسم (إنجليزي)', type: 'text', required: true, dir: 'ltr' },
      { key: 'outputs', label: 'المخرجات', type: 'textarea' },
      { key: 'deliveryIndicators', label: 'مؤشرات التسليم', type: 'textarea' },
    ],
  },
  kpi: {
    title: 'إضافة مؤشر أداء',
    titleEdit: 'تعديل مؤشر أداء',
    fields: [
      { key: 'nameAr', label: 'المؤشر (عربي)', type: 'text', required: true },
      { key: 'name', label: 'المؤشر (إنجليزي)', type: 'text', required: true, dir: 'ltr' },
    ],
  },
  penalty: {
    title: 'إضافة غرامة',
    titleEdit: 'تعديل غرامة',
    fields: [
      { key: 'violationAr', label: 'المخالفة (عربي)', type: 'textarea', required: true },
      { key: 'violation', label: 'المخالفة (إنجليزي)', type: 'textarea', required: true, dir: 'ltr' },
      { key: 'severity', label: 'الشدة', type: 'select', options: [
        { value: '', label: 'غير محدد' },
        { value: 'low', label: 'منخفضة' },
        { value: 'medium', label: 'متوسطة' },
        { value: 'high', label: 'عالية' },
        { value: 'critical', label: 'حرجة' },
      ]},
    ],
  },
  scope: {
    title: 'إضافة نطاق عمل',
    titleEdit: 'تعديل نطاق عمل',
    fields: [
      { key: 'titleAr', label: 'العنوان (عربي)', type: 'text', required: true },
      { key: 'title', label: 'العنوان (إنجليزي)', type: 'text', required: true, dir: 'ltr' },
      { key: 'description', label: 'الوصف', type: 'textarea' },
    ],
  },
};

function EntityFormModal({ type, data, onClose, onSave }: {
  type: string;
  data: any | null;
  onClose: () => void;
  onSave: (type: string, data: any, editId?: string) => Promise<void>;
}) {
  const config = ENTITY_CONFIG[type];
  const isEdit = !!data;
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (data) {
      const initial: Record<string, string> = {};
      config.fields.forEach((f) => { initial[f.key] = data[f.key] || ''; });
      return initial;
    }
    const initial: Record<string, string> = {};
    config.fields.forEach((f) => { initial[f.key] = ''; });
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const requiredFields = config.fields.filter((f) => f.required);
    for (const f of requiredFields) {
      if (!form[f.key]?.trim()) {
        toast.error(`يرجى تعبئة حقل "${f.label}"`);
        return;
      }
    }
    setSaving(true);
    // Build payload — only send non-empty fields
    const payload: Record<string, any> = {};
    config.fields.forEach((f) => {
      if (form[f.key] !== undefined && form[f.key] !== '') {
        payload[f.key] = form[f.key].trim();
      }
    });
    await onSave(type, payload, data?.id);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass p-6 w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">{isEdit ? config.titleEdit : config.title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {config.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                {field.label} {field.required && '*'}
              </label>
              {field.type === 'select' ? (
                <select
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  className="input-field"
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  className="input-field min-h-[80px] resize-y"
                  dir={field.dir}
                />
              ) : (
                <input
                  type="text"
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  className="input-field"
                  dir={field.dir}
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 btn-primary disabled:opacity-50"
            >
              {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 text-sm font-medium transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
