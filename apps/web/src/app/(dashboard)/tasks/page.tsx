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

  // Load tracks + users for modal
  useEffect(() => {
    const load = async () => {
      try {
        const [tracksRes, usersRes] = await Promise.all([tracksApi.list(), usersApi.list()]);
        setTracks(tracksRes.data?.data || tracksRes.data || []);
        setUsers(usersRes.data?.data || usersRes.data || []);
      } catch {
        // Silent fail
      }
    };
    load();
  }, []);

  // Handlers
  const handleCreate = () => {
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
        {isAdminOrPm && (
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={handleCardClick} />
          ))}
        </div>
      )}

      {/* Task Modal */}
      <TaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        tracks={tracks}
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
