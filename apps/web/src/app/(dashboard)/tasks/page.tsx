'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  ListChecks,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Users,
  User,
  Building2,
  Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Task } from '@/stores/tasks';
import { useTasks } from '@/stores/tasks';
import { useAuth } from '@/stores/auth';
import { tracksApi, usersApi, tasksApi } from '@/lib/api';
import {
  cn,
  formatNumber,
  TASK_STATUS_LABELS,
  PRIORITY_LABELS,
  ASSIGNEE_TYPE_LABELS,
} from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import TaskCard from '@/components/tasks/task-card';
import TaskModal from '@/components/tasks/task-modal';
import TaskDetailPanel from '@/components/tasks/task-detail-panel';

interface Track {
  id: string;
  nameAr: string;
  color?: string;
}

interface UserItem {
  id: string;
  name: string;
  nameAr: string;
}

type TabKey = 'all' | 'my' | 'track' | 'hr';

const TAB_CONFIG: { key: TabKey; label: string; icon: typeof ListChecks; roles?: string[] }[] = [
  { key: 'my', label: 'مهامي', icon: User },
  { key: 'track', label: 'مساري', icon: Users },
  { key: 'hr', label: 'الموارد البشرية', icon: Building2, roles: ['hr', 'admin', 'pm'] },
  { key: 'all', label: 'الكل', icon: Globe, roles: ['admin', 'pm'] },
];

