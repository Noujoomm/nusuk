import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SchedulingEngine, ScheduleTask, ScheduleDependency, CalendarConfig } from './scheduling-engine';
import {
  generateMSProjectXML,
  parseMSProjectXML,
  CONSTRAINT_MAP,
  DEP_TYPE_MAP,
  PRIORITY_MAP,
} from './msproject-export';

const GANTT_INCLUDE = {
  track: { select: { id: true, name: true, nameAr: true, color: true } },
  createdBy: { select: { id: true, name: true, nameAr: true, email: true } },
  assigneeUser: { select: { id: true, name: true, nameAr: true, email: true } },
  parentTask: { select: { id: true, title: true, titleAr: true } },
  childTasks: {
    where: { isDeleted: false },
    select: { id: true, title: true, titleAr: true, status: true, progress: true },
  },
  predecessors: {
    include: {
      predecessor: { select: { id: true, title: true, titleAr: true } },
    },
  },
  successors: {
    include: {
      successor: { select: { id: true, title: true, titleAr: true } },
    },
  },
  resourceAssignments: {
    include: {
      user: { select: { id: true, name: true, nameAr: true, email: true } },
    },
  },
  assignments: {
    include: {
      user: { select: { id: true, name: true, nameAr: true, email: true } },
    },
  },
  calendar: true,
};

@Injectable()
export class GanttService {
  private readonly logger = new Logger(GanttService.name);

  constructor(private prisma: PrismaService) {}

  // ─── TASKS ───

