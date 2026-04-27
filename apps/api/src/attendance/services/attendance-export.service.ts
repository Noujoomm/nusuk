import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PdfAttendanceCenter, PdfAttendanceStatus, PdfShiftType } from '@prisma/client';
import * as ExcelJS from 'exceljs';

export type ExportScope = 'all' | 'track' | 'center';

const STATUS_LABEL: Record<PdfAttendanceStatus, string> = {
  present: 'حاضر',
  incomplete_hours: 'أقل من 8 ساعات',
  check_in_only: 'دخول بدون خروج',
  check_out_only: 'خروج بدون دخول',
  absent: 'غائب',
  on_call_present: 'On Call — حضر',
  on_call_no_visit: 'On Call — لم يحضر',
  on_call_check_in_only: 'On Call — بدون خروج',
  on_call_check_out_only: 'On Call — بدون دخول',
  online: 'أونلاين',
  unscheduled: 'بدون وقت محدد',
  exempt: 'معفى (قديم)',
};

const SHIFT_LABEL: Record<PdfShiftType, string> = {
  morning: 'صباحي',
  evening: 'مسائي',
  night: 'ليلي',
  on_call: 'On Call',
  online: 'أونلاين',
  unscheduled: 'بدون وقت محدد',
  rotating: 'صباحي/مسائي بالتناوب',
};

const CENTER_LABEL: Record<PdfAttendanceCenter, string> = {
  makkah: 'مكة المكرمة',
  madinah: 'المدينة المنورة',
  shared: 'مشترك',
};

interface SummaryRow {
  id: string;
  reportDate: Date;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  totalHours: number | null;
  status: PdfAttendanceStatus;
  flags: string[];
  employee: {
    id: string;
    fullName: string;
    track: string;
    trackDetail: string | null;
    shiftType: PdfShiftType;
    scheduledCheckIn: string | null;
    scheduledCheckOut: string | null;
    center: PdfAttendanceCenter | null;
    employeeNumber: string | null;
    worksByCharter: boolean;
  };
}

@Injectable()
export class AttendanceExportService {
  constructor(private prisma: PrismaService) {}

