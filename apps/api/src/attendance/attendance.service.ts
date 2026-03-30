import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { BioTimeClient } from './biotime.client';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private prisma: PrismaService,
    private biotime: BioTimeClient,
  ) {}

  /** Process raw punch logs into daily attendance records */
  private processLogs(logs: Array<{ empCode: string; empName: string; punchTime: Date }>, workStart: string, grace: number) {
    // Group by employee + date
    const groups = new Map<string, typeof logs>();
    for (const log of logs) {
      const date = new Date(log.punchTime).toISOString().slice(0, 10);
      const key = `${log.empCode}|${date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(log);
    }

    const results: Array<{
      empCode: string; empName: string; attendanceDate: Date;
      checkIn: Date | null; checkOut: Date | null;
      workMinutes: number; lateMinutes: number; status: string;
    }> = [];

    for (const [key, punches] of groups) {
      const [empCode, dateStr] = key.split('|');
      const sorted = punches.sort((a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime());

      const checkIn = sorted[0] ? new Date(sorted[0].punchTime) : null;
      const checkOut = sorted.length > 1 ? new Date(sorted[sorted.length - 1].punchTime) : null;
      const empName = sorted[0]?.empName || '';

      // Work duration
      let workMinutes = 0;
      if (checkIn && checkOut) {
        workMinutes = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000));
      }

      // Late calculation
      let lateMinutes = 0;
      if (checkIn) {
        const [startH, startM] = workStart.split(':').map(Number);
        const expected = new Date(checkIn);
        expected.setHours(startH, startM + grace, 0, 0);
        if (checkIn > expected) {
          lateMinutes = Math.round((checkIn.getTime() - expected.getTime()) / 60000);
        }
      }

      // Status
      let status = 'absent';
      if (checkIn && checkOut) status = lateMinutes > 0 ? 'late' : 'present';
      else if (checkIn && !checkOut) status = 'incomplete';

      results.push({
        empCode, empName, attendanceDate: new Date(dateStr + 'T00:00:00Z'),
        checkIn, checkOut, workMinutes, lateMinutes, status,
      });
    }

    return results;
  }

  /** Sync attendance from BioTime */
  async syncAttendance(type: 'manual' | 'scheduled' = 'manual') {
    const start = Date.now();
    const config = await this.prisma.attendanceConfig.findUnique({ where: { id: 'default' } });
    const workStart = config?.workStartTime || '09:00';
    const grace = config?.graceMinutes || 15;

    // Determine sync range (last 3 days by default)
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);

    try {
      this.logger.log(`Sync starting (${type}): ${fromDate} → ${toDate}`);

      const rawLogs = await this.biotime.fetchTransactions(fromDate, toDate);
      this.logger.log(`Fetched ${rawLogs.length} raw logs`);

      // Store raw logs (upsert to avoid duplicates)
      let stored = 0;
      for (const log of rawLogs) {
        const empCode = log.emp_code || log.empCode || log.employee_code || '';
        const punchTime = new Date(log.punch_time || log.punchTime || log.att_time || '');
        if (!empCode || isNaN(punchTime.getTime())) continue;

        try {
          await this.prisma.attendanceRawLog.upsert({
            where: { empCode_punchTime: { empCode, punchTime } },
            update: {},
            create: {
              empCode,
              empName: log.emp_name || log.first_name || '',
              punchTime,
              punchState: log.punch_state || log.punch_state_display || '',
              terminalSn: log.terminal_sn || log.terminal || '',
            },
          });
          stored++;
        } catch { /* duplicate — skip */ }
      }

      // Load all raw logs for the period and process
      const allLogs = await this.prisma.attendanceRawLog.findMany({
        where: { punchTime: { gte: new Date(fromDate), lte: new Date(toDate + 'T23:59:59Z') } },
      });

      const processed = this.processLogs(
        allLogs.map((l) => ({ empCode: l.empCode, empName: l.empName, punchTime: l.punchTime })),
        workStart, grace,
      );

      // Upsert daily attendance
      let processedCount = 0;
      for (const rec of processed) {
        await this.prisma.attendanceDaily.upsert({
          where: { empCode_attendanceDate: { empCode: rec.empCode, attendanceDate: rec.attendanceDate } },
          update: {
            empName: rec.empName, checkIn: rec.checkIn, checkOut: rec.checkOut,
            workMinutes: rec.workMinutes, lateMinutes: rec.lateMinutes, status: rec.status,
          },
          create: rec,
        });
        processedCount++;
      }

      // Update config
      await this.prisma.attendanceConfig.update({
        where: { id: 'default' },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'success' },
      });

      // Log sync
      await this.prisma.attendanceSyncLog.create({
        data: {
          syncType: type, status: 'success',
          recordsFetched: rawLogs.length, recordsProcessed: processedCount,
          syncFrom: new Date(fromDate), syncTo: new Date(toDate),
          durationMs: Date.now() - start,
        },
      });

      this.logger.log(`Sync complete: ${stored} stored, ${processedCount} processed`);
      return { success: true, fetched: rawLogs.length, processed: processedCount };

    } catch (error: any) {
      this.logger.error(`Sync failed: ${error.message}`);

      await this.prisma.attendanceConfig.update({
        where: { id: 'default' },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'failed' },
      }).catch(() => {});

      await this.prisma.attendanceSyncLog.create({
        data: {
          syncType: type, status: 'failed', errorMessage: error.message,
          durationMs: Date.now() - start,
        },
      }).catch(() => {});

      return { success: false, error: error.message };
    }
  }

  /** Scheduled sync — runs every 30 min by default */
  @Cron('0 */30 * * * *')
  async scheduledSync() {
    const config = await this.prisma.attendanceConfig.findUnique({ where: { id: 'default' } });
    if (!config?.baseUrl && !process.env.BIOTIME_BASE_URL) return; // not configured
    await this.syncAttendance('scheduled');
  }

  /** Get daily attendance records */
  async getDailyAttendance(date?: string) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    return this.prisma.attendanceDaily.findMany({
      where: { attendanceDate: new Date(targetDate + 'T00:00:00Z') },
      orderBy: { empName: 'asc' },
    });
  }

  /** Get attendance summary for a date */
  async getSummary(date?: string) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const records = await this.getDailyAttendance(targetDate);

    const total = records.length;
    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const incomplete = records.filter((r) => r.status === 'incomplete').length;

    return {
      date: targetDate, total,
      present, late, absent, incomplete,
      attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      lateRate: total > 0 ? Math.round((late / total) * 100) : 0,
      records,
    };
  }

  /** Get config */
  async getConfig() {
    let config = await this.prisma.attendanceConfig.findUnique({ where: { id: 'default' } });
    if (!config) config = await this.prisma.attendanceConfig.create({ data: { id: 'default' } });
    return config;
  }

  /** Update config */
  async updateConfig(data: any) {
    return this.prisma.attendanceConfig.update({ where: { id: 'default' }, data });
  }

  /** Get sync logs */
  async getSyncLogs(limit = 20) {
    return this.prisma.attendanceSyncLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
