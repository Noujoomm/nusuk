'use client';

import { useState } from 'react';
import { cn, formatDate, TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, ASSIGNEE_TYPE_LABELS, ASSIGNEE_TYPE_COLORS } from '@/lib/utils';
import { Calendar, Users, User, Building2, Globe, Hash, CheckSquare, RefreshCw, Paperclip, ChevronDown, Loader2 } from 'lucide-react';
import { Task } from '@/stores/tasks';
import { tasksApi } from '@/lib/api';
import toast from 'react-hot-toast';

const STATUS_FLOW: Record<string, string[]> = {
  pending: ['in_progress'],
  in_progress: ['under_review', 'completed', 'delayed'],
  under_review: ['completed', 'in_progress'],
  delayed: ['in_progress', 'completed'],
  completed: [],
  cancelled: [],
};

interface Props {
  task: Task;
  onClick: (task: Task) => void;
  onStatusChange?: () => void;
}

const ASSIGNEE_TYPE_ICONS: Record<string, typeof Users> = {
  TRACK: Users,
  USER: User,
  HR: Building2,
  GLOBAL: Globe,
};

export default function TaskCard({ task, onClick, onStatusChange }: Props) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

  const currentStatus = optimisticStatus || task.status;
  const nextStatuses = STATUS_FLOW[currentStatus] || [];

  const handleStatusChange = async (e: React.MouseEvent, newStatus: string) => {
    e.stopPropagation();
    setStatusOpen(false);
    setUpdating(true);
    setOptimisticStatus(newStatus);
    try {
      await tasksApi.updateStatus(task.id, newStatus);
      toast.success('تم تحديث الحالة');
      onStatusChange?.();
    } catch {
      setOptimisticStatus(null);
      toast.error('فشل تحديث الحالة');
    } finally {
      setUpdating(false);
    }
  };

  const statusLabel = TASK_STATUS_LABELS[currentStatus] || currentStatus;
  const statusColor = TASK_STATUS_COLORS[currentStatus] || 'bg-gray-500/20 text-gray-300';
  const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority;
  const priorityColor = PRIORITY_COLORS[task.priority] || 'bg-gray-500/20 text-gray-300';
  const progress = task.progress ?? 0;

  const assigneeTypeLabel = ASSIGNEE_TYPE_LABELS[task.assigneeType] || task.assigneeType;
  const assigneeTypeColor = ASSIGNEE_TYPE_COLORS[task.assigneeType] || 'bg-gray-500/20 text-gray-300';
  const AssigneeIcon = ASSIGNEE_TYPE_ICONS[task.assigneeType] || Globe;

  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    currentStatus !== 'completed' &&
    currentStatus !== 'cancelled';

  // Determine assignee display name
  let assigneeName = '';
  if (task.assigneeType === 'TRACK' && task.assigneeTrack) {
    assigneeName = task.assigneeTrack.nameAr;
  } else if (task.assigneeType === 'USER' && task.assigneeUser) {
    assigneeName = task.assigneeUser.nameAr || task.assigneeUser.name;
  }

  return (
    <button
      onClick={() => onClick(task)}
      className={cn(
        'glass rounded-2xl border border-white/10 p-6 text-right transition-all duration-200 hover:bg-white/10 w-full',
        isOverdue && 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
      )}
    >
      {/* Header: Title + Badges */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white truncate mb-3">
          {task.titleAr || task.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Inline status dropdown */}
          <div className="relative">
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (nextStatuses.length > 0) setStatusOpen(!statusOpen);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium inline-flex items-center gap-1 transition-all duration-200',
                statusColor,
                nextStatuses.length > 0 && 'cursor-pointer hover:opacity-80',
              )}
            >
              {updating && <Loader2 className="h-3 w-3 animate-spin" />}
              {statusLabel}
              {nextStatuses.length > 0 && !updating && <ChevronDown className="h-3 w-3" />}
            </span>
            {statusOpen && nextStatuses.length > 0 && (
              <div className="absolute top-full right-0 mt-1 z-20 bg-gray-900 border border-white/10 rounded-xl overflow-hidden shadow-xl min-w-[140px]">
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => handleStatusChange(e, s)}
                    className={cn(
                      'w-full text-right px-3 py-2 text-xs font-medium hover:bg-white/10 transition-colors flex items-center gap-2',
                      TASK_STATUS_COLORS[s]?.replace(/bg-\S+/, ''),
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', TASK_STATUS_COLORS[s]?.split(' ')[0]?.replace('/20', ''))} />
                    {TASK_STATUS_LABELS[s] || s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={cn('rounded-full px-3 py-1 text-xs font-medium', priorityColor)}>
            {priorityLabel}
          </span>
          <span className={cn('rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1', assigneeTypeColor)}>
            <AssigneeIcon className="h-3 w-3" />
            {assigneeTypeLabel}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">التقدم</span>
          <span className="text-xs font-bold text-white">{progress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              progress >= 100
                ? 'bg-emerald-400'
                : progress >= 50
                  ? 'bg-brand-400'
                  : 'bg-amber-400',
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Footer: Assignee + Due Date */}
      <div className="flex items-center justify-between">
        {/* Assignee info */}
        <div className="flex items-center gap-1.5">
          {assigneeName ? (
            <span className="text-xs text-gray-300 truncate max-w-[140px]">
              {assigneeName}
            </span>
          ) : task.assignments && task.assignments.length > 0 ? (
            <div className="flex items-center -space-x-2 rtl:space-x-reverse">
              {task.assignments.slice(0, 3).map((a) => {
                const initial = a.user?.nameAr?.charAt(0) || a.user?.name?.charAt(0) || '?';
                return (
                  <div
                    key={a.id}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-900 bg-brand-500/30 text-[10px] font-bold text-brand-200"
                    title={a.user?.nameAr || a.user?.name}
                  >
                    {initial}
                  </div>
                );
              })}
              {task.assignments.length > 3 && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-900 bg-white/10 text-[10px] font-medium text-gray-400">
                  +{task.assignments.length - 3}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-gray-500">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">{task.assigneeType === 'GLOBAL' ? 'عام' : task.assigneeType === 'HR' ? 'HR' : 'غير معين'}</span>
            </div>
          )}
        </div>

        {/* Due Date */}
        {task.dueDate && (
          <div
            className={cn(
              'flex items-center gap-1.5 text-xs',
              isOverdue ? 'text-red-400' : 'text-gray-400',
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDate(task.dueDate)}</span>
          </div>
        )}
      </div>

      {/* Track + Scope + Counts */}
      <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 flex-wrap">
        {task.track && (
          <span
            className="inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `${task.track.color || '#6366f1'}20`,
              color: task.track.color || '#818cf8',
            }}
          >
            {task.track.nameAr}
          </span>
        )}
        {task.scopeBlock && (
          <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium bg-brand-500/10 text-brand-300 font-mono">
            <Hash className="h-2.5 w-2.5" />
            {task.scopeBlock.code}
          </span>
        )}
        {(task._count?.checklist || 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
            <CheckSquare className="h-2.5 w-2.5" />{task._count?.checklist}
          </span>
        )}
        {(task._count?.taskUpdates || 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
            <RefreshCw className="h-2.5 w-2.5" />{task._count?.taskUpdates}
          </span>
        )}
        {(task._count?.files || 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
            <Paperclip className="h-2.5 w-2.5" />{task._count?.files}
          </span>
        )}
      </div>
    </button>
  );
}
