import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';
import type { PdfAttendanceCenter, PdfShiftType, PdfAttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * Comprehensive Arabic attendance report — one DOCX per upload.
 *
 * Sections:
 *   1. Cover (project, period, source filename)
 *   2. Executive KPIs (attendance %, hours, late minutes, …)
 *   3. By track table
 *   4. By city table (مكة / المدينة / مشترك)
 *   5. Charter compliance (within / outside) + deviations list
 *   6. Per-employee pages — one section per employee with daily table
 *   7. Alerts page — high-severity rows from the AI analysis
 *
 * Why DOCX (not PDF): the existing project ships `docx` already, it
 * renders Arabic+RTL flawlessly in Word, and users edit reports before
 * sending to the ministry. PDF is added later via DOCX→PDF if needed.
 */
@Injectable()
export class AttendanceReportDocxService {
  private readonly logger = new Logger(AttendanceReportDocxService.name);

  // Use Arial (Word maps it to Arabic shaping) and a brand color.
  private readonly FONT = 'Arial';
  private readonly BRAND = '0F4C5C';
  private readonly HEADER_BG = '0F4C5C';

  constructor(private readonly prisma: PrismaService) {}

  async generate(uploadId: string): Promise<{ buffer: Buffer; filename: string }> {
    const upload = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
      include: {
        analysis: true,
        summaries: {
          orderBy: [{ employee: { fullName: 'asc' } }, { reportDate: 'asc' }],
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
                track: true,
                trackDetail: true,
                shiftType: true,
                center: true,
                scheduledCheckIn: true,
                scheduledCheckOut: true,
                worksByCharter: true,
              },
            },
          },
        },
      },
    });
    if (!upload) throw new NotFoundException('الرفعة غير موجودة');

    const period = upload.reportDate.toISOString().slice(0, 10);
    const grouped = groupByEmployee(upload.summaries);

    const doc = new Document({
      creator: 'منصة رؤية - Roya Platform',
      title: `تقرير الحضور والانصراف — ${period}`,
      description: 'Comprehensive attendance & schedule-compliance report',
      styles: {
        default: {
          document: {
            run: { font: this.FONT, size: 22 }, // 11pt
            paragraph: { spacing: { line: 320 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { orientation: PageOrientation.PORTRAIT },
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children: [
            ...this.cover(upload),
            ...this.executiveKpis(upload),
            ...this.byTrackSection(upload),
            ...this.byCitySection(upload),
            ...this.charterSection(upload),
            ...this.employeePages(grouped),
            ...this.alertsPage(upload),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeDate = period.replace(/-/g, '');
    const filename = `تقرير-الحضور-${safeDate}.docx`;
    this.logger.log(`Generated DOCX for upload=${uploadId} size=${buffer.length}B`);
    return { buffer: Buffer.from(buffer), filename };
  }

  // ─── Cover ───────────────────────────────────────────────────────────
  private cover(upload: any) {
    return [
      this.h1('تقرير الحضور والانصراف'),
      this.p('مشروع بطاقة نُسك — وزارة الحج والعمرة', { center: true, size: 26 }),
      this.spacer(8),
      this.kvTable([
        ['تاريخ التقرير', upload.reportDate.toISOString().slice(0, 10)],
        ['الملف المصدر', upload.fileName ?? '—'],
        ['إجمالي السجلات', String(upload.totalRecords ?? 0)],
        ['متطابق مع الكراسة', String(upload.matchedCount ?? 0)],
        ['غير متطابق', String(upload.unmatchedCount ?? 0)],
        ['تاريخ التوليد', new Date().toISOString().slice(0, 16).replace('T', ' ')],
      ]),
      this.spacer(20),
    ];
  }

  // ─── Executive KPIs ─────────────────────────────────────────────────
  private executiveKpis(upload: any) {
    const ai = upload.analysis;
    const summaries = upload.summaries as any[];
    const totalEmployees = new Set(summaries.map((s) => s.employee.id)).size;
    const present = summaries.filter((s) => s.status === 'present' || s.status === 'on_call_present').length;
    const absent = summaries.filter((s) => s.status === 'absent').length;
    const incomplete = summaries.filter((s) => s.status === 'incomplete_hours').length;
    const totalHours = summaries.reduce((acc, s) => acc + (s.totalHours ?? 0), 0);

    const rows: [string, string][] = [
      ['إجمالي الموظفين', String(totalEmployees)],
      ['إجمالي السجلات اليومية', String(summaries.length)],
      ['الحضور', String(present)],
      ['الغياب', String(absent)],
      ['دوام أقل من 8 ساعات', String(incomplete)],
      ['إجمالي ساعات العمل', `${totalHours.toFixed(1)} ساعة`],
    ];
    if (ai) {
      rows.push(
        ['نسبة الحضور (AI)', `${ai.attendanceRate.toFixed(1)}%`],
        ['نسبة الانضباط (AI)', `${ai.punctualityRate.toFixed(1)}%`],
        ['متوسط ساعات العمل', `${ai.averageWorkHours.toFixed(1)} ساعة`],
        ['إجمالي دقائق التأخير', String(ai.totalLateMinutes)],
      );
    }

    return [
      this.h2('الملخص التنفيذي'),
      this.kvTable(rows),
      ...(ai?.executiveSummary ? [this.spacer(6), this.h3('ملخص الذكاء الاصطناعي'), this.p(ai.executiveSummary)] : []),
      this.pageBreak(),
    ];
  }

  // ─── By track ───────────────────────────────────────────────────────
  private byTrackSection(upload: any) {
    const summaries = upload.summaries as any[];
    const map = new Map<string, { total: number; present: number; absent: number; hours: number; employees: Set<string> }>();
    for (const s of summaries) {
      const t = s.employee.track || 'غير محدد';
      const cur = map.get(t) ?? { total: 0, present: 0, absent: 0, hours: 0, employees: new Set<string>() };
      cur.total += 1;
      cur.employees.add(s.employee.id);
      if (s.status === 'present' || s.status === 'on_call_present') cur.present += 1;
      if (s.status === 'absent') cur.absent += 1;
      cur.hours += s.totalHours ?? 0;
      map.set(t, cur);
    }

    const rows = [...map.entries()].map(([trackName, v]) => [
      trackName,
      String(v.employees.size),
      `${((v.present / Math.max(v.total, 1)) * 100).toFixed(1)}%`,
      `${v.hours.toFixed(1)}`,
      String(v.absent),
    ]);

    return [
      this.h2('التوزيع حسب المسار'),
      this.headerTable(['المسار', 'الموظفون', 'نسبة الحضور', 'الساعات', 'الغياب'], rows),
      this.spacer(12),
    ];
  }

  // ─── By city ────────────────────────────────────────────────────────
  private byCitySection(upload: any) {
    const summaries = upload.summaries as any[];
    const labels: Record<PdfAttendanceCenter | 'shared', string> = {
      makkah: 'مكة المكرمة',
      madinah: 'المدينة المنورة',
      shared: 'مشترك',
    };
    const map = new Map<string, { total: number; present: number; hours: number; employees: Set<string> }>();
    for (const s of summaries) {
      const c = (s.employee.center as PdfAttendanceCenter | null) || 'shared';
      const cur = map.get(c) ?? { total: 0, present: 0, hours: 0, employees: new Set<string>() };
      cur.total += 1;
      cur.employees.add(s.employee.id);
      if (s.status === 'present' || s.status === 'on_call_present') cur.present += 1;
      cur.hours += s.totalHours ?? 0;
      map.set(c, cur);
    }
    const rows = [...map.entries()].map(([k, v]) => [
      labels[k as keyof typeof labels] ?? 'مشترك',
      String(v.employees.size),
      `${((v.present / Math.max(v.total, 1)) * 100).toFixed(1)}%`,
      v.hours.toFixed(1),
    ]);
    return [
      this.h2('التوزيع حسب المدينة'),
      this.headerTable(['المدينة', 'الموظفون', 'نسبة الحضور', 'الساعات'], rows),
      this.spacer(12),
    ];
  }

  // ─── Charter compliance ─────────────────────────────────────────────
  private charterSection(upload: any) {
    const summaries = upload.summaries as any[];
    const within = summaries.filter((s) => s.employee.worksByCharter);
    const outside = summaries.filter((s) => !s.employee.worksByCharter);
    const withinPresent = within.filter((s) => s.status === 'present' || s.status === 'on_call_present').length;
    const withinEmps = new Set(within.map((s) => s.employee.id)).size;
    const outsideEmps = new Set(outside.map((s) => s.employee.id)).size;
    const total = withinEmps + outsideEmps;

    const rows = [
      ['ضمن الكراسة', String(withinEmps), `${((withinEmps / Math.max(total, 1)) * 100).toFixed(1)}%`],
      ['خارج الكراسة', String(outsideEmps), `${((outsideEmps / Math.max(total, 1)) * 100).toFixed(1)}%`],
    ];

    const out: any[] = [
      this.h2('الالتزام بالكراسة'),
      this.headerTable(['الفئة', 'العدد', 'النسبة'], rows),
      this.p(`نسبة الحضور للملتزمين بالكراسة: ${((withinPresent / Math.max(within.length, 1)) * 100).toFixed(1)}%`, { bold: true }),
    ];

    // List outside-charter employees
    const outsideUnique = uniqueByEmployee(outside);
    if (outsideUnique.length) {
      out.push(this.spacer(6), this.h3('الموظفون خارج الكراسة'));
      out.push(
        this.headerTable(
          ['الاسم', 'المسار', 'نوع الجدول', 'المدينة'],
          outsideUnique.map((s) => [
            s.employee.fullName,
            s.employee.track || '—',
            shiftLabel(s.employee.shiftType),
            centerLabel(s.employee.center),
          ]),
        ),
      );
    }

    return [...out, this.pageBreak()];
  }

  // ─── Per-employee pages ─────────────────────────────────────────────
  private employeePages(grouped: Map<string, any[]>) {
    const out: any[] = [this.h1('التقارير التفصيلية لكل موظف')];
    let i = 0;
    for (const [employeeId, days] of grouped) {
      i += 1;
      const emp = days[0].employee;
      const present = days.filter((d) => d.status === 'present' || d.status === 'on_call_present').length;
      const absent = days.filter((d) => d.status === 'absent').length;
      const totalHours = days.reduce((acc, d) => acc + (d.totalHours ?? 0), 0);
      const compliance = (present / Math.max(days.length, 1)) * 100;

      out.push(
        this.h2(`${i}. ${emp.fullName}`),
        this.kvTable([
          ['الرقم الوظيفي', emp.employeeNumber || '—'],
          ['المسار', emp.track || '—'],
          ['التفاصيل', emp.trackDetail || '—'],
          ['المدينة', centerLabel(emp.center)],
          ['نوع الجدول', shiftLabel(emp.shiftType)],
          ['وقت الحضور المجدول', emp.scheduledCheckIn || '—'],
          ['وقت الانصراف المجدول', emp.scheduledCheckOut || '—'],
          ['ضمن الكراسة', emp.worksByCharter ? 'نعم ✓' : 'لا'],
          ['أيام الحضور', `${present} / ${days.length}`],
          ['أيام الغياب', String(absent)],
          ['إجمالي الساعات', `${totalHours.toFixed(1)} ساعة`],
          ['نسبة الالتزام', `${compliance.toFixed(1)}%`],
        ]),
        this.spacer(6),
        this.h3('السجل اليومي'),
        this.headerTable(
          ['التاريخ', 'الحضور', 'الانصراف', 'الساعات', 'الحالة', 'ملاحظات'],
          days.map((d) => [
            d.reportDate.toISOString().slice(0, 10),
            d.firstCheckIn || '—',
            d.lastCheckOut || '—',
            d.totalHours != null ? d.totalHours.toFixed(2) : '—',
            statusLabel(d.status),
            (d.flags || []).map(flagLabel).filter(Boolean).join(' • ') || '—',
          ]),
        ),
        this.pageBreak(),
      );
    }
    return out;
  }

  // ─── Alerts ─────────────────────────────────────────────────────────
  private alertsPage(upload: any) {
    const ai = upload.analysis;
    if (!ai) return [];
    const out: any[] = [this.h1('التنبيهات والمخاطر')];

    const risks = (ai.riskFlags as any[]) || [];
    const needs = (ai.needsAttention as any[]) || [];
    const recs = (ai.recommendations as any[]) || [];

    if (needs.length) {
      out.push(
        this.h2('موظفون يحتاجون متابعة'),
        this.headerTable(
          ['الاسم', 'الملاحظة', 'الشدة'],
          needs.slice(0, 30).map((n) => [
            String(n.name ?? '—'),
            String(n.issue ?? '—'),
            severityLabel(n.severity),
          ]),
        ),
        this.spacer(8),
      );
    }

    if (risks.length) {
      out.push(
        this.h2('مخاطر مرصودة'),
        this.headerTable(
          ['النوع', 'الوصف', 'العدد المتأثر', 'المستوى'],
          risks.slice(0, 30).map((r) => [
            String(r.type ?? '—'),
            String(r.description ?? '—'),
            String(r.affectedCount ?? 0),
            severityLabel(r.level),
          ]),
        ),
        this.spacer(8),
      );
    }

    if (recs.length) {
      out.push(this.h2('توصيات'));
      for (const r of recs.slice(0, 30)) {
        out.push(
          this.p(`• ${r.title ?? ''}`, { bold: true }),
          this.p(String(r.description ?? '—')),
        );
      }
    }

    return out;
  }

  // ─── Primitive helpers ──────────────────────────────────────────────
  private h1(text: string) {
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 240 },
      children: [new TextRun({ text, font: this.FONT, bold: true, size: 36, color: this.BRAND })],
    });
  }
  private h2(text: string) {
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text, font: this.FONT, bold: true, size: 28, color: this.BRAND })],
    });
  }
  private h3(text: string) {
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text, font: this.FONT, bold: true, size: 24 })],
    });
  }
  private p(text: string, opts: { bold?: boolean; center?: boolean; size?: number } = {}) {
    return new Paragraph({
      bidirectional: true,
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.RIGHT,
      children: [new TextRun({ text, font: this.FONT, bold: opts.bold, size: opts.size ?? 22 })],
    });
  }
  private spacer(size = 6) {
    return new Paragraph({ children: [new TextRun({ text: '', size })] });
  }
  private pageBreak() {
    return new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true });
  }

  // 2-col key/value table — wider value column.
  private kvTable(rows: [string, string][]): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      visuallyRightToLeft: true,
      rows: rows.map(
        ([k, v]) =>
          new TableRow({
            children: [
              this.cell(k, { bold: true, shade: 'F5F5F5', width: 30 }),
              this.cell(v, { width: 70 }),
            ],
          }),
      ),
    });
  }

  // Generic header + body data table.
  private headerTable(headers: string[], rows: string[][]): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      visuallyRightToLeft: true,
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((h) => this.cell(h, { bold: true, shade: this.HEADER_BG, color: 'FFFFFF' })),
        }),
        ...rows.map(
          (r, idx) =>
            new TableRow({
              children: r.map((c) =>
                this.cell(c, { shade: idx % 2 === 0 ? 'FFFFFF' : 'F7FAFC' }),
              ),
            }),
        ),
      ],
    });
  }

  private cell(
    text: string,
    opts: { bold?: boolean; shade?: string; color?: string; width?: number } = {},
  ): TableCell {
    return new TableCell({
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      shading: opts.shade
        ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shade }
        : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' },
      },
      children: [
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: text || '—',
              font: this.FONT,
              bold: opts.bold,
              color: opts.color,
              size: 20,
            }),
          ],
        }),
      ],
    });
  }
}