  async findAll(query: {
    trackId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    tags?: string;
  }) {
    const where: any = { isDeleted: false };

    if (query.trackId) where.trackId = query.trackId;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.assigneeId) {
      where.OR = [
        { assigneeUserId: query.assigneeId },
        { assignments: { some: { userId: query.assigneeId } } },
        { resourceAssignments: { some: { userId: query.assigneeId } } },
      ];
    }
    if (query.tags) {
      const tagList = query.tags.split(',').map((t) => t.trim());
      where.tags = { hasSome: tagList };
    }
    if (query.search) {
      where.OR = [
        ...(where.OR || []),
        { title: { contains: query.search, mode: 'insensitive' } },
        { titleAr: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.startDate || query.endDate) {
      where.AND = [];
      if (query.startDate) {
        where.AND.push({
          OR: [
            { startDate: { gte: new Date(query.startDate) } },
            { dueDate: { gte: new Date(query.startDate) } },
          ],
        });
      }
      if (query.endDate) {
        where.AND.push({
          OR: [
            { startDate: { lte: new Date(query.endDate) } },
            { dueDate: { lte: new Date(query.endDate) } },
          ],
        });
      }
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: GANTT_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return tasks;
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        ...GANTT_INCLUDE,
        checklist: { orderBy: { sortOrder: 'asc' } },
        files: { include: { uploadedBy: { select: { id: true, name: true } } } },
        auditLogs: {
          include: { actor: { select: { id: true, name: true, nameAr: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!task) throw new NotFoundException('المهمة غير موجودة');
    return task;
  }

  async createTask(data: any, userId: string) {
    const engine = await this.getSchedulingEngine(data.calendarId);

    // Resolve dates
    const resolved = engine.resolveTaskDates({
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      duration: data.duration,
      isMilestone: data.isMilestone,
    });

    // Auto WBS
    const wbs = await this.generateWBS(data.trackId, data.parentTaskId);

    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        titleAr: data.titleAr,
        description: data.description,
        descriptionAr: data.descriptionAr,
        trackId: data.trackId,
        startDate: resolved.startDate,
        dueDate: resolved.dueDate,
        duration: resolved.duration,
        isMilestone: data.isMilestone || false,
        isSummary: data.isSummary || false,
        parentTaskId: data.parentTaskId,
        priority: data.priority || 'medium',
        progress: data.progress || 0,
        notes: data.notes,
        constraintType: data.constraintType,
        constraintDate: data.constraintDate ? new Date(data.constraintDate) : undefined,
        calendarId: data.calendarId,
        tags: data.tags || [],
        wbs,
        outlineLevel: data.parentTaskId ? await this.getOutlineLevel(data.parentTaskId) + 1 : 1,
        sortOrder: await this.getNextSortOrder(data.trackId, data.parentTaskId),
        createdById: userId,
        assigneeType: 'TRACK',
        assigneeTrackId: data.trackId,
        status: data.isMilestone && data.progress === 100 ? 'completed' : 'pending',
      },
      include: GANTT_INCLUDE,
    });

    // Create resource assignments
    if (data.assigneeIds?.length) {
      await this.prisma.resourceAssignment.createMany({
        data: data.assigneeIds.map((uid: string) => ({
          taskId: task.id,
          userId: uid,
          units: 100,
        })),
      });
    }

    // Audit log
    await this.prisma.taskAuditLog.create({
      data: {
        taskId: task.id,
        action: 'CREATED',
        afterJson: { title: task.title, startDate: task.startDate, dueDate: task.dueDate },
        actorUserId: userId,
      },
    }).catch(() => {});

    return this.findOne(task.id);
  }

  async updateTask(id: string, data: any, userId: string) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المهمة غير موجودة');

    const engine = await this.getSchedulingEngine(data.calendarId || existing.calendarId);

    const updateData: any = {};

    // Copy simple fields
    for (const field of [
      'title', 'titleAr', 'description', 'descriptionAr', 'trackId',
      'notes', 'isMilestone', 'isSummary', 'parentTaskId', 'status',
      'priority', 'calendarId', 'tags', 'sortOrder',
    ]) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    // Handle dates and duration
    if (data.startDate !== undefined || data.dueDate !== undefined || data.duration !== undefined) {
      const resolved = engine.resolveTaskDates({
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
        duration: data.duration ?? existing.duration,
        isMilestone: data.isMilestone ?? existing.isMilestone,
      });
      updateData.startDate = resolved.startDate;
      updateData.dueDate = resolved.dueDate;
      updateData.duration = resolved.duration;
    }

    // Progress
    if (data.progress !== undefined) {
      updateData.progress = data.progress;
      // Auto-status derivation
      if (data.status === undefined) {
        updateData.status = engine.deriveStatus(
          data.progress,
          updateData.dueDate || existing.dueDate,
          updateData.startDate || existing.startDate,
        );
      }
      if (data.progress >= 100) {
        updateData.completionDate = new Date();
      }
    }

    // Baseline
    if (data.baselineStart) updateData.baselineStart = new Date(data.baselineStart);
    if (data.baselineFinish) updateData.baselineFinish = new Date(data.baselineFinish);

    // Constraint
    if (data.constraintType !== undefined) updateData.constraintType = data.constraintType;
    if (data.constraintDate !== undefined) {
      updateData.constraintDate = data.constraintDate ? new Date(data.constraintDate) : null;
    }

    // Outline level
    if (data.parentTaskId !== undefined) {
      updateData.outlineLevel = data.parentTaskId
        ? (await this.getOutlineLevel(data.parentTaskId)) + 1
        : 1;
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: updateData,
      include: GANTT_INCLUDE,
    });

    // Audit
    await this.prisma.taskAuditLog.create({
      data: {
        taskId: id,
        action: 'UPDATED',
        beforeJson: { startDate: existing.startDate, dueDate: existing.dueDate, progress: existing.progress },
        afterJson: { startDate: task.startDate, dueDate: task.dueDate, progress: task.progress },
        actorUserId: userId,
      },
    }).catch(() => {});

    return task;
  }

  async bulkUpdate(tasks: Array<{ id: string; [key: string]: any }>, userId: string) {
    const results: any[] = [];
    for (const taskData of tasks) {
      const { id, ...data } = taskData;
      const result = await this.updateTask(id, data, userId);
      results.push(result);
    }
    return results;
  }

  async deleteTask(id: string, userId: string) {
    await this.prisma.task.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await this.prisma.taskAuditLog.create({
      data: { taskId: id, action: 'DELETED', actorUserId: userId },
    }).catch(() => {});
    return { success: true };
  }

  // ─── AUTO-SCHEDULE ───

