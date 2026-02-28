import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import archiver from 'archiver';
import { PassThrough } from 'stream';

@Injectable()
export class SystemExportService {
  private readonly logger = new Logger(SystemExportService.name);

  constructor(private prisma: PrismaService) {}

  // ─── FULL SYSTEM EXPORT ───────────────────────────────

  async getFullExport() {
    this.logger.log('Starting full system export...');
    const startTime = Date.now();

    const [
      tracks,
      users,
      employees,
      tasks,
      dailyUpdates,
      uploadedFiles,
      taskFiles,
      scopeBlocks,
      kpiEntries,
      penalties,
      deliverables,
      scopes,
      trackKpis,
      reports,
      aiReports,
      auditLogs,
      comments,
      notifications,
      embeddings,
      importHistory,
      progressItems,
      achievements,
    ] = await Promise.all([
      this.exportTracks(),
      this.exportUsers(),
      this.exportEmployees(),
      this.exportTasks(),
      this.exportDailyUpdates(),
      this.exportUploadedFiles(),
      this.exportTaskFiles(),
      this.exportScopeBlocks(),
      this.exportKPIEntries(),
      this.exportPenalties(),
      this.exportDeliverables(),
      this.exportScopes(),
      this.exportTrackKPIs(),
      this.exportReports(),
      this.exportAIReports(),
      this.exportAuditLogs(),
      this.exportComments(),
      this.exportNotifications(),
      this.exportEmbeddings(),
      this.exportImportHistory(),
      this.exportProgressItems(),
      this.exportAchievements(),
    ]);

    const duration = Date.now() - startTime;
    this.logger.log(`Full export completed in ${duration}ms`);

    return {
      exportedAt: new Date().toISOString(),
      durationMs: duration,
      platform: 'Nusuk Platform',
      version: '1.0',
      data: {
        tracks,
        users,
        employees,
        tasks,
        dailyUpdates,
        uploadedFiles,
        taskFiles,
        scopeBlocks,
        kpiEntries,
        penalties,
        deliverables,
        scopes,
        trackKpis,
        reports,
        aiReports,
        auditLogs,
        comments,
        notifications,
        embeddings,
        importHistory,
        progressItems,
        achievements,
      },
      counts: {
        tracks: tracks.length,
        users: users.length,
        employees: employees.length,
        tasks: tasks.length,
        dailyUpdates: dailyUpdates.length,
        uploadedFiles: uploadedFiles.length,
        taskFiles: taskFiles.length,
        scopeBlocks: scopeBlocks.length,
        kpiEntries: kpiEntries.length,
        penalties: penalties.length,
        deliverables: deliverables.length,
        scopes: scopes.length,
        trackKpis: trackKpis.length,
        reports: reports.length,
        aiReports: aiReports.length,
        auditLogs: auditLogs.length,
        comments: comments.length,
        notifications: notifications.length,
        embeddings: embeddings.length,
        importHistory: importHistory.length,
        progressItems: progressItems.length,
        achievements: achievements.length,
      },
    };
  }

  // ─── SYSTEM STATS (lightweight) ───────────────────────