  /**
   * Builds an Excel workbook for one upload, optionally filtered by track or
   * center. Sheets are RTL and use Arabic labels throughout. The filename
   * carries the report date so users can stack multiple exports without
   * overwriting.
   */
  async exportXlsx(
    uploadId: string,
    scope: ExportScope = 'all',
    filter?: string,
    rosterOnly = false,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const upload = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
      select: { id: true, reportDate: true, fileName: true },
    });
    if (!upload) throw new NotFoundException('الرفعة غير موجودة');

    const allRows = (await this.prisma.pdfDailyAttendanceSummary.findMany({
      where: { uploadId },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            track: true,
            trackDetail: true,
            shiftType: true,
            scheduledCheckIn: true,
            scheduledCheckOut: true,
            center: true,
            employeeNumber: true,
            worksByCharter: true,
          },
        },
      },
      orderBy: [{ employee: { track: 'asc' } }, { employee: { fullName: 'asc' } }],
    })) as SummaryRow[];

    let rows = this.applyScope(allRows, scope, filter);
    if (rosterOnly) rows = rows.filter((r) => r.employee.worksByCharter);
    if (rows.length === 0) {
      throw new BadRequestException('لا توجد سجلات تطابق هذا النطاق');
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Roya Platform';
    wb.created = new Date();

    if (scope === 'all') {
      this.buildOverviewSheet(wb, rows, upload.reportDate);
      this.buildPivotSheet(wb, 'حسب المسار', rows, (r) => r.employee.track || '—');
      this.buildPivotSheet(wb, 'حسب المركز', rows, (r) =>
        r.employee.center ? CENTER_LABEL[r.employee.center] : 'غير محدد',
      );
      // One sheet per track for granular drill-down.
      const tracks = Array.from(new Set(rows.map((r) => r.employee.track || 'بدون مسار')));
      for (const t of tracks) {
        const trackRows = rows.filter((r) => (r.employee.track || 'بدون مسار') === t);
        this.buildDetailSheet(wb, this.safeSheetName(t), trackRows);
      }
    } else if (scope === 'track') {
      this.buildOverviewSheet(wb, rows, upload.reportDate, `المسار: ${filter}`);
      this.buildDetailSheet(wb, 'التفاصيل', rows);
    } else if (scope === 'center') {
      const centerLabel = filter
        ? CENTER_LABEL[filter as PdfAttendanceCenter] ?? filter
        : '—';
      this.buildOverviewSheet(wb, rows, upload.reportDate, `المركز: ${centerLabel}`);
      this.buildPivotSheet(wb, 'حسب المسار', rows, (r) => r.employee.track || '—');
      const tracks = Array.from(new Set(rows.map((r) => r.employee.track || 'بدون مسار')));
      for (const t of tracks) {
        const trackRows = rows.filter((r) => (r.employee.track || 'بدون مسار') === t);
        this.buildDetailSheet(wb, this.safeSheetName(t), trackRows);
      }
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = this.makeFilename(upload.reportDate, scope, filter);
    return { buffer, filename };
  }

  // ─── Sheet builders ──────────────────────────────────────────────────────

  private buildOverviewSheet(
    wb: ExcelJS.Workbook,
    rows: SummaryRow[],
    reportDate: Date,
    subtitle?: string,
  ): void {
    const ws = wb.addWorksheet('الملخص', { views: [{ rightToLeft: true }] });

    const inRoster = rows.filter((r) => r.employee.worksByCharter).length;
    const outOfRoster = rows.length - inRoster;

    ws.addRow(['تقرير الحضور والانصراف']);
    ws.getRow(1).font = { size: 16, bold: true };
    ws.addRow(['تاريخ التقرير', reportDate.toISOString().slice(0, 10)]);
    if (subtitle) ws.addRow(['النطاق', subtitle]);
    ws.addRow(['عدد الموظفين الإجمالي', rows.length]);
    ws.addRow(['ضمن الكراسة الرسمية', inRoster]);
    ws.addRow(['خارج الكراسة', outOfRoster]);
    ws.addRow([]);

    ws.addRow(['الحالة', 'العدد', 'ضمن الكراسة']).font = { bold: true };
    const counts = this.countByStatus(rows);
    for (const [status, count] of counts) {
      const inRosterForStatus = rows.filter(
        (r) => r.status === status && r.employee.worksByCharter,
      ).length;
      ws.addRow([STATUS_LABEL[status], count, inRosterForStatus]);
    }

    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 20;
    ws.getColumn(3).width = 20;
  }

  private buildPivotSheet(
    wb: ExcelJS.Workbook,
    name: string,
    rows: SummaryRow[],
    grouper: (r: SummaryRow) => string,
  ): void {
    const ws = wb.addWorksheet(this.safeSheetName(name), { views: [{ rightToLeft: true }] });

    ws.addRow([
      name,
      'الإجمالي',
      'حاضر',
      'أقل من 8',
      'دخول بدون خروج',
      'خروج بدون دخول',
      'غائب',
      'On Call (حضر)',
      'On Call (لم يحضر)',
      'أونلاين',
      'بدون وقت',
    ]).font = { bold: true };

    const groups = new Map<string, SummaryRow[]>();
    for (const r of rows) {
      const k = grouper(r);
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'ar'));
    for (const key of sortedKeys) {
      const grp = groups.get(key)!;
      ws.addRow([
        key,
        grp.length,
        grp.filter((r) => r.status === 'present').length,
        grp.filter((r) => r.status === 'incomplete_hours').length,
        grp.filter((r) => r.status === 'check_in_only').length,
        grp.filter((r) => r.status === 'check_out_only').length,
        grp.filter((r) => r.status === 'absent').length,
        grp.filter((r) => r.status === 'on_call_present').length,
        grp.filter((r) => r.status === 'on_call_no_visit').length,
        grp.filter((r) => r.status === 'online').length,
        grp.filter((r) => r.status === 'unscheduled').length,
      ]);
    }

    ws.getColumn(1).width = 30;
    for (let i = 2; i <= 11; i++) ws.getColumn(i).width = 14;
  }

  private buildDetailSheet(wb: ExcelJS.Workbook, name: string, rows: SummaryRow[]): void {
    const ws = wb.addWorksheet(this.safeSheetName(name), { views: [{ rightToLeft: true }] });

    ws.addRow([
      'الموظف',
      'الرقم الوظيفي',
      'ضمن الكراسة',
      'المسار',
      'تفاصيل المسار',
      'المركز',
      'نوع الدوام',
      'الدخول المجدول',
      'الخروج المجدول',
      'أول دخول',
      'آخر خروج',
      'مجموع الساعات',
      'الحالة',
      'تنبيهات',
    ]).font = { bold: true };

    for (const r of rows) {
      ws.addRow([
        r.employee.fullName,
        r.employee.employeeNumber ?? '—',
        r.employee.worksByCharter ? '✓' : '—',
        r.employee.track,
        r.employee.trackDetail ?? '—',
        r.employee.center ? CENTER_LABEL[r.employee.center] : '—',
        SHIFT_LABEL[r.employee.shiftType],
        r.employee.scheduledCheckIn ?? '—',
        r.employee.scheduledCheckOut ?? '—',
        r.firstCheckIn ?? '—',
        r.lastCheckOut ?? '—',
        r.totalHours != null ? Number(r.totalHours.toFixed(1)) : '—',
        STATUS_LABEL[r.status],
        (r.flags ?? []).join(', ') || '—',
      ]);
    }

    ws.getColumn(1).width = 32;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 22;
    ws.getColumn(5).width = 22;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 18;
    for (const i of [2, 8, 9, 10, 11, 12]) ws.getColumn(i).width = 14;
    ws.getColumn(13).width = 22;
    ws.getColumn(14).width = 26;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private applyScope(rows: SummaryRow[], scope: ExportScope, filter?: string): SummaryRow[] {
    if (scope === 'track' && filter) {
      return rows.filter((r) => r.employee.track === filter);
    }
    if (scope === 'center' && filter) {
      return rows.filter((r) => r.employee.center === filter);
    }
    return rows;
  }

  private countByStatus(rows: SummaryRow[]): Array<[PdfAttendanceStatus, number]> {
    const counts = new Map<PdfAttendanceStatus, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }

  /** Excel caps sheet names at 31 chars and disallows: : \ / ? * [ ] */
  private safeSheetName(raw: string): string {
    return raw.replace(/[:\\\/?*\[\]]/g, '_').slice(0, 31) || 'Sheet';
  }

  private makeFilename(reportDate: Date, scope: ExportScope, filter?: string): string {
    const dateStr = reportDate.toISOString().slice(0, 10);
    let base = `الحضور_${dateStr}`;
    if (scope === 'track' && filter) {
      base = `الحضور_${this.safeFilenamePart(filter)}_${dateStr}`;
    } else if (scope === 'center' && filter) {
      const label = CENTER_LABEL[filter as PdfAttendanceCenter] ?? filter;
      base = `الحضور_${this.safeFilenamePart(label)}_${dateStr}`;
    }
    return `${base}.xlsx`;
  }

  private safeFilenamePart(raw: string): string {
    return raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  }
}