// ─── module-level helpers ────────────────────────────────────────────────

function groupByEmployee(summaries: any[]): Map<string, any[]> {
  const m = new Map<string, any[]>();
  for (const s of summaries) {
    const id = s.employee.id;
    if (!m.has(id)) m.set(id, []);
    m.get(id)!.push(s);
  }
  return m;
}

function uniqueByEmployee(summaries: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const s of summaries) {
    if (seen.has(s.employee.id)) continue;
    seen.add(s.employee.id);
    out.push(s);
  }
  return out;
}

function statusLabel(s: PdfAttendanceStatus): string {
  const map: Record<PdfAttendanceStatus, string> = {
    present: 'حاضر',
    incomplete_hours: 'دوام أقل من 8 ساعات',
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
  return map[s] ?? String(s);
}

function shiftLabel(s: PdfShiftType): string {
  const map: Record<PdfShiftType, string> = {
    morning: 'صباحي',
    evening: 'مسائي',
    night: 'ليلي',
    on_call: 'On Call',
    online: 'أونلاين',
    unscheduled: 'بدون وقت محدد',
    rotating: 'صباحي/مسائي بالتناوب',
  };
  return map[s] ?? String(s);
}

function centerLabel(c: PdfAttendanceCenter | null): string {
  if (!c) return 'مشترك';
  return { makkah: 'مكة المكرمة', madinah: 'المدينة المنورة', shared: 'مشترك' }[c];
}

function severityLabel(s: any): string {
  if (s === 'critical' || s === 'high') return 'عالٍ';
  if (s === 'medium' || s === 'warning') return 'متوسط';
  if (s === 'low' || s === 'info') return 'منخفض';
  return String(s ?? '—');
}

function flagLabel(f: string): string {
  const map: Record<string, string> = {
    none: '',
    less_than_8h: 'أقل من 8 ساعات',
    missing_checkout: 'بدون خروج',
    missing_checkin: 'بدون دخول',
    multiple_entries: 'سجلات متعددة',
    unregistered: 'غير مسجل',
  };
  return map[f] ?? f;
}