export default function TasksPage() {
  const { user } = useAuth();
  const { stats, statsLoading, fetchStats } = useTasks();

  // Task data (loaded per tab)
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // Filters
  const [activeTab, setActiveTab] = useState<TabKey>('my');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeTypeFilter, setAssigneeTypeFilter] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Lookup data
  const [tracks, setTracks] = useState<Track[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Detail panel state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const isAdminOrPm = user?.role === 'admin' || user?.role === 'pm';
  const canCreateTasks = isAdminOrPm || user?.role === 'track_lead';

  // Determine visible tabs based on role
  const visibleTabs = useMemo(() => {
    return TAB_CONFIG.filter((tab) => {
      if (!tab.roles) return true;
      return tab.roles.includes(user?.role || '');
    });
  }, [user?.role]);

  // Load tasks for current tab with filters
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { tab: activeTab };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (assigneeTypeFilter) params.assigneeType = assigneeTypeFilter;
      if (trackFilter) params.trackId = trackFilter;
      if (debouncedSearch) params.search = debouncedSearch;

      const { data } = await tasksApi.list(params);
      setTasks(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, priorityFilter, assigneeTypeFilter, trackFilter, debouncedSearch]);

  // Load on mount and when filters change
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Load stats (admin/pm only)
  useEffect(() => {
    if (isAdminOrPm) fetchStats();
  }, [isAdminOrPm, fetchStats]);

  // Load tracks + users for modal (independently so one failure doesn't block the other)
  const loadLookups = useCallback(async () => {
    tracksApi.list()
      .then((res) => setTracks(res.data?.data || res.data || []))
      .catch(() => { /* tracks will be empty — modal shows message */ });
    usersApi.list()
      .then((res) => setUsers(res.data?.data || res.data || []))
      .catch(() => { /* users will be empty — modal shows message */ });
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  // Filter tracks for task modal: admin/pm see all, track_lead sees own tracks
  const modalTracks = useMemo(() => {
    let filtered: Track[];
    if (isAdminOrPm) {
      filtered = tracks;
    } else if (user?.role === 'track_lead') {
      const userTrackIds = new Set(user.trackPermissions?.map((tp: any) => tp.trackId) || []);
      filtered = tracks.filter((t) => userTrackIds.has(t.id));
    } else {
      filtered = [];
    }
    return [...filtered].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
  }, [tracks, user, isAdminOrPm]);

  // Handlers
  const handleCreate = () => {
    // Reload tracks if empty (in case initial load failed)
    if (tracks.length === 0) loadLookups();
    setEditingTask(null);
    setModalOpen(true);
  };

  const handleCardClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleModalSuccess = () => {
    loadTasks();
    if (isAdminOrPm) fetchStats();
  };

  const handleDetailUpdate = () => {
    loadTasks();
    if (isAdminOrPm) fetchStats();
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const handleDelete = async (task: Task) => {
    if (!confirm(`هل أنت متأكد من حذف المهمة "${task.titleAr || task.title}"؟`)) return;
    try {
      await tasksApi.delete(task.id);
      toast.success('تم حذف المهمة');
      loadTasks();
      if (isAdminOrPm) fetchStats();
    } catch {
      toast.error('فشل حذف المهمة');
    }
  };

  // All authenticated users can edit/delete tasks
  const canManageTask = useCallback(
    () => !!user,
    [user],
  );

  // Stats values
  const safeStats = stats || { total: 0, byStatus: {}, overdue: 0 };

  const STAT_CARDS = [
    {
      label: 'إجمالي المهام',
      value: formatNumber(safeStats.total || 0),
      icon: ListChecks,
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
    },
    {
      label: 'قيد التنفيذ',
      value: formatNumber(safeStats.byStatus?.in_progress || 0),
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
    },
    {
      label: 'مكتملة',
      value: formatNumber(safeStats.byStatus?.completed || 0),
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/20',
    },
    {
      label: 'متأخرة',
      value: formatNumber(safeStats.overdue || 0),
      icon: AlertTriangle,
      color: 'text-red-400',
      bg: 'bg-red-500/20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">المهام</h1>
          <p className="text-gray-400 mt-1">إدارة ومتابعة المهام والتكليفات</p>
        </div>
        {canCreateTasks && (
          <button
            onClick={handleCreate}
            className="rounded-xl bg-brand-500/20 px-4 py-2.5 text-sm font-medium text-brand-300 hover:bg-brand-500/30 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة مهمة
          </button>
        )}
      </div>

      {/* Stats Cards (admin/pm only) */}
      {isAdminOrPm && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STAT_CARDS.map((stat) => (
            <div key={stat.label} className="glass p-4">
              <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-xl', stat.bg)}>
                  <stat.icon className={cn('w-5 h-5', stat.color)} />
                </div>
                <div className="min-w-0">
                  {statsLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  ) : (
                    <p className="text-lg font-bold truncate">{stat.value}</p>
                  )}
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap',
              activeTab === tab.key
                ? 'bg-brand-500/20 text-brand-300'
                : 'bg-white/5 text-gray-400 hover:bg-white/10',
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث في المهام..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pr-10"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">كل الحالات</option>
          {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">كل الأولويات</option>
          {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        {/* Track filter */}
        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">كل المسارات</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nameAr}
            </option>
          ))}
        </select>

        {/* Assignee type filter (only on 'all' tab) */}
        {activeTab === 'all' && (
          <select
            value={assigneeTypeFilter}
            onChange={(e) => setAssigneeTypeFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="">كل التعيينات</option>
            {Object.entries(ASSIGNEE_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary */}
      <div className="glass p-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">
            عرض {formatNumber(tasks.length)} من {formatNumber(total)} مهمة
          </span>
        </div>
      </div>

      {/* Task Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
          <ListChecks className="h-12 w-12" />
          <p className="text-sm">لا توجد مهام</p>
        </div>
      ) : activeTab === 'all' && !trackFilter ? (
        // Group by track in "all" tab when no track filter
        (() => {
          const grouped = new Map<string, { name: string; color?: string; tasks: Task[] }>();
          const noTrack: Task[] = [];
          tasks.forEach((task) => {
            if (task.track) {
              const group = grouped.get(task.track.id) || { name: task.track.nameAr, color: task.track.color, tasks: [] };
              group.tasks.push(task);
              grouped.set(task.track.id, group);
            } else {
              noTrack.push(task);
            }
          });
          return (
            <div className="space-y-6">
              {Array.from(grouped.entries()).map(([trackId, group]) => (
                <div key={trackId}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: group.color || '#6366f1' }}
                    />
                    <h3 className="text-sm font-semibold text-white">{group.name}</h3>
                    <span className="text-xs text-gray-500">({group.tasks.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={handleCardClick}
                        onStatusChange={loadTasks}
                        onEdit={canManageTask() ? handleEdit : undefined}
                        onDelete={canManageTask() ? handleDelete : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {noTrack.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-3 h-3 rounded-full bg-gray-500" />
                    <h3 className="text-sm font-semibold text-white">بدون مسار</h3>
                    <span className="text-xs text-gray-500">({noTrack.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {noTrack.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={handleCardClick}
                        onStatusChange={loadTasks}
                        onEdit={canManageTask() ? handleEdit : undefined}
                        onDelete={canManageTask() ? handleDelete : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={handleCardClick}
              onStatusChange={loadTasks}
              onEdit={canManageTask() ? handleEdit : undefined}
              onDelete={canManageTask() ? handleDelete : undefined}
            />
          ))}
        </div>
      )}

      {/* Task Modal */}
      <TaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        tracks={modalTracks}
        users={users}
        onSuccess={handleModalSuccess}
      />

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleDetailUpdate}
        />
      )}
    </div>
  );
}
