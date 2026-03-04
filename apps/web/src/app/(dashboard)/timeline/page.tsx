'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ganttApi, tracksApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Calendar, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Milestone, FolderOpen, Download,
} from 'lucide-react';

interface TimelineTask {
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
  isCritical: boolean;
  track?: { id: string; name: string; nameAr: string; color: string };
  resourceAssignments?: Array<{ user: { id: string; name: string; nameAr: string } }>;
  assignments?: Array<{ user: { id: string; name: string; nameAr: string } }>;
}

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

const STATUS_LABELS: Record<string, string> = {
  pending: 'معلقة',
  in_progress: 'قيد التنفيذ',
  under_review: 'تحت المراجعة',
  completed: 'مكتملة',
  delayed: 'متأخرة',
  cancelled: 'ملغاة',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#6B7280',
  in_progress: '#3B82F6',
  under_review: '#F59E0B',
  completed: '#10B981',
  delayed: '#EF4444',
  cancelled: '#9CA3AF',
};

const LANE_HEIGHT = 140;
const HEADER_HEIGHT = 50;

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function TimelinePage() {
  const [tasks, setTasks] = useState<TimelineTask[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<TimelineTask | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [tasksRes, tracksRes] = await Promise.all([
        ganttApi.tasks(filterStatus ? { status: filterStatus } : {}),
        tracksApi.list(),
      ]);
      setTasks(tasksRes.data);
      setTracks(tracksRes.data);
    } catch {
      toast.error('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  // Group tasks by track
  const trackLanes = useMemo(() => {
    const map = new Map<string, { track: any; tasks: TimelineTask[] }>();
    for (const t of tasks) {
      const tid = t.track?.id || 'none';
      if (!map.has(tid)) {
        map.set(tid, { track: t.track || { id: 'none', name: 'غير مصنف', nameAr: 'غير مصنف', color: '#6B7280' }, tasks: [] });
      }
      map.get(tid)!.tasks.push(t);
    }
    return [...map.values()];
  }, [tasks]);

  // Date range
  const { dateStart, dateEnd, totalDays } = useMemo(() => {
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
    min = addDays(min, -7);
    max = addDays(max, 14);
    return { dateStart: min, dateEnd: max, totalDays: daysBetween(min, max) };
  }, [tasks]);

  const cellWidth = zoom === 'day' ? 40 : zoom === 'week' ? 20 : zoom === 'month' ? 6 : 2;
  const totalWidth = totalDays * cellWidth;

  const todayPx = daysBetween(dateStart, new Date()) * cellWidth;

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers: { date: Date; label: string; x: number }[] = [];
    const current = new Date(dateStart);
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    while (current <= dateEnd) {
      const x = daysBetween(dateStart, current) * cellWidth;
      if (zoom === 'day') {
        markers.push({ date: new Date(current), label: `${current.getDate()}`, x });
        current.setDate(current.getDate() + 1);
      } else if (zoom === 'week') {
        if (current.getDay() === 0) {
          markers.push({ date: new Date(current), label: `${current.getDate()}/${current.getMonth() + 1}`, x });
        }
        current.setDate(current.getDate() + 1);
      } else if (zoom === 'month') {
        if (current.getDate() === 1) {
          markers.push({ date: new Date(current), label: months[current.getMonth()]?.slice(0, 3) || '', x });
        }
        current.setDate(current.getDate() + 1);
      } else {
        if (current.getMonth() % 3 === 0 && current.getDate() === 1) {
          markers.push({ date: new Date(current), label: `Q${Math.floor(current.getMonth() / 3) + 1} ${current.getFullYear()}`, x });
        }
        current.setDate(current.getDate() + 1);
      }
    }
    return markers;
  }, [dateStart, dateEnd, cellWidth, zoom]);

  const getTaskPosition = (task: TimelineTask) => {
    if (!task.startDate && !task.dueDate) return null;
    const start = new Date(task.startDate || task.dueDate!);
    const end = new Date(task.dueDate || task.startDate!);
    const left = daysBetween(dateStart, start) * cellWidth;
    const width = Math.max((daysBetween(start, end) + 1) * cellWidth, task.isMilestone ? 16 : 24);
    return { left, width };
  };

  const getResources = (task: TimelineTask): string => {
    const names: string[] = [];
    task.resourceAssignments?.forEach((ra) => names.push(ra.user.nameAr || ra.user.name));
    task.assignments?.forEach((a) => {
      if (!names.includes(a.user.nameAr || a.user.name)) names.push(a.user.nameAr || a.user.name);
    });
    return names.slice(0, 2).join(', ');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/10">
        <h1 className="text-lg font-bold">الجدول الزمني</h1>
        <div className="flex gap-1 mr-4">
          {(['day', 'week', 'month', 'quarter'] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2 py-1 text-xs rounded ${zoom === z ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-white'}`}
            >
              {z === 'day' ? 'يوم' : z === 'week' ? 'أسبوع' : z === 'month' ? 'شهر' : 'ربع'}
            </button>
          ))}
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field text-xs py-1.5 px-3"
        >
          <option value="">جميع الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{tasks.length} مهمة | {trackLanes.length} مسار</span>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">جاري التحميل...</div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minWidth: '100%' }} className="relative">
            {/* Time header */}
            <div className="sticky top-0 z-20 bg-gray-900 border-b border-white/10" style={{ height: HEADER_HEIGHT }}>
              <div className="relative h-full">
                {timeMarkers.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center text-[10px] text-gray-500 border-r border-white/5 px-1"
                    style={{ right: m.x }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Today line */}
            <div className="absolute top-0 bottom-0 w-px bg-emerald-500/50 z-10" style={{ right: todayPx }}>
              <div className="absolute top-0 -right-2 bg-emerald-500 text-white text-[9px] px-1 rounded-b">اليوم</div>
            </div>

            {/* Track Lanes */}
            {trackLanes.map((lane, laneIdx) => (
              <div
                key={lane.track.id}
                className="relative border-b border-white/10"
                style={{ minHeight: LANE_HEIGHT }}
              >
                {/* Lane background */}
                {laneIdx % 2 === 1 && <div className="absolute inset-0 bg-white/[0.02]" />}

                {/* Track label */}
                <div className="sticky right-0 z-10 inline-flex items-center gap-2 bg-gray-900/90 backdrop-blur px-3 py-1.5 rounded-bl-lg border-b border-l border-white/10">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: lane.track.color }} />
                  <span className="text-xs font-semibold">{lane.track.nameAr || lane.track.name}</span>
                  <span className="text-[10px] text-gray-500">({lane.tasks.length})</span>
                </div>

                {/* Tasks in this lane */}
                <div className="relative" style={{ minHeight: 80, paddingTop: 8, paddingBottom: 8 }}>
                  {lane.tasks.map((task, taskIdx) => {
                    const pos = getTaskPosition(task);
                    if (!pos) return null;
                    const y = 4 + (taskIdx % 3) * 28;

                    return task.isMilestone ? (
                      <div
                        key={task.id}
                        className="absolute cursor-pointer group"
                        style={{ right: pos.left, top: y }}
                        onClick={() => setSelectedTask(task)}
                      >
                        <div className="w-4 h-4 rotate-45 bg-amber-400 border-2 border-amber-500" />
                        <span className="absolute top-5 right-0 text-[9px] text-gray-400 whitespace-nowrap">
                          {task.titleAr || task.title}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={task.id}
                        className="absolute cursor-pointer group"
                        style={{ right: pos.left, width: pos.width, top: y, height: 22 }}
                        onClick={() => setSelectedTask(task)}
                      >
                        <div
                          className="h-full rounded-md relative overflow-hidden border border-transparent group-hover:border-white/20"
                          style={{ backgroundColor: `${lane.track.color}30` }}
                        >
                          {/* Progress fill */}
                          <div
                            className="absolute top-0 right-0 h-full rounded-md"
                            style={{ width: `${task.progress}%`, backgroundColor: lane.track.color, opacity: 0.6 }}
                          />
                          {/* Label */}
                          <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-white truncate z-10">
                            {task.titleAr || task.title}
                          </span>
                        </div>
                        {/* Tooltip on hover */}
                        <div className="absolute top-full right-0 mt-1 bg-gray-800 border border-white/10 rounded px-2 py-1 text-[10px] z-20 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                          <div className="font-medium">{task.titleAr || task.title}</div>
                          <div className="text-gray-400">
                            {STATUS_LABELS[task.status]} · {task.progress}% · {getResources(task) || 'غير معين'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Grid lines */}
                {timeMarkers.map((m, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-r border-white/5" style={{ right: m.x }} />
                ))}
              </div>
            ))}

            {trackLanes.length === 0 && (
              <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
                لا توجد مهام لعرضها. أنشئ مهام من صفحة مخطط جانت.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected task mini panel */}
      {selectedTask && (
        <div className="border-t border-white/10 bg-gray-900/80 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedTask.isMilestone && <Milestone className="h-4 w-4 text-amber-400" />}
              <span className="font-semibold text-sm">{selectedTask.titleAr || selectedTask.title}</span>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: `${STATUS_COLORS[selectedTask.status]}30`, color: STATUS_COLORS[selectedTask.status] }}
              >
                {STATUS_LABELS[selectedTask.status]}
              </span>
              <span className="text-xs text-gray-400">
                {selectedTask.startDate ? new Date(selectedTask.startDate).toLocaleDateString('ar-SA') : '-'}
                {' → '}
                {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString('ar-SA') : '-'}
              </span>
              <span className="text-xs text-gray-400">{selectedTask.progress}%</span>
            </div>
            <button onClick={() => setSelectedTask(null)} className="text-gray-400 hover:text-white text-xs">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
