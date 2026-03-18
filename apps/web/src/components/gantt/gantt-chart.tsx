'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ZoomIn, ZoomOut, Calendar, Download, Upload, Play,
  Milestone, FolderOpen, CheckCircle2, Clock, AlertTriangle,
  Plus, Link2, Trash2, Settings, FileText,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

// ─── Types ───

export interface GanttTask {
  id: string;
  title: string;
  titleAr: string;
  startDate: string | null;
  dueDate: string | null;
  duration: number | null;
  progress: number;
  status: string;
  priority: string;
  isMilestone: boolean;
  isSummary: boolean;
  parentTaskId: string | null;
  outlineLevel: number;
  wbs: string | null;
  sortOrder: number;
  isCritical: boolean;
  baselineStart: string | null;
  baselineFinish: string | null;
  freeSlack: number | null;
  totalSlack: number | null;
  tags: string[];
  track?: { id: string; name: string; nameAr: string; color: string };
  assigneeUser?: { id: string; name: string; nameAr: string } | null;
  resourceAssignments?: Array<{ user: { id: string; name: string; nameAr: string } }>;
  assignments?: Array<{ user: { id: string; name: string; nameAr: string } }>;
  predecessors?: Array<{
    id: string;
    type: string;
    lag: number;
    predecessor: { id: string; title: string; titleAr: string };
  }>;
  successors?: Array<{
    id: string;
    type: string;
    lag: number;
    successor: { id: string; title: string; titleAr: string };
  }>;
  childTasks?: Array<{ id: string }>;
  // UI state
  _expanded?: boolean;
  _visible?: boolean;
  _indent?: number;
}

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface GanttChartProps {
  tasks: GanttTask[];
  onTaskClick?: (task: GanttTask) => void;
  onTaskUpdate?: (id: string, data: Partial<GanttTask>) => void;
  onTaskDelete?: (task: GanttTask) => void;
  onExportXML?: () => void;
  onExportCSV?: () => void;
  onImportXML?: () => void;
  onAutoSchedule?: () => void;
  onSetBaseline?: () => void;
  onCreateTask?: () => void;
}

// ─── Constants ───

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 60;
const GRID_MIN_WIDTH = 500;
const STATUS_COLORS: Record<string, string> = {
  new: '#7C3AED',
  pending: '#6B7280',
  in_progress: '#3B82F6',
  under_review: '#F59E0B',
  completed: '#10B981',
  delayed: '#EF4444',
  cancelled: '#9CA3AF',
  scheduled: '#06B6D4',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#6B7280',
  medium: '#3B82F6',
  high: '#F59E0B',
  critical: '#EF4444',
};

const ZOOM_CONFIG: Record<ZoomLevel, { cellWidth: number; format: string; subFormat: string }> = {
  day: { cellWidth: 40, format: 'MMM yyyy', subFormat: 'd' },
  week: { cellWidth: 80, format: 'MMM yyyy', subFormat: 'W' },
  month: { cellWidth: 100, format: 'yyyy', subFormat: 'MMM' },
  quarter: { cellWidth: 120, format: 'yyyy', subFormat: 'Q' },
  year: { cellWidth: 200, format: '', subFormat: 'yyyy' },
};

// ─── Helpers ───

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (86400000));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getDateRange(tasks: GanttTask[]): { start: Date; end: Date } {
  let min = new Date();
  let max = new Date();
  let hasDate = false;

  for (const t of tasks) {
    if (t.startDate) {
      const d = new Date(t.startDate);
      if (!hasDate || d < min) min = d;
      hasDate = true;
    }
    if (t.dueDate) {
      const d = new Date(t.dueDate);
      if (!hasDate || d > max) max = d;
      hasDate = true;
    }
  }

  // Add padding
  min = addDays(min, -7);
  max = addDays(max, 14);
  return { start: min, end: max };
}

function buildTree(tasks: GanttTask[]): GanttTask[] {
  const result: GanttTask[] = [];
  const childMap = new Map<string | null, GanttTask[]>();

  for (const t of tasks) {
    const key = t.parentTaskId || null;
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key)!.push(t);
  }

  const addChildren = (parentId: string | null, level: number) => {
    const children = childMap.get(parentId) || [];
    children.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const child of children) {
      child._indent = level;
      child._expanded = child._expanded ?? true;
      child._visible = true;
      result.push(child);
      if (child._expanded && child.isSummary) {
        addChildren(child.id, level + 1);
      }
    }
  };

  addChildren(null, 0);
  return result;
}