  async getSystemStats() {
    const [
      usersCount,
      tracksCount,
      employeesCount,
      tasksCount,
      dailyUpdatesCount,
      uploadedFilesCount,
      taskFilesCount,
      scopeBlocksCount,
      kpiEntriesCount,
      penaltiesCount,
      deliverablesCount,
      scopesCount,
      trackKpisCount,
      reportsCount,
      aiReportsCount,
      auditLogsCount,
      commentsCount,
      notificationsCount,
      embeddingsCount,
      importHistoryCount,
      progressItemsCount,
      achievementsCount,
      taskAssignmentsCount,
      taskChecklistCount,
      adminNotesCount,
      taskUpdatesCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.track.count(),
      this.prisma.employee.count(),
      this.prisma.task.count(),
      this.prisma.dailyUpdate.count(),
      this.prisma.uploadedFile.count(),
      this.prisma.taskFile.count(),
      this.prisma.scopeBlock.count(),
      this.prisma.kPIEntry.count(),
      this.prisma.penalty.count(),
      this.prisma.deliverable.count(),
      this.prisma.scope.count(),
      this.prisma.trackKPI.count(),
      this.prisma.report.count(),
      this.prisma.aIReport.count(),
      this.prisma.auditLog.count(),
      this.prisma.comment.count(),
      this.prisma.notification.count(),
      this.prisma.embedding.count(),
      this.prisma.importHistory.count(),
      this.prisma.progressItem.count(),
      this.prisma.achievement.count(),
      this.prisma.taskAssignment.count(),
      this.prisma.taskChecklist.count(),
      this.prisma.adminNote.count(),
      this.prisma.taskUpdate.count(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      models: [
        { name: 'User', nameAr: 'المستخدمون', count: usersCount, icon: 'users' },
        { name: 'Track', nameAr: 'المسارات', count: tracksCount, icon: 'tracks' },
        { name: 'Employee', nameAr: 'الموظفون', count: employeesCount, icon: 'employees' },
        { name: 'Task', nameAr: 'المهام', count: tasksCount, icon: 'tasks' },
        { name: 'TaskAssignment', nameAr: 'تعيينات المهام', count: taskAssignmentsCount, icon: 'assignments' },
        { name: 'TaskChecklist', nameAr: 'قوائم المراجعة', count: taskChecklistCount, icon: 'checklist' },
        { name: 'AdminNote', nameAr: 'الملاحظات الإدارية', count: adminNotesCount, icon: 'notes' },
        { name: 'TaskUpdate', nameAr: 'تحديثات المهام', count: taskUpdatesCount, icon: 'updates' },
        { name: 'DailyUpdate', nameAr: 'التحديثات اليومية', count: dailyUpdatesCount, icon: 'daily' },
        { name: 'UploadedFile', nameAr: 'الملفات المرفوعة', count: uploadedFilesCount, icon: 'files' },
        { name: 'TaskFile', nameAr: 'ملفات المهام', count: taskFilesCount, icon: 'taskfiles' },
        { name: 'ScopeBlock', nameAr: 'نطاقات العمل', count: scopeBlocksCount, icon: 'scope' },
        { name: 'KPIEntry', nameAr: 'مؤشرات الأداء', count: kpiEntriesCount, icon: 'kpi' },
        { name: 'Penalty', nameAr: 'المخالفات', count: penaltiesCount, icon: 'penalties' },
        { name: 'Deliverable', nameAr: 'المخرجات', count: deliverablesCount, icon: 'deliverables' },
        { name: 'Scope', nameAr: 'النطاقات', count: scopesCount, icon: 'scope' },
        { name: 'TrackKPI', nameAr: 'مؤشرات المسارات', count: trackKpisCount, icon: 'kpi' },
        { name: 'Report', nameAr: 'التقارير', count: reportsCount, icon: 'reports' },
        { name: 'AIReport', nameAr: 'تقارير الذكاء الاصطناعي', count: aiReportsCount, icon: 'ai' },
        { name: 'AuditLog', nameAr: 'سجلات المراجعة', count: auditLogsCount, icon: 'audit' },
        { name: 'Comment', nameAr: 'التعليقات', count: commentsCount, icon: 'comments' },
        { name: 'Notification', nameAr: 'الإشعارات', count: notificationsCount, icon: 'notifications' },
        { name: 'Embedding', nameAr: 'الفهرسة الذكية', count: embeddingsCount, icon: 'embeddings' },
        { name: 'ImportHistory', nameAr: 'سجل الاستيراد', count: importHistoryCount, icon: 'import' },
        { name: 'ProgressItem', nameAr: 'عناصر التقدم', count: progressItemsCount, icon: 'progress' },
        { name: 'Achievement', nameAr: 'الإنجازات', count: achievementsCount, icon: 'achievements' },
      ],
      totalRecords:
        usersCount + tracksCount + employeesCount + tasksCount + dailyUpdatesCount +
        uploadedFilesCount + taskFilesCount + scopeBlocksCount +
        kpiEntriesCount + penaltiesCount + deliverablesCount + scopesCount +
        trackKpisCount + reportsCount + aiReportsCount + auditLogsCount +
        commentsCount + notificationsCount + embeddingsCount + importHistoryCount +
        progressItemsCount + achievementsCount + taskAssignmentsCount +
        taskChecklistCount + adminNotesCount + taskUpdatesCount,
    };
  }

  // ─── DATA INTEGRITY VALIDATION ────────────────────────

  async validateDataIntegrity() {
    const issues: Array<{ severity: 'error' | 'warning' | 'info'; model: string; message: string; count?: number }> = [];

    // Orphaned tasks (trackId references non-existent track)
    const orphanedTasks = await this.prisma.task.count({
      where: { trackId: { not: null }, track: null },
    });
    if (orphanedTasks > 0) {
      issues.push({ severity: 'error', model: 'Task', message: `${orphanedTasks} مهام بدون مسار صالح`, count: orphanedTasks });
    }

    // Tasks with creator pointing to missing user
    const noCreatorTasks = await this.prisma.task.count({
      where: { createdBy: { is: { isActive: false } } },
    });
    if (noCreatorTasks > 0) {
      issues.push({ severity: 'warning', model: 'Task', message: `${noCreatorTasks} مهام منشؤها مستخدم غير نشط`, count: noCreatorTasks });
    }

    // Files with missing physical paths
    const allFiles = await this.prisma.uploadedFile.findMany({ select: { id: true, filePath: true, fileName: true } });
    let missingFiles = 0;
    const { existsSync } = await import('fs');
    for (const f of allFiles) {
      if (f.filePath && f.filePath !== 'external' && !existsSync(f.filePath)) {
        missingFiles++;
      }
    }
    if (missingFiles > 0) {
      issues.push({ severity: 'warning', model: 'UploadedFile', message: `${missingFiles} ملفات مفقودة من القرص`, count: missingFiles });
    }

    // Task files with missing physical paths
    const allTaskFiles = await this.prisma.taskFile.findMany({ select: { id: true, filePath: true } });
    let missingTaskFiles = 0;
    for (const f of allTaskFiles) {
      if (f.filePath && !existsSync(f.filePath)) {
        missingTaskFiles++;
      }
    }
    if (missingTaskFiles > 0) {
      issues.push({ severity: 'warning', model: 'TaskFile', message: `${missingTaskFiles} ملفات مهام مفقودة من القرص`, count: missingTaskFiles });
    }

    // Users without any track permissions (non-admin)
    const usersNoPerms = await this.prisma.user.count({
      where: {
        role: { notIn: ['admin', 'pm'] },
        trackPermissions: { none: {} },
      },
    });
    if (usersNoPerms > 0) {
      issues.push({ severity: 'info', model: 'User', message: `${usersNoPerms} مستخدمين بدون صلاحيات مسارات`, count: usersNoPerms });
    }

    // Overdue tasks not notified
    const overdueNotNotified = await this.prisma.task.count({
      where: {
        isDeleted: false,
        dueDate: { lt: new Date() },
        status: { notIn: ['completed', 'cancelled'] },
        lastOverdueNotifiedAt: null,
      },
    });
    if (overdueNotNotified > 0) {
      issues.push({ severity: 'info', model: 'Task', message: `${overdueNotNotified} مهام متأخرة لم يتم إشعار أصحابها`, count: overdueNotNotified });
    }

    // Soft-deleted but not cleaned up
    const softDeletedTasks = await this.prisma.task.count({ where: { isDeleted: true } });
    if (softDeletedTasks > 0) {
      issues.push({ severity: 'info', model: 'Task', message: `${softDeletedTasks} مهام محذوفة (soft delete)`, count: softDeletedTasks });
    }

    const softDeletedEmployees = await this.prisma.employee.count({ where: { isDeleted: true } });
    if (softDeletedEmployees > 0) {
      issues.push({ severity: 'info', model: 'Employee', message: `${softDeletedEmployees} موظفين محذوفين (soft delete)`, count: softDeletedEmployees });
    }

    // Tracks with no tasks
    const tracks = await this.prisma.track.findMany({ select: { id: true, nameAr: true, _count: { select: { tasks: true } } } });
    const emptyTracks = tracks.filter((t) => t._count.tasks === 0);
    if (emptyTracks.length > 0) {
      issues.push({ severity: 'info', model: 'Track', message: `${emptyTracks.length} مسارات بدون مهام: ${emptyTracks.map((t) => t.nameAr).join(', ')}`, count: emptyTracks.length });
    }

    // Locked users
    const lockedUsers = await this.prisma.user.count({ where: { isLocked: true } });
    if (lockedUsers > 0) {
      issues.push({ severity: 'warning', model: 'User', message: `${lockedUsers} مستخدمين مقفلين`, count: lockedUsers });
    }

    return {
      timestamp: new Date().toISOString(),
      totalIssues: issues.length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
      issues,
    };
  }

  // ─── TRACKS DEEP EXPORT ─────────────────────────────

  async getTrackDeepExport(trackId?: string) {
    const where = trackId ? { id: trackId } : {};
    return this.prisma.track.findMany({
      where,
      include: {
        permissions: {
          include: { user: { select: { id: true, name: true, nameAr: true, email: true, role: true } } },
        },
        employees: true,
        deliverables: true,
        kpis: true,
        penalties: true,
        scopes: true,
        scopeBlocks: { orderBy: { orderIndex: 'asc' } },
        files: {
          include: { uploadedBy: { select: { id: true, name: true, nameAr: true } } },
        },
        kpiEntries: true,
        tasks: {
          include: {
            createdBy: { select: { id: true, name: true, nameAr: true } },
            assigneeUser: { select: { id: true, name: true, nameAr: true } },
            assignments: { include: { user: { select: { id: true, nameAr: true } } } },
            checklist: true,
            files: true,
            adminNotes: { include: { author: { select: { id: true, nameAr: true } } } },
            taskUpdates: { include: { author: { select: { id: true, nameAr: true } } }, orderBy: { createdAt: 'desc' } },
            auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
          },
        },
        dailyUpdates: {
          include: {
            author: { select: { id: true, name: true, nameAr: true } },
            fileAttachments: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        aiReports: {
          include: { author: { select: { id: true, nameAr: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  // ─── ZIP EXPORT ──────────────────────────────────────

  async createZipExport(): Promise<{ stream: PassThrough; filename: string }> {
    const exportData = await this.getFullExport();
    const integrity = await this.validateDataIntegrity();
    const trackDeep = await this.getTrackDeepExport();

    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.pipe(passThrough);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `nusuk-backup-${timestamp}.zip`;

    // Add JSON files
    archive.append(JSON.stringify(exportData, null, 2), { name: 'full-export.json' });
    archive.append(JSON.stringify(integrity, null, 2), { name: 'integrity-report.json' });
    archive.append(JSON.stringify(trackDeep, null, 2), { name: 'tracks-deep.json' });
    archive.append(JSON.stringify(exportData.counts, null, 2), { name: 'counts.json' });

    // Schema info
    const schemaInfo = {
      models: Object.keys(exportData.counts),
      enums: ['Role', 'RecordStatus', 'Priority', 'ReportType', 'FileStatus', 'KPIStatus', 'TaskStatus', 'AssigneeType', 'ChecklistStatus', 'NotificationType', 'AIReportType'],
      database: 'PostgreSQL',
      orm: 'Prisma',
    };
    archive.append(JSON.stringify(schemaInfo, null, 2), { name: 'schema-info.json' });

    // Per-track exports
    for (const track of trackDeep) {
      const safeName = track.nameAr.replace(/[/\\?%*:|"<>]/g, '_');
      archive.append(JSON.stringify(track, null, 2), { name: `tracks/${safeName}.json` });
    }

    // Recovery summary
    const summary = {
      exportedAt: new Date().toISOString(),
      totalRecords: Object.values(exportData.counts).reduce((a: number, b: number) => a + b, 0),
      counts: exportData.counts,
      integrityIssues: integrity.totalIssues,
      tracksExported: trackDeep.length,
    };
    archive.append(JSON.stringify(summary, null, 2), { name: 'recovery-summary.json' });

    archive.finalize();

    return { stream: passThrough, filename };
  }

  // ─── INDIVIDUAL MODEL EXPORTS ────────────────────────

  private async exportTracks() {
    return this.prisma.track.findMany({
      include: {
        permissions: { include: { user: { select: { id: true, name: true, nameAr: true, role: true } } } },
        _count: { select: { employees: true, tasks: true, files: true, dailyUpdates: true, kpiEntries: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async exportUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true, email: true, name: true, nameAr: true, role: true,
        isActive: true, lastLoginAt: true, loginCount: true, isLocked: true,
        createdAt: true, updatedAt: true,
        trackPermissions: { include: { track: { select: { id: true, nameAr: true } } } },
        _count: {
          select: { createdTasks: true, taskAssignments: true, comments: true, uploadedFiles: true, dailyUpdates: true, aiReports: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async exportEmployees() {
    return this.prisma.employee.findMany({
      include: { track: { select: { id: true, nameAr: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async exportTasks() {
    return this.prisma.task.findMany({
      include: {
        track: { select: { id: true, nameAr: true } },
        scopeBlock: { select: { id: true, code: true, title: true } },
        createdBy: { select: { id: true, nameAr: true } },
        assigneeUser: { select: { id: true, nameAr: true } },
        assigneeTrack: { select: { id: true, nameAr: true } },
        assignments: { include: { user: { select: { id: true, nameAr: true } } } },
        _count: { select: { files: true, checklist: true, adminNotes: true, taskUpdates: true, auditLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportDailyUpdates() {
    return this.prisma.dailyUpdate.findMany({
      include: {
        author: { select: { id: true, name: true, nameAr: true } },
        track: { select: { id: true, nameAr: true } },
        fileAttachments: true,
        _count: { select: { reads: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportUploadedFiles() {
    return this.prisma.uploadedFile.findMany({
      include: {
        track: { select: { id: true, nameAr: true } },
        uploadedBy: { select: { id: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportTaskFiles() {
    return this.prisma.taskFile.findMany({
      include: {
        task: { select: { id: true, titleAr: true } },
        uploadedBy: { select: { id: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportScopeBlocks() {
    return this.prisma.scopeBlock.findMany({
      include: { track: { select: { id: true, nameAr: true } } },
      orderBy: [{ trackId: 'asc' }, { orderIndex: 'asc' }],
    });
  }

  private async exportKPIEntries() {
    return this.prisma.kPIEntry.findMany({
      include: { track: { select: { id: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportPenalties() {
    return this.prisma.penalty.findMany({
      include: { track: { select: { id: true, nameAr: true } } },
    });
  }

  private async exportDeliverables() {
    return this.prisma.deliverable.findMany({
      include: { track: { select: { id: true, nameAr: true } } },
    });
  }

  private async exportScopes() {
    return this.prisma.scope.findMany({
      include: { track: { select: { id: true, nameAr: true } } },
    });
  }

  private async exportTrackKPIs() {
    return this.prisma.trackKPI.findMany({
      include: { track: { select: { id: true, nameAr: true } } },
    });
  }

  private async exportReports() {
    return this.prisma.report.findMany({
      include: {
        track: { select: { id: true, nameAr: true } },
        author: { select: { id: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportAIReports() {
    return this.prisma.aIReport.findMany({
      include: {
        track: { select: { id: true, nameAr: true } },
        author: { select: { id: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportAuditLogs() {
    return this.prisma.auditLog.findMany({
      include: {
        actor: { select: { id: true, nameAr: true } },
        track: { select: { id: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
  }

  private async exportComments() {
    return this.prisma.comment.findMany({
      include: { author: { select: { id: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportNotifications() {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
  }

  private async exportEmbeddings() {
    return this.prisma.embedding.findMany();
  }

  private async exportImportHistory() {
    return this.prisma.importHistory.findMany({
      include: { author: { select: { id: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async exportProgressItems() {
    return this.prisma.progressItem.findMany();
  }

  private async exportAchievements() {
    return this.prisma.achievement.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
