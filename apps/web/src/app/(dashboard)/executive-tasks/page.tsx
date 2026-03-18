'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search,
  ClipboardList,
  CheckCircle2,
  Clock,
  Send,
  FileEdit,
  ShieldCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/stores/auth';
import { executiveTasksApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import ExecutiveTaskModal from '@/components/executive-tasks/executive-task-modal';

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
  sortOrder: number;
  updatedAt?: string;
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  bySheet: Record<string, number>;
  byTrack: Record<string, number>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Send }> = {
  new: { label: 'جديد', color: 'text-violet-400', bg: 'bg-violet-500/15', icon: ClipboardList },
  sent: { label: 'تم الإرسال', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: Send },
  in_progress: { label: 'قيد التنفيذ', color: 'text-amber-400', bg: 'bg-amber-500/15', icon: Clock },
  editing: { label: 'قيد التعديل', color: 'text-orange-400', bg: 'bg-orange-500/15', icon: FileEdit },
  edited: { label: 'تم التعديل', color: 'text-purple-400', bg: 'bg-purple-500/15', icon: FileEdit },
  approved: { label: 'معتمد', color: 'text-green-400', bg: 'bg-green-500/15', icon: ShieldCheck },
  completed: { label: 'مكتملة', color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 },
};

export default function ExecutiveTasksPage() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<ExecutiveTask[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sheets, setSheets] = useState<Array<{ name: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [sheetFilter, setSheetFilter] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [sortBy, setSortBy] = useState('sortOrder');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ExecutiveTask | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ExecutiveTask | null>(null);
  const [deleting, setDeleting] = useState(false);

  const pageSize = 25;

  // Check access
  const hasAccess = user && (user.role === 'admin' || user.role === 'pm');

  const fetchTasks = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try {
      const { data } = await executiveTasksApi.list({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        sheetName: sheetFilter || undefined,
        track: trackFilter || undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      setTasks(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e: any) {
      toast.error('خطأ في تحميل المهام التنفيذية');
    } finally {
      setLoading(false);
    }
  }, [hasAccess, debouncedSearch, statusFilter, sheetFilter, trackFilter, page, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    if (!hasAccess) return;
    try {
      const [statsRes, sheetsRes] = await Promise.all([
        executiveTasksApi.stats(),
        executiveTasksApi.sheets(),
      ]);
      setStats(statsRes.data);
      setSheets(sheetsRes.data);
    } catch {}
  }, [hasAccess]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, sheetFilter, trackFilter]);

  const refresh = () => {
    fetchTasks();
    fetchStats();
  };

  // Unique tracks for filter
  const uniqueTracks = useMemo(() => {
    if (!stats?.byTrack) return [];
    return Object.keys(stats.byTrack).sort();
  }, [stats]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleEdit = (task: ExecutiveTask) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditingTask(null);
    setModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await executiveTasksApi.delete(deleteTarget.id);
      toast.success('تم حذف المهمة بنجاح');
      setDeleteTarget(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-400 text-lg">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">المهام التنفيذية</h1>
          <p className="text-gray-400 mt-1">متابعة المهام والتسليمات التنفيذية لجميع المسارات</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/20"
        >
          <Plus className="w-4 h-4" />
          إضافة مهمة
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="إجمالي المهام" value={stats.total} icon={ClipboardList} color="text-brand-400" bg="bg-brand-500/15" />
          <StatCard label="تم الإرسال" value={stats.byStatus?.sent || 0} icon={Send} color="text-blue-400" bg="bg-blue-500/15" />
          <StatCard label="قيد التنفيذ" value={stats.byStatus?.in_progress || 0} icon={Clock} color="text-amber-400" bg="bg-amber-500/15" />
          <StatCard label="معتمد" value={stats.byStatus?.approved || 0} icon={ShieldCheck} color="text-green-400" bg="bg-green-500/15" />
          <StatCard label="مكتملة" value={stats.byStatus?.completed || 0} icon={CheckCircle2} color="text-emerald-400" bg="bg-emerald-500/15" />
          <StatCard label="قيد التعديل" value={(stats.byStatus?.editing || 0) + (stats.byStatus?.edited || 0)} icon={FileEdit} color="text-orange-400" bg="bg-orange-500/15" />
        </div>
      )}

      {/* Filters */}
      <div className="glass rounded-2xl p-4 border border-white/10">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="بحث في المهام..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
            />
          </div>

          {/* Sheet Filter */}
          <div className="relative">
            <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            <select
              value={sheetFilter}
              onChange={(e) => setSheetFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pr-9 pl-4 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-brand-500/50 min-w-[140px]"
            >
              <option value="">كل الأقسام</option>
              {sheets.map((s) => (
                <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-brand-500/50 min-w-[130px]"
          >
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>

          {/* Track Filter */}
          {uniqueTracks.length > 0 && (
            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-brand-500/50 min-w-[130px]"
            >
              <option value="">كل المسارات</option>
              {uniqueTracks.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          <span className="text-xs text-gray-500 mr-auto">{total} مهمة</span>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <ClipboardList className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-base mb-2">لا توجد مهام تنفيذية</p>
            <p className="text-sm text-gray-600 mb-4">ابدأ بإضافة مهمة جديدة</p>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              إضافة مهمة
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-right py-3 px-4 font-medium text-gray-400 w-8">#</th>
                    <SortHeader label="المهمة" field="name" current={sortBy} order={sortOrder} onSort={handleSort} />
                    <SortHeader label="الحالة" field="status" current={sortBy} order={sortOrder} onSort={handleSort} />
                    <th className="text-right py-3 px-4 font-medium text-gray-400">المسار</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-400">الجهة</th>
                    <SortHeader label="تاريخ الاستلام" field="receiveDate" current={sortBy} order={sortOrder} onSort={handleSort} />
                    <th className="text-right py-3 px-4 font-medium text-gray-400">المتابعة</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-400">القسم</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-400 min-w-[180px]">الملاحظات</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-400 w-24">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task, idx) => {
                    const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.in_progress;
                    const rowNum = (page - 1) * pageSize + idx + 1;
                    return (
                      <tr
                        key={task.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                      >
                        <td className="py-3 px-4 text-gray-500 text-xs">{rowNum}</td>
                        <td className="py-3 px-4 text-white font-medium max-w-[280px]">
                          <span className="line-clamp-2">{task.name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium', sc.bg, sc.color)}>
                            <sc.icon className="w-3 h-3" />
                            {sc.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-xs">{task.track || '—'}</td>
                        <td className="py-3 px-4 text-gray-300 text-xs">{task.entity || '—'}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{formatDate(task.receiveDate)}</td>
                        <td className="py-3 px-4 text-gray-300 text-xs">{task.followUp || task.responsible || '—'}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-white/5 text-gray-400">
                            {task.sheetName}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-xs max-w-[200px]">
                          <span className="line-clamp-2">{task.notes || '—'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEdit(task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                              title="تعديل"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(task)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                <span className="text-xs text-gray-500">صفحة {page} من {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = page <= 3 ? i + 1 : page + i - 2;
                    if (p < 1 || p > totalPages) return null;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                          p === page ? 'bg-brand-500/20 text-brand-300' : 'text-gray-400 hover:bg-white/10'
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <ExecutiveTaskModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        task={editingTask}
        sheets={sheets}
        onSuccess={refresh}
      />

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">تأكيد الحذف</h3>
                <p className="text-sm text-gray-400">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 mb-5 border border-white/5">
              <p className="text-sm text-gray-300 line-clamp-2">{deleteTarget.name}</p>
            </div>

            <p className="text-sm text-gray-400 mb-5">
              هل أنت متأكد من حذف هذه المهمة؟ لا يمكن التراجع عن هذا الإجراء.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                حذف المهمة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function StatCard({ label, value, icon: Icon, color, bg }: {
  label: string;
  value: number;
  icon: any;
  color: string;
  bg: string;
}) {
  return (
    <div className="glass rounded-xl p-4 border border-white/10">
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', bg)}>
          <Icon className={cn('w-5 h-5', color)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function SortHeader({ label, field, current, order, onSort }: {
  label: string;
  field: string;
  current: string;
  order: string;
  onSort: (field: string) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="text-right py-3 px-4 font-medium text-gray-400 cursor-pointer select-none hover:text-white transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn('w-3 h-3', isActive ? 'text-brand-400' : 'opacity-30')} />
      </span>
    </th>
  );
}