  async autoSchedule(trackId: string, userId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { trackId, isDeleted: false },
      include: {
        predecessors: true,
        successors: true,
      },
    });

    const calendar = await this.getDefaultCalendar();
    const engine = new SchedulingEngine(calendar as any);

    // Build task map for CPM
    const taskMap = new Map<string, ScheduleTask>();
    for (const t of tasks) {
      taskMap.set(t.id, {
        id: t.id,
        startDate: t.startDate,
        dueDate: t.dueDate,
        duration: t.duration,
        isMilestone: t.isMilestone,
        isSummary: t.isSummary,
        parentTaskId: t.parentTaskId,
        constraintType: t.constraintType,
        constraintDate: t.constraintDate,
        progress: t.progress,
        predecessors: t.predecessors.map((d) => ({
          predecessorId: d.predecessorId,
          successorId: d.successorId,
          type: d.type as any,
          lag: d.lag,
        })),
        successors: t.successors.map((d) => ({
          predecessorId: d.predecessorId,
          successorId: d.successorId,
          type: d.type as any,
          lag: d.lag,
        })),
      });
    }

    // Run CPM
    engine.calculateSchedule(taskMap);

    // Update tasks with computed values
    const updates: any[] = [];
    for (const [id, st] of taskMap) {
      updates.push(
        this.prisma.task.update({
          where: { id },
          data: {
            startDate: st.earlyStart || st.startDate,
            dueDate: st.earlyFinish || st.dueDate,
            duration: st.duration,
            freeSlack: st.freeSlack,
            totalSlack: st.totalSlack,
            isCritical: st.isCritical || false,
          },
        }),
      );
    }

    await this.prisma.$transaction(updates);

    return { scheduled: tasks.length };
  }

  // ─── DEPENDENCIES ───

  async createDependency(data: { predecessorId: string; successorId: string; type?: string; lag?: number }, userId: string) {
    // Validate tasks exist
    const [pred, succ] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: data.predecessorId } }),
      this.prisma.task.findUnique({ where: { id: data.successorId } }),
    ]);
    if (!pred || !succ) throw new NotFoundException('المهمة غير موجودة');
    if (data.predecessorId === data.successorId) {
      throw new BadRequestException('لا يمكن ربط مهمة بنفسها');
    }

    // Check circular dependency
    const allDeps = await this.prisma.taskDependency.findMany();
    const taskMap = new Map<string, ScheduleTask>();
    // Build minimal task map for cycle detection
    const allTasks = await this.prisma.task.findMany({
      where: { isDeleted: false },
      select: { id: true },
    });
    for (const t of allTasks) {
      const preds = allDeps.filter((d) => d.successorId === t.id);
      const succs = allDeps.filter((d) => d.predecessorId === t.id);
      taskMap.set(t.id, {
        id: t.id,
        startDate: null,
        dueDate: null,
        duration: null,
        isMilestone: false,
        isSummary: false,
        parentTaskId: null,
        constraintType: null,
        constraintDate: null,
        progress: 0,
        predecessors: preds.map((d) => ({ ...d, type: d.type as any })),
        successors: succs.map((d) => ({ ...d, type: d.type as any })),
      });
    }

    const engine = new SchedulingEngine();
    if (engine.detectCircularDependency(taskMap, data.predecessorId, data.successorId)) {
      throw new BadRequestException('ارتباط دائري: لا يمكن إنشاء هذا الارتباط لأنه سيسبب حلقة');
    }

    const dependency = await this.prisma.taskDependency.create({
      data: {
        predecessorId: data.predecessorId,
        successorId: data.successorId,
        type: (data.type as any) || 'FS',
        lag: data.lag || 0,
      },
      include: {
        predecessor: { select: { id: true, title: true, titleAr: true } },
        successor: { select: { id: true, title: true, titleAr: true } },
      },
    });

    return dependency;
  }

  async updateDependency(id: string, data: { type?: string; lag?: number }) {
    return this.prisma.taskDependency.update({
      where: { id },
      data: {
        type: data.type as any,
        lag: data.lag,
      },
      include: {
        predecessor: { select: { id: true, title: true, titleAr: true } },
        successor: { select: { id: true, title: true, titleAr: true } },
      },
    });
  }

  async deleteDependency(id: string) {
    await this.prisma.taskDependency.delete({ where: { id } });
    return { success: true };
  }

  async findDependencies(taskId: string) {
    return this.prisma.taskDependency.findMany({
      where: { OR: [{ predecessorId: taskId }, { successorId: taskId }] },
      include: {
        predecessor: { select: { id: true, title: true, titleAr: true } },
        successor: { select: { id: true, title: true, titleAr: true } },
      },
    });
  }

  // ─── CALENDARS ───

  async createCalendar(data: any) {
    if (data.isDefault) {
      await this.prisma.workCalendar.updateMany({ data: { isDefault: false } });
    }
    return this.prisma.workCalendar.create({ data });
  }

  async updateCalendar(id: string, data: any) {
    if (data.isDefault) {
      await this.prisma.workCalendar.updateMany({ data: { isDefault: false } });
    }
    return this.prisma.workCalendar.update({ where: { id }, data });
  }

  async deleteCalendar(id: string) {
    await this.prisma.workCalendar.delete({ where: { id } });
    return { success: true };
  }

  async findCalendars() {
    return this.prisma.workCalendar.findMany({ orderBy: { isDefault: 'desc' } });
  }

  // ─── RESOURCE ASSIGNMENTS ───

  async createResourceAssignment(data: { taskId: string; userId: string; units?: number; costRate?: number }) {
    return this.prisma.resourceAssignment.create({
      data: {
        taskId: data.taskId,
        userId: data.userId,
        units: data.units || 100,
        costRate: data.costRate,
      },
      include: {
        user: { select: { id: true, name: true, nameAr: true, email: true } },
      },
    });
  }

  async deleteResourceAssignment(id: string) {
    await this.prisma.resourceAssignment.delete({ where: { id } });
    return { success: true };
  }

  async getResourceLoad(userId: string, startDate?: string, endDate?: string) {
    const where: any = { userId, task: { isDeleted: false } };
    if (startDate || endDate) {
      where.task = {
        ...where.task,
        AND: [],
      };
      if (startDate) where.task.AND.push({ startDate: { gte: new Date(startDate) } });
      if (endDate) where.task.AND.push({ dueDate: { lte: new Date(endDate) } });
    }

    const assignments = await this.prisma.resourceAssignment.findMany({
      where,
      include: {
        task: {
          select: {
            id: true, title: true, titleAr: true,
            startDate: true, dueDate: true, duration: true,
            status: true, progress: true,
            track: { select: { id: true, name: true, nameAr: true, color: true } },
          },
        },
      },
    });

    return assignments;
  }

  // ─── BASELINE ───

  async setBaseline(trackId?: string, taskIds?: string[]) {
    const where: any = { isDeleted: false };
    if (trackId) where.trackId = trackId;
    if (taskIds?.length) where.id = { in: taskIds };

    const tasks = await this.prisma.task.findMany({ where, select: { id: true, startDate: true, dueDate: true, duration: true } });

    const updates = tasks.map((t) =>
      this.prisma.task.update({
        where: { id: t.id },
        data: {
          baselineStart: t.startDate,
          baselineFinish: t.dueDate,
          baselineDuration: t.duration,
        },
      }),
    );

    await this.prisma.$transaction(updates);
    return { baselined: tasks.length };
  }

  // ─── MS PROJECT EXPORT ───

  async exportMSProject(trackId?: string) {
    const where: any = { isDeleted: false };
    if (trackId) where.trackId = trackId;

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        track: { select: { id: true, name: true, nameAr: true } },
        predecessors: true,
        resourceAssignments: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        assignments: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: [{ trackId: 'asc' }, { sortOrder: 'asc' }],
    });

    const calendar = await this.getDefaultCalendar();

    // Collect unique resources
    const resourceMap = new Map<string, { id: string; name: string; email?: string }>();
    for (const t of tasks) {
      for (const ra of t.resourceAssignments) {
        resourceMap.set(ra.userId, { id: ra.userId, name: ra.user.name, email: ra.user.email });
      }
      for (const a of t.assignments) {
        resourceMap.set(a.userId, { id: a.userId, name: a.user.name, email: a.user.email });
      }
    }

    // Build track groups as summary tasks
    const trackGroups = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const tid = t.trackId || 'none';
      const list = trackGroups.get(tid) || [];
      list.push(t);
      trackGroups.set(tid, list);
    }

    // Build UID maps
    const uidMap = new Map<string, number>();
    let taskUID = 1;
    let taskID = 1;
    const msProjectTasks: any[] = [];

    // Create task ID to UID mapping first
    for (const [trackId, groupTasks] of trackGroups) {
      uidMap.set(`track-${trackId}`, taskUID++); // summary for track
      for (const t of groupTasks) {
        uidMap.set(t.id, taskUID++);
      }
    }

    // Now build tasks
    taskUID = 1;
    for (const [tid, groupTasks] of trackGroups) {
      const trackInfo = groupTasks[0]?.track;
      const trackName = trackInfo?.name || 'غير مصنف';

      // Track summary
      msProjectTasks.push({
        uid: taskUID,
        id: taskID++,
        name: trackName,
        wbs: `${taskID - 1}`,
        outlineLevel: 1,
        outlineNumber: `${taskID - 1}`,
        start: groupTasks[0]?.startDate || new Date(),
        finish: groupTasks[groupTasks.length - 1]?.dueDate || new Date(),
        duration: 0,
        isMilestone: false,
        isSummary: true,
        percentComplete: 0,
        constraintType: 0,
        priority: 500,
        isCritical: false,
        predecessors: [],
      });
      const trackWbsPrefix = `${taskID - 1}`;
      taskUID++;

      // Track tasks
      let subIdx = 1;
      for (const t of groupTasks) {
        const predLinks = t.predecessors.map((p) => ({
          predecessorUID: uidMap.get(p.predecessorId) || 0,
          type: DEP_TYPE_MAP[p.type] ?? 1,
          lag: p.lag,
        })).filter((p) => p.predecessorUID > 0);

        msProjectTasks.push({
          uid: taskUID,
          id: taskID++,
          name: t.title,
          wbs: `${trackWbsPrefix}.${subIdx}`,
          outlineLevel: t.outlineLevel + 1,
          outlineNumber: `${trackWbsPrefix}.${subIdx}`,
          start: t.startDate || new Date(),
          finish: t.dueDate || new Date(),
          duration: t.duration || 1,
          isMilestone: t.isMilestone,
          isSummary: t.isSummary,
          percentComplete: t.progress,
          constraintType: t.constraintType ? (CONSTRAINT_MAP[t.constraintType] ?? 0) : 0,
          constraintDate: t.constraintDate,
          baselineStart: t.baselineStart,
          baselineFinish: t.baselineFinish,
          notes: t.notes,
          priority: PRIORITY_MAP[t.priority] ?? 500,
          isCritical: t.isCritical,
          predecessors: predLinks,
        });

        taskUID++;
        subIdx++;
      }
    }

    // Resources
    const resources = [...resourceMap.values()].map((r, i) => ({
      uid: i + 1,
      id: i + 1,
      name: r.name,
      email: r.email,
    }));
    const resourceUIDMap = new Map<string, number>();
    [...resourceMap.keys()].forEach((id, i) => resourceUIDMap.set(id, i + 1));

    // Assignments
    let asnUID = 1;
    const msAssignments: any[] = [];
    for (const t of tasks) {
      const tUID = uidMap.get(t.id);
      if (!tUID) continue;
      for (const ra of t.resourceAssignments) {
        const rUID = resourceUIDMap.get(ra.userId);
        if (rUID) {
          msAssignments.push({ uid: asnUID++, taskUID: tUID, resourceUID: rUID, units: ra.units / 100 });
        }
      }
    }

    const projectName = trackId
      ? (tasks[0]?.track?.name || 'مشروع نسك')
      : 'نسك - جميع المسارات';

    const minDate = tasks.reduce((min, t) => {
      const d = t.startDate;
      return d && d < min ? d : min;
    }, new Date());

    return generateMSProjectXML(
      {
        name: projectName,
        startDate: minDate.toISOString().split('T')[0],
        calendarName: calendar.name || 'Saudi Standard',
      },
      msProjectTasks,
      resources,
      msAssignments,
      {
        name: calendar.name || 'Saudi Standard',
        workDays: calendar.workDays,
        workStartHour: calendar.workStartHour,
        workEndHour: calendar.workEndHour,
        holidays: (calendar.holidays as any[]) || [],
      },
    );
  }

  // ─── MS PROJECT IMPORT ───

  async importMSProject(xmlContent: string, trackId: string, userId: string) {
    const parsed = parseMSProjectXML(xmlContent);
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    // Create tasks
    const uidToId = new Map<number, string>();

    for (const pt of parsed.tasks) {
      if (pt.isSummary && pt.outlineLevel <= 1) {
        results.skipped++;
        continue; // Skip top-level summary (it's the track)
      }

      try {
        const task = await this.prisma.task.create({
          data: {
            title: pt.name,
            titleAr: pt.name,
            trackId,
            startDate: pt.start ? new Date(pt.start) : undefined,
            dueDate: pt.finish ? new Date(pt.finish) : undefined,
            duration: pt.duration,
            isMilestone: pt.isMilestone,
            isSummary: pt.isSummary,
            progress: pt.percentComplete,
            notes: pt.notes || undefined,
            wbs: pt.wbs,
            outlineLevel: pt.outlineLevel,
            sortOrder: pt.uid,
            status: pt.percentComplete >= 100 ? 'completed' : pt.percentComplete > 0 ? 'in_progress' : 'pending',
            createdById: userId,
            assigneeType: 'TRACK',
            assigneeTrackId: trackId,
          },
        });
        uidToId.set(pt.uid, task.id);
        results.imported++;
      } catch (err: any) {
        results.errors.push(`Task "${pt.name}": ${err.message}`);
      }
    }

    // Create dependencies
    for (const pt of parsed.tasks) {
      const succId = uidToId.get(pt.uid);
      if (!succId) continue;
      for (const pred of pt.predecessors) {
        const predId = uidToId.get(pred.uid);
        if (!predId) continue;
        try {
          await this.prisma.taskDependency.create({
            data: {
              predecessorId: predId,
              successorId: succId,
              type: (pred.type as any) || 'FS',
              lag: pred.lag || 0,
            },
          });
        } catch {
          // Skip duplicate dependencies
        }
      }
    }

    return results;
  }

  // ─── STATS ───

  async getStats(trackId?: string) {
    const where: any = { isDeleted: false };
    if (trackId) where.trackId = trackId;

    const [total, byStatus, byPriority, overdue, milestones, critical] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.task.groupBy({ by: ['priority'], where, _count: true }),
      this.prisma.task.count({
        where: { ...where, dueDate: { lt: new Date() }, status: { notIn: ['completed', 'cancelled'] } },
      }),
      this.prisma.task.count({ where: { ...where, isMilestone: true } }),
      this.prisma.task.count({ where: { ...where, isCritical: true } }),
    ]);

    return {
      total,
      overdue,
      milestones,
      critical,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
    };
  }

  // ─── HELPERS ───

  private async getSchedulingEngine(calendarId?: string | null): Promise<SchedulingEngine> {
    const calendar = await this.getCalendarConfig(calendarId);
    return new SchedulingEngine(calendar);
  }

  private async getCalendarConfig(calendarId?: string | null): Promise<CalendarConfig> {
    let cal;
    if (calendarId) {
      cal = await this.prisma.workCalendar.findUnique({ where: { id: calendarId } });
    }
    if (!cal) {
      cal = await this.prisma.workCalendar.findFirst({ where: { isDefault: true } });
    }
    if (!cal) {
      return {
        workDays: [0, 1, 2, 3, 4],
        workStartHour: 9,
        workEndHour: 17,
        holidays: [],
        timezone: 'Asia/Riyadh',
      };
    }
    return {
      workDays: cal.workDays,
      workStartHour: cal.workStartHour,
      workEndHour: cal.workEndHour,
      holidays: (cal.holidays as any[]) || [],
      timezone: cal.timezone,
    };
  }

  private async getDefaultCalendar() {
    const cal = await this.prisma.workCalendar.findFirst({ where: { isDefault: true } });
    return cal || {
      name: 'Saudi Standard',
      nameAr: 'التقويم السعودي',
      workDays: [0, 1, 2, 3, 4],
      workStartHour: 9,
      workEndHour: 17,
      holidays: [],
      timezone: 'Asia/Riyadh',
    };
  }

  private async generateWBS(trackId: string, parentTaskId?: string): Promise<string> {
    const siblings = await this.prisma.task.count({
      where: { trackId, parentTaskId: parentTaskId || null, isDeleted: false },
    });
    if (parentTaskId) {
      const parent = await this.prisma.task.findUnique({
        where: { id: parentTaskId },
        select: { wbs: true },
      });
      return `${parent?.wbs || '1'}.${siblings + 1}`;
    }
    return `${siblings + 1}`;
  }

  private async getOutlineLevel(parentId: string): Promise<number> {
    const parent = await this.prisma.task.findUnique({
      where: { id: parentId },
      select: { outlineLevel: true },
    });
    return parent?.outlineLevel || 1;
  }

  private async getNextSortOrder(trackId: string, parentTaskId?: string): Promise<number> {
    const last = await this.prisma.task.findFirst({
      where: { trackId, parentTaskId: parentTaskId || null, isDeleted: false },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder || 0) + 1;
  }
}
