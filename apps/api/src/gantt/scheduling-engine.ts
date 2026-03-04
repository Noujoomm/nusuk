/**
 * Scheduling Engine — CPM (Critical Path Method) implementation
 * Handles: working calendar, duration calculation, auto-scheduling,
 * dependency resolution, critical path detection, constraint enforcement.
 */

export interface CalendarConfig {
  workDays: number[];      // 0=Sun..6=Sat, Saudi default [0,1,2,3,4]
  workStartHour: number;   // 9
  workEndHour: number;     // 17
  holidays: { date: string; name: string }[];
  timezone: string;        // Asia/Riyadh
}

export interface ScheduleTask {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  duration: number | null;   // working days
  isMilestone: boolean;
  isSummary: boolean;
  parentTaskId: string | null;
  constraintType: string | null;
  constraintDate: Date | null;
  progress: number;
  predecessors: ScheduleDependency[];
  successors: ScheduleDependency[];
  // Computed
  earlyStart?: Date;
  earlyFinish?: Date;
  lateStart?: Date;
  lateFinish?: Date;
  freeSlack?: number;
  totalSlack?: number;
  isCritical?: boolean;
}

export interface ScheduleDependency {
  predecessorId: string;
  successorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number;
}

const DEFAULT_CALENDAR: CalendarConfig = {
  workDays: [0, 1, 2, 3, 4], // Sun-Thu
  workStartHour: 9,
  workEndHour: 17,
  holidays: [],
  timezone: 'Asia/Riyadh',
};

export class SchedulingEngine {
  private calendar: CalendarConfig;

  constructor(calendar?: Partial<CalendarConfig>) {
    this.calendar = { ...DEFAULT_CALENDAR, ...calendar };
  }

  /** Check if a date is a working day */
  isWorkingDay(date: Date): boolean {
    const dayOfWeek = date.getDay();
    if (!this.calendar.workDays.includes(dayOfWeek)) return false;
    const dateStr = this.formatDateStr(date);
    return !this.calendar.holidays.some((h) => h.date === dateStr);
  }