function getTimeUnits(start: Date, end: Date, zoom: ZoomLevel): Date[] {
  const units: Date[] = [];
  const current = new Date(start);

  switch (zoom) {
    case 'day':
      while (current <= end) {
        units.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      break;
    case 'week':
      current.setDate(current.getDate() - current.getDay());
      while (current <= end) {
        units.push(new Date(current));
        current.setDate(current.getDate() + 7);
      }
      break;
    case 'month':
      current.setDate(1);
      while (current <= end) {
        units.push(new Date(current));
        current.setMonth(current.getMonth() + 1);
      }
      break;
    case 'quarter':
      current.setDate(1);
      current.setMonth(Math.floor(current.getMonth() / 3) * 3);
      while (current <= end) {
        units.push(new Date(current));
        current.setMonth(current.getMonth() + 3);
      }
      break;
    case 'year':
      current.setMonth(0, 1);
      while (current <= end) {
        units.push(new Date(current));
        current.setFullYear(current.getFullYear() + 1);
      }
      break;
  }

  return units;
}

function formatTimeUnit(date: Date, zoom: ZoomLevel): string {
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  switch (zoom) {
    case 'day': return `${date.getDate()}`;
    case 'week': return `${date.getDate()}/${date.getMonth() + 1}`;
    case 'month': return months[date.getMonth()]?.slice(0, 3) || '';
    case 'quarter': return `Q${Math.floor(date.getMonth() / 3) + 1}`;
    case 'year': return `${date.getFullYear()}`;
  }
}

function formatHeaderGroup(date: Date, zoom: ZoomLevel): string {
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  switch (zoom) {
    case 'day': return `${months[date.getMonth()]} ${date.getFullYear()}`;
    case 'week': return `${months[date.getMonth()]} ${date.getFullYear()}`;
    case 'month': return `${date.getFullYear()}`;
    case 'quarter': return `${date.getFullYear()}`;
    case 'year': return '';
  }
}

// ─── Component ───

export default function GanttChart({
  tasks,
  onTaskClick,
  onTaskUpdate,
  onTaskDelete,
  onExportXML,
  onExportCSV,
  onImportXML,
  onAutoSchedule,
  onSetBaseline,
  onCreateTask,
}: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [gridWidth, setGridWidth] = useState(GRID_MIN_WIDTH);
  const [draggingTask, setDraggingTask] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: GanttTask } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, task: GanttTask) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  }, []);

  // Process tasks into visible tree
  const visibleTasks = useMemo(() => {
    const withExpanded = tasks.map((t) => ({
      ...t,
      _expanded: expandedIds.has(t.id) || (!t.parentTaskId && t.isSummary),
    }));
    return buildTree(withExpanded);
  }, [tasks, expandedIds]);

  const { start: dateStart, end: dateEnd } = useMemo(() => getDateRange(tasks), [tasks]);
  const timeUnits = useMemo(() => getTimeUnits(dateStart, dateEnd, zoom), [dateStart, dateEnd, zoom]);
  const cellWidth = ZOOM_CONFIG[zoom].cellWidth;
  const totalChartWidth = timeUnits.length * cellWidth;

  // Toggle expand
  const toggleExpand = useCallback((taskId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Scroll to today
  const scrollToToday = useCallback(() => {
    if (!scrollRef.current) return;
    const today = new Date();
    const daysFromStart = daysBetween(dateStart, today);
    const px = daysFromStart * (cellWidth / (zoom === 'week' ? 7 : zoom === 'month' ? 30 : zoom === 'quarter' ? 90 : zoom === 'year' ? 365 : 1));
    scrollRef.current.scrollLeft = Math.max(0, px - scrollRef.current.clientWidth / 2);
  }, [dateStart, cellWidth, zoom]);

  useEffect(() => {
    scrollToToday();
  }, [zoom]);

  // Calculate bar position
  const getBarStyle = useCallback(
    (task: GanttTask): { left: number; width: number } | null => {
      if (!task.startDate && !task.dueDate) return null;
      const start = task.startDate ? new Date(task.startDate) : new Date(task.dueDate!);
      const end = task.dueDate ? new Date(task.dueDate) : new Date(task.startDate!);
      const startDays = daysBetween(dateStart, start);
      const endDays = daysBetween(dateStart, end);

      const pxPerDay = cellWidth / (zoom === 'week' ? 7 : zoom === 'month' ? 30 : zoom === 'quarter' ? 90 : zoom === 'year' ? 365 : 1);
      const left = startDays * pxPerDay;
      const width = Math.max((endDays - startDays + 1) * pxPerDay, task.isMilestone ? 16 : 20);
      return { left, width };
    },
    [dateStart, cellWidth, zoom],
  );

  // Today line position
  const todayPx = useMemo(() => {
    const days = daysBetween(dateStart, new Date());
    const pxPerDay = cellWidth / (zoom === 'week' ? 7 : zoom === 'month' ? 30 : zoom === 'quarter' ? 90 : zoom === 'year' ? 365 : 1);
    return days * pxPerDay;
  }, [dateStart, cellWidth, zoom]);

  const getResources = (task: GanttTask): string => {
    const names: string[] = [];
    if (task.assigneeUser) names.push(task.assigneeUser.nameAr || task.assigneeUser.name);
    task.resourceAssignments?.forEach((ra) => names.push(ra.user.nameAr || ra.user.name));
    task.assignments?.forEach((a) => {
      if (!names.includes(a.user.nameAr || a.user.name)) names.push(a.user.nameAr || a.user.name);
    });
    return names.join(', ');
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/10">
        {onCreateTask && (
          <button onClick={onCreateTask} className="btn-primary text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> مهمة جديدة
          </button>
        )}
        {onCreateTask && <div className="h-5 w-px bg-white/10" />}
        {/* Zoom */}
        {(['day', 'week', 'month', 'quarter', 'year'] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-2 py-1 text-xs rounded ${zoom === z ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-white'}`}
          >
            {z === 'day' ? 'يوم' : z === 'week' ? 'أسبوع' : z === 'month' ? 'شهر' : z === 'quarter' ? 'ربع' : 'سنة'}
          </button>
        ))}
        <div className="h-5 w-px bg-white/10" />
        <button onClick={scrollToToday} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1">
          <Calendar className="h-3.5 w-3.5" /> اليوم
        </button>
        <div className="flex-1" />
        {onAutoSchedule && (
          <button onClick={onAutoSchedule} className="text-xs text-gray-400 hover:text-emerald-400 flex items-center gap-1 px-2 py-1">
            <Play className="h-3.5 w-3.5" /> جدولة تلقائية
          </button>
        )}
        {onSetBaseline && (
          <button onClick={onSetBaseline} className="text-xs text-gray-400 hover:text-blue-400 flex items-center gap-1 px-2 py-1">
            <Settings className="h-3.5 w-3.5" /> خط الأساس
          </button>
        )}
        <button onClick={onExportXML} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1">
          <Download className="h-3.5 w-3.5" /> XML
        </button>
        <button onClick={onExportCSV} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        {onImportXML && (
          <button onClick={onImportXML} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1">
            <Upload className="h-3.5 w-3.5" /> استيراد (XML/CSV/JSON)
          </button>
        )}
      </div>

      {/* Main area: Grid + Chart */}
      <div className="flex flex-1 overflow-hidden">
        {/* Grid (Left side) */}
        <div className="flex-shrink-0 overflow-y-auto border-l border-white/10" style={{ width: gridWidth }}>
          {/* Grid Header */}
          <div className="sticky top-0 z-20 bg-gray-900 border-b border-white/10" style={{ height: HEADER_HEIGHT }}>
            <div className="flex items-center h-full text-xs text-gray-400 font-medium">
              <div className="w-12 text-center">#</div>
              <div className="flex-1 pr-2">المهمة</div>
              <div className="w-20 text-center">البداية</div>
              <div className="w-20 text-center">النهاية</div>
              <div className="w-14 text-center">المدة</div>
              <div className="w-14 text-center">التقدم</div>
            </div>
          </div>

          {/* Grid Rows */}
          {visibleTasks.map((task, idx) => (
            <div
              key={task.id}
              className={`flex items-center border-b border-white/5 hover:bg-white/5 cursor-pointer text-xs group/row ${
                task.isCritical ? 'bg-red-500/5' : ''
              }`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => onTaskClick?.(task)}
              onContextMenu={(e) => handleContextMenu(e, task)}
            >
              <div className="w-12 text-center text-gray-500 relative">
                <span className="group-hover/row:hidden">{idx + 1}</span>
                {onTaskDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onTaskDelete(task); }}
                    className="hidden group-hover/row:inline-flex items-center justify-center text-red-400 hover:text-red-300"
                    title="حذف المهمة"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex-1 flex items-center gap-1 pr-2 truncate" style={{ paddingRight: (task._indent || 0) * 16 + 8 }}>
                {task.isSummary && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                    className="text-gray-400 hover:text-white"
                  >
                    {expandedIds.has(task.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
                  </button>
                )}
                {task.isMilestone ? (
                  <Milestone className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                ) : task.isSummary ? (
                  <FolderOpen className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                ) : null}
                {task.track && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.track.color }} />
                )}
                <span className={`truncate ${task.isSummary ? 'font-semibold' : ''} ${task.isCritical ? 'text-red-300' : ''}`}>
                  {task.titleAr || task.title}
                </span>
              </div>
              <div className="w-20 text-center text-gray-400">
                {task.startDate ? new Date(task.startDate).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }) : '-'}
              </div>
              <div className="w-20 text-center text-gray-400">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }) : '-'}
              </div>
              <div className="w-14 text-center text-gray-400">
                {task.isMilestone ? '◆' : task.duration ? `${task.duration}ي` : '-'}
              </div>
              <div className="w-14 text-center">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: `${STATUS_COLORS[task.status]}30`, color: STATUS_COLORS[task.status] }}
                >
                  {Math.round(task.progress)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Resize handle */}
        <div
          className="w-1 bg-white/10 hover:bg-emerald-500/50 cursor-col-resize flex-shrink-0"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startW = gridWidth;
            const onMove = (ev: MouseEvent) => {
              setGridWidth(Math.max(300, Math.min(800, startW + (ev.clientX - startX))));
            };
            const onUp = () => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
        />

        {/* Chart (Right side) */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalChartWidth, minHeight: '100%' }} className="relative">
            {/* Time header */}
            <div className="sticky top-0 z-10 bg-gray-900 border-b border-white/10" style={{ height: HEADER_HEIGHT }}>
              {/* Group row */}
              <div className="flex h-1/2 border-b border-white/5">
                {timeUnits.map((unit, i) => {
                  const group = formatHeaderGroup(unit, zoom);
                  const showGroup = i === 0 || formatHeaderGroup(timeUnits[i - 1], zoom) !== group;
                  if (!showGroup || !group) return null;
                  // Count how many units in this group
                  let count = 0;
                  for (let j = i; j < timeUnits.length && formatHeaderGroup(timeUnits[j], zoom) === group; j++) count++;
                  return (
                    <div
                      key={i}
                      className="text-[11px] text-gray-400 flex items-center justify-center border-l border-white/5"
                      style={{ width: count * cellWidth, position: 'absolute', right: i * cellWidth }}
                    >
                      {group}
                    </div>
                  );
                })}
              </div>
              {/* Unit row */}
              <div className="flex h-1/2">
                {timeUnits.map((unit, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-gray-500 flex items-center justify-center border-l border-white/5 flex-shrink-0"
                    style={{ width: cellWidth }}
                  >
                    {formatTimeUnit(unit, zoom)}
                  </div>
                ))}
              </div>
            </div>

            {/* Today line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-emerald-500/60 z-10"
              style={{ right: todayPx }}
            >
              <div className="absolute -top-0 -right-2 bg-emerald-500 text-white text-[9px] px-1 rounded-b">
                اليوم
              </div>
            </div>

            {/* Task rows */}
            {visibleTasks.map((task, idx) => {
              const bar = getBarStyle(task);
              const y = HEADER_HEIGHT + idx * ROW_HEIGHT;

              return (
                <div
                  key={task.id}
                  className="absolute w-full border-b border-white/5"
                  style={{ top: y, height: ROW_HEIGHT }}
                >
                  {/* Alternating stripe */}
                  {idx % 2 === 1 && <div className="absolute inset-0 bg-white/[0.02]" />}

                  {bar && (
                    <>
                      {/* Baseline bar (if exists) */}
                      {task.baselineStart && task.baselineFinish && (() => {
                        const blBar = getBarStyle({
                          ...task,
                          startDate: task.baselineStart,
                          dueDate: task.baselineFinish,
                        });
                        if (!blBar) return null;
                        return (
                          <div
                            className="absolute rounded-sm opacity-30"
                            style={{
                              right: blBar.left,
                              width: blBar.width,
                              top: ROW_HEIGHT - 8,
                              height: 4,
                              backgroundColor: '#6B7280',
                            }}
                          />
                        );
                      })()}

                      {/* Main bar */}
                      {task.isMilestone ? (
                        <div
                          className="absolute cursor-pointer"
                          style={{ right: bar.left - 6, top: (ROW_HEIGHT - 14) / 2 }}
                          onClick={() => onTaskClick?.(task)}
                        >
                          <div
                            className="w-3.5 h-3.5 rotate-45 border-2"
                            style={{
                              backgroundColor: task.progress >= 100 ? '#10B981' : '#F59E0B',
                              borderColor: task.isCritical ? '#EF4444' : 'transparent',
                            }}
                          />
                        </div>
                      ) : task.isSummary ? (
                        <div
                          className="absolute cursor-pointer"
                          style={{ right: bar.left, width: bar.width, top: (ROW_HEIGHT - 8) / 2, height: 8 }}
                          onClick={() => onTaskClick?.(task)}
                        >
                          <div className="h-full rounded-sm bg-blue-500/40 relative">
                            {/* Summary endpoints */}
                            <div className="absolute -right-1 top-0 w-2 h-full bg-blue-500 rounded-r" />
                            <div className="absolute -left-1 top-0 w-2 h-full bg-blue-500 rounded-l" />
                            {/* Progress fill */}
                            <div
                              className="absolute top-0 right-0 h-full bg-blue-500 rounded-sm"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div
                          className="absolute cursor-grab active:cursor-grabbing group"
                          style={{ right: bar.left, width: bar.width, top: (ROW_HEIGHT - 18) / 2, height: 18 }}
                          onClick={() => onTaskClick?.(task)}
                          onContextMenu={(e) => handleContextMenu(e, task)}
                          draggable
                          onDragStart={(e) => {
                            setDraggingTask(task.id);
                            e.dataTransfer.setData('text/plain', task.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={(e) => {
                            if (draggingTask && onTaskUpdate) {
                              const chartRect = scrollRef.current?.getBoundingClientRect();
                              if (chartRect) {
                                const pxPerDay = cellWidth / (zoom === 'week' ? 7 : zoom === 'month' ? 30 : zoom === 'quarter' ? 90 : zoom === 'year' ? 365 : 1);
                                const deltaX = e.clientX - (chartRect.right - bar.left - bar.width / 2);
                                const deltaDays = Math.round(deltaX / pxPerDay);
                                if (Math.abs(deltaDays) >= 1 && task.startDate && task.dueDate) {
                                  const newStart = new Date(task.startDate);
                                  newStart.setDate(newStart.getDate() + deltaDays);
                                  const newEnd = new Date(task.dueDate);
                                  newEnd.setDate(newEnd.getDate() + deltaDays);
                                  onTaskUpdate(task.id, {
                                    startDate: newStart.toISOString(),
                                    dueDate: newEnd.toISOString(),
                                  } as any);
                                }
                              }
                            }
                            setDraggingTask(null);
                          }}
                        >
                          {/* Bar bg */}
                          <div
                            className={`h-full rounded-md relative overflow-hidden transition-shadow ${draggingTask === task.id ? 'shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-500/50' : ''}`}
                            style={{
                              backgroundColor: `${task.track?.color || '#10B981'}30`,
                              border: task.isCritical ? '1px solid rgba(239,68,68,0.5)' : '1px solid transparent',
                            }}
                          >
                            {/* Progress fill */}
                            <div
                              className="absolute top-0 right-0 h-full rounded-md transition-all"
                              style={{
                                width: `${task.progress}%`,
                                backgroundColor: task.track?.color || '#10B981',
                                opacity: 0.7,
                              }}
                            />
                            {/* Label */}
                            <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-white truncate">
                              {bar.width > 60 ? (task.titleAr || task.title) : ''}
                            </span>
                          </div>
                          {/* Resource label outside bar */}
                          {bar.width > 30 && (
                            <span className="absolute left-0 top-0 -translate-x-full text-[9px] text-gray-500 whitespace-nowrap px-1">
                              {getResources(task)}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {/* Grid lines */}
            {timeUnits.map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l border-white/5"
                style={{ right: i * cellWidth }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-white/5 border-t border-white/10 text-[10px] text-gray-500">
        <span>{tasks.length} مهمة</span>
        <span>{tasks.filter((t) => t.isMilestone).length} محطة</span>
        <span>{tasks.filter((t) => t.isCritical).length} حرجة</span>
        <span className="text-emerald-400">
          {tasks.filter((t) => t.status === 'completed').length} مكتملة
        </span>
        <span className="text-red-400">
          {tasks.filter((t) => t.status === 'delayed').length} متأخرة
        </span>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-right px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 flex items-center gap-2"
            onClick={() => { onTaskClick?.(contextMenu.task); setContextMenu(null); }}
          >
            <FileText className="h-3.5 w-3.5" />
            تعديل المهمة
          </button>
          {onTaskDelete && (
            <button
              className="w-full text-right px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
              onClick={() => { onTaskDelete(contextMenu.task); setContextMenu(null); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف المهمة
            </button>
          )}
        </div>
      )}
    </div>
  );
}