  /** Format date as YYYY-MM-DD */
  private formatDateStr(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /** Add working days to a date */
  addWorkingDays(startDate: Date, days: number): Date {
    if (days <= 0) return new Date(startDate);
    const result = new Date(startDate);
    let remaining = days;
    while (remaining > 0) {
      result.setDate(result.getDate() + 1);
      if (this.isWorkingDay(result)) {
        remaining--;
      }
    }
    return result;
  }

  /** Subtract working days from a date */
  subtractWorkingDays(endDate: Date, days: number): Date {
    if (days <= 0) return new Date(endDate);
    const result = new Date(endDate);
    let remaining = days;
    while (remaining > 0) {
      result.setDate(result.getDate() - 1);
      if (this.isWorkingDay(result)) {
        remaining--;
      }
    }
    return result;
  }

  /** Count working days between two dates (exclusive of end) */
  countWorkingDays(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);
    current.setDate(current.getDate() + 1);
    while (current <= end) {
      if (this.isWorkingDay(current)) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  /** Get next working day (if current is non-working) */
  nextWorkingDay(date: Date): Date {
    const result = new Date(date);
    while (!this.isWorkingDay(result)) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  /** Get previous working day */
  previousWorkingDay(date: Date): Date {
    const result = new Date(date);
    while (!this.isWorkingDay(result)) {
      result.setDate(result.getDate() - 1);
    }
    return result;
  }

  /**
   * Calculate end date from start + duration
   */
  calculateEndDate(startDate: Date, durationDays: number): Date {
    if (durationDays <= 0) return new Date(startDate);
    // Start is day 1, so we add (duration - 1) working days
    return this.addWorkingDays(startDate, durationDays - 1);
  }

  /**
   * Calculate start date from end - duration
   */
  calculateStartDate(endDate: Date, durationDays: number): Date {
    if (durationDays <= 0) return new Date(endDate);
    return this.subtractWorkingDays(endDate, durationDays - 1);
  }

  /**
   * Calculate duration from start and end dates
   */
  calculateDuration(startDate: Date, endDate: Date): number {
    return this.countWorkingDays(startDate, endDate) + 1;
  }

  /**
   * Resolve a task's dates: compute missing start/end/duration
   */
  resolveTaskDates(task: {
    startDate?: Date | null;
    dueDate?: Date | null;
    duration?: number | null;
    isMilestone?: boolean;
  }): { startDate: Date; dueDate: Date; duration: number } {
    const now = this.nextWorkingDay(new Date());

    if (task.isMilestone) {
      const date = task.startDate || task.dueDate || now;
      return { startDate: new Date(date), dueDate: new Date(date), duration: 0 };
    }

    let start = task.startDate ? new Date(task.startDate) : null;
    let end = task.dueDate ? new Date(task.dueDate) : null;
    let dur = task.duration ?? null;

    if (start && dur != null && !end) {
      end = this.calculateEndDate(start, dur);
    } else if (end && dur != null && !start) {
      start = this.calculateStartDate(end, dur);
    } else if (start && end && dur == null) {
      dur = this.calculateDuration(start, end);
    } else if (!start && !end) {
      start = now;
      dur = dur ?? 1;
      end = this.calculateEndDate(start, dur);
    } else if (start && end) {
      // All three provided, recalculate duration
      dur = this.calculateDuration(start, end);
    }

    return {
      startDate: start!,
      dueDate: end!,
      duration: dur ?? 1,
    };
  }

  /**
   * Detect circular dependencies via DFS
   */
  detectCircularDependency(
    tasks: Map<string, ScheduleTask>,
    newPredId: string,
    newSuccId: string,
  ): boolean {
    // Check if adding newPredId -> newSuccId creates a cycle
    const visited = new Set<string>();
    const stack = [newPredId];
    // Walk backwards from predecessor through its predecessors
    // Actually, walk forward from successor to see if we reach predecessor
    const forwardStack = [newSuccId];
    while (forwardStack.length > 0) {
      const current = forwardStack.pop()!;
      if (current === newPredId) return true; // Cycle detected
      if (visited.has(current)) continue;
      visited.add(current);
      const task = tasks.get(current);
      if (task) {
        for (const dep of task.successors) {
          forwardStack.push(dep.successorId);
        }
      }
    }
    return false;
  }

  /**
   * Topological sort of tasks by dependencies
   */
  topologicalSort(tasks: Map<string, ScheduleTask>): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const [id, task] of tasks) {
      inDegree.set(id, task.predecessors.length);
      if (!adjacency.has(id)) adjacency.set(id, []);
      for (const dep of task.successors) {
        const list = adjacency.get(id) || [];
        list.push(dep.successorId);
        adjacency.set(id, list);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  /**
   * Forward pass — compute Early Start (ES) and Early Finish (EF)
   */
  forwardPass(tasks: Map<string, ScheduleTask>, order: string[]): void {
    for (const id of order) {
      const task = tasks.get(id);
      if (!task) continue;

      let es: Date;

      if (task.predecessors.length === 0) {
        // No predecessors: start at task's own start or project start
        es = task.startDate || this.nextWorkingDay(new Date());
      } else {
        // ES = max of all predecessor finish/start + lag based on type
        let maxDate = new Date(0);
        for (const dep of task.predecessors) {
          const pred = tasks.get(dep.predecessorId);
          if (!pred) continue;
          let refDate: Date;
          switch (dep.type) {
            case 'FS':
              refDate = pred.earlyFinish
                ? this.addWorkingDays(pred.earlyFinish, 1 + dep.lag)
                : this.nextWorkingDay(new Date());
              break;
            case 'SS':
              refDate = pred.earlyStart
                ? this.addWorkingDays(pred.earlyStart, dep.lag)
                : this.nextWorkingDay(new Date());
              break;
            case 'FF':
              refDate = pred.earlyFinish
                ? this.subtractWorkingDays(
                    this.addWorkingDays(pred.earlyFinish, dep.lag),
                    Math.max((task.duration || 1) - 1, 0),
                  )
                : this.nextWorkingDay(new Date());
              break;
            case 'SF':
              refDate = pred.earlyStart
                ? this.subtractWorkingDays(
                    this.addWorkingDays(pred.earlyStart, dep.lag),
                    Math.max((task.duration || 1) - 1, 0),
                  )
                : this.nextWorkingDay(new Date());
              break;
            default:
              refDate = this.nextWorkingDay(new Date());
          }
          if (refDate > maxDate) maxDate = refDate;
        }
        es = maxDate;
      }

      // Apply constraint
      es = this.applyConstraintToStart(task, es);
      es = this.nextWorkingDay(es);

      task.earlyStart = es;
      task.earlyFinish = task.isMilestone
        ? new Date(es)
        : this.calculateEndDate(es, task.duration || 1);
    }
  }

  /**
   * Backward pass — compute Late Start (LS) and Late Finish (LF)
   */
  backwardPass(tasks: Map<string, ScheduleTask>, order: string[]): void {
    // Find project end date
    let projectEnd = new Date(0);
    for (const [, task] of tasks) {
      if (task.earlyFinish && task.earlyFinish > projectEnd) {
        projectEnd = task.earlyFinish;
      }
    }

    // Reverse order
    const reversed = [...order].reverse();
    for (const id of reversed) {
      const task = tasks.get(id);
      if (!task) continue;

      let lf: Date;

      if (task.successors.length === 0) {
        lf = projectEnd;
      } else {
        let minDate = new Date(8640000000000000); // max date
        for (const dep of task.successors) {
          const succ = tasks.get(dep.successorId);
          if (!succ) continue;
          let refDate: Date;
          switch (dep.type) {
            case 'FS':
              refDate = succ.lateStart
                ? this.subtractWorkingDays(succ.lateStart, 1 + dep.lag)
                : projectEnd;
              break;
            case 'SS':
              refDate = succ.lateStart
                ? this.addWorkingDays(
                    this.subtractWorkingDays(succ.lateStart, dep.lag),
                    Math.max((task.duration || 1) - 1, 0),
                  )
                : projectEnd;
              break;
            case 'FF':
              refDate = succ.lateFinish
                ? this.subtractWorkingDays(succ.lateFinish, dep.lag)
                : projectEnd;
              break;
            case 'SF':
              refDate = succ.lateFinish
                ? this.addWorkingDays(
                    this.subtractWorkingDays(succ.lateFinish, dep.lag),
                    Math.max((task.duration || 1) - 1, 0),
                  )
                : projectEnd;
              break;
            default:
              refDate = projectEnd;
          }
          if (refDate < minDate) minDate = refDate;
        }
        lf = minDate;
      }

      task.lateFinish = this.previousWorkingDay(lf);
      task.lateStart = task.isMilestone
        ? new Date(task.lateFinish)
        : this.calculateStartDate(task.lateFinish, task.duration || 1);
    }
  }

  /**
   * Compute slack and critical path
   */
  computeSlack(tasks: Map<string, ScheduleTask>): void {
    for (const [, task] of tasks) {
      if (task.earlyStart && task.lateStart) {
        task.totalSlack = this.countWorkingDays(task.earlyStart, task.lateStart);
        task.isCritical = task.totalSlack === 0;
      }
      // Free slack: min(successor ES - this EF - 1) for FS dependencies
      if (task.successors.length > 0 && task.earlyFinish) {
        let minFreeSlack = Infinity;
        for (const dep of task.successors) {
          const succ = tasks.get(dep.successorId);
          if (succ?.earlyStart && dep.type === 'FS') {
            const slack = this.countWorkingDays(task.earlyFinish, succ.earlyStart) - 1 - dep.lag;
            if (slack < minFreeSlack) minFreeSlack = slack;
          }
        }
        task.freeSlack = minFreeSlack === Infinity ? task.totalSlack : Math.max(0, minFreeSlack);
      } else {
        task.freeSlack = task.totalSlack;
      }
    }
  }

  /**
   * Apply constraint to a computed start date
   */
  private applyConstraintToStart(task: ScheduleTask, computedStart: Date): Date {
    if (!task.constraintType || !task.constraintDate) return computedStart;
    const cd = task.constraintDate;
    switch (task.constraintType) {
      case 'MSO': return new Date(cd);
      case 'SNET': return cd > computedStart ? new Date(cd) : computedStart;
      case 'SNLT': return cd < computedStart ? new Date(cd) : computedStart;
      case 'MFO': {
        const dur = task.duration || 1;
        return this.calculateStartDate(new Date(cd), dur);
      }
      case 'FNET': {
        const possibleEnd = this.calculateEndDate(computedStart, task.duration || 1);
        if (possibleEnd < cd) {
          return this.calculateStartDate(new Date(cd), task.duration || 1);
        }
        return computedStart;
      }
      case 'FNLT': {
        const possibleEnd = this.calculateEndDate(computedStart, task.duration || 1);
        if (possibleEnd > cd) {
          return this.calculateStartDate(new Date(cd), task.duration || 1);
        }
        return computedStart;
      }
      default: return computedStart;
    }
  }

  /**
   * Full CPM schedule calculation
   */
  calculateSchedule(tasks: Map<string, ScheduleTask>): Map<string, ScheduleTask> {
    // Resolve dates for all tasks first
    for (const [, task] of tasks) {
      if (!task.isSummary) {
        const resolved = this.resolveTaskDates(task);
        task.startDate = resolved.startDate;
        task.dueDate = resolved.dueDate;
        task.duration = resolved.duration;
      }
    }

    const order = this.topologicalSort(tasks);
    this.forwardPass(tasks, order);
    this.backwardPass(tasks, order);
    this.computeSlack(tasks);

    // Update summary tasks (roll up from children)
    this.rollUpSummaryTasks(tasks);

    return tasks;
  }

  /**
   * Auto-reschedule: recalculate dependent tasks when one changes
   */
  autoReschedule(
    tasks: Map<string, ScheduleTask>,
    changedTaskId: string,
  ): Map<string, { startDate: Date; dueDate: Date }> {
    const changes = new Map<string, { startDate: Date; dueDate: Date }>();
    const order = this.topologicalSort(tasks);
    const startIdx = order.indexOf(changedTaskId);
    if (startIdx === -1) return changes;

    // Forward pass from changed task onward
    this.forwardPass(tasks, order.slice(startIdx));

    // Collect changes
    for (const id of order.slice(startIdx + 1)) {
      const task = tasks.get(id);
      if (task?.earlyStart && task?.earlyFinish) {
        const newStart = task.earlyStart;
        const newEnd = task.earlyFinish;
        if (
          !task.startDate ||
          newStart.getTime() !== task.startDate.getTime() ||
          !task.dueDate ||
          newEnd.getTime() !== task.dueDate.getTime()
        ) {
          changes.set(id, { startDate: newStart, dueDate: newEnd });
        }
      }
    }

    return changes;
  }

  /**
   * Roll up summary tasks from children
   */
  private rollUpSummaryTasks(tasks: Map<string, ScheduleTask>): void {
    // Build parent->children map
    const children = new Map<string, string[]>();
    for (const [id, task] of tasks) {
      if (task.parentTaskId) {
        const list = children.get(task.parentTaskId) || [];
        list.push(id);
        children.set(task.parentTaskId, list);
      }
    }

    // Process summaries bottom-up
    const processSummary = (id: string): void => {
      const task = tasks.get(id);
      if (!task?.isSummary) return;
      const childIds = children.get(id) || [];
      if (childIds.length === 0) return;

      // Process child summaries first
      for (const cid of childIds) {
        const child = tasks.get(cid);
        if (child?.isSummary) processSummary(cid);
      }

      let minStart: Date | null = null;
      let maxEnd: Date | null = null;
      let totalProgress = 0;
      let totalWeight = 0;

      for (const cid of childIds) {
        const child = tasks.get(cid);
        if (!child) continue;
        const cs = child.earlyStart || child.startDate;
        const ce = child.earlyFinish || child.dueDate;
        if (cs && (!minStart || cs < minStart)) minStart = cs;
        if (ce && (!maxEnd || ce > maxEnd)) maxEnd = ce;
        const w = 1;
        totalProgress += child.progress * w;
        totalWeight += w;
      }

      if (minStart) {
        task.startDate = minStart;
        task.earlyStart = minStart;
      }
      if (maxEnd) {
        task.dueDate = maxEnd;
        task.earlyFinish = maxEnd;
      }
      if (totalWeight > 0) {
        task.progress = totalProgress / totalWeight;
      }
      if (minStart && maxEnd) {
        task.duration = this.calculateDuration(minStart, maxEnd);
      }
    };

    for (const [id, task] of tasks) {
      if (task.isSummary && !task.parentTaskId) {
        processSummary(id);
      }
    }
  }

  /**
   * Derive status from progress and dates
   */
  deriveStatus(
    progress: number,
    dueDate: Date | null,
    startDate: Date | null,
  ): string {
    if (progress >= 100) return 'completed';
    if (dueDate && new Date() > dueDate && progress < 100) return 'delayed';
    if (progress > 0) return 'in_progress';
    return 'pending';
  }
}
