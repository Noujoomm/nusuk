import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { ProductivityService } from './productivity.service';
import { ProjectProductivity, TrackProductivity, TaskScore, AtRiskTask } from './productivity.types';

const DARK = 'FF0F172A';
const CARD = 'FF1E293B';
const HEADER_BG = 'FF1E3A5F';
const ODD_ROW = 'FF0F172A';
const EVEN_ROW = 'FF1E293B';
const WHITE: Partial<ExcelJS.Font> = { color: { argb: 'FFF1F5F9' }, name: 'IBM Plex Sans Arabic' };
const HEADER_FONT: Partial<ExcelJS.Font> = { ...WHITE, bold: true, size: 11 };
const GREEN = 'FF22C55E';
const YELLOW = 'FFF59E0B';
const RED = 'FFEF4444';

const prodColor = (v: number) => v >= 85 ? GREEN : v >= 60 ? YELLOW : RED;
const trendLabel = (t: number) => t > 1.05 ? '↑ تسارع' : t >= 0.85 ? '→ ثبات' : '↓ تباطؤ';
const statusLabel = (v: number) => v >= 85 ? 'ممتاز' : v >= 60 ? 'تنبيه' : 'حرج';

const SOURCE_AR: Record<string, string> = { agreement: 'كراسة/اتفاقية', agent: 'الوكيل', additional: 'إضافية' };
const PRIORITY_AR: Record<string, string> = { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const STATUS_AR: Record<string, string> = {
  new: 'جديدة', pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ',
  under_review: 'تحت المراجعة', completed: 'مكتملة', delayed: 'متأخرة',
  cancelled: 'ملغاة', scheduled: 'مجدولة',
};
const APPROVAL_AR: Record<string, string> = {
  approved: 'معتمد', approved_with_notes: 'معتمد مع ملاحظات', pending: 'معلّق', resubmit: 'يُعاد التقديم',
};

@Injectable()
export class ExportService {
  constructor(private productivity: ProductivityService) {}

  // ═══════════════════════════════════════════════════════════
  //  EXCEL — Full Project Report
  // ═══════════════════════════════════════════════════════════

  async generateExcelReport(): Promise<Buffer> {
    const data = await this.productivity.getProjectProductivity();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'منصة رؤية';
    wb.title = `تقرير الإنتاجية — ${new Date().toLocaleDateString('en-US')}`;

    this.buildSummarySheet(wb, data);
    this.buildTasksSheet(wb, data);
    this.buildAtRiskSheet(wb, data);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async generateTrackExcel(trackId: string): Promise<Buffer> {
    const tp = await this.productivity.getTrackProductivity(trackId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'منصة رؤية';
    wb.title = `تقرير المسار — ${tp.trackNameAr}`;

    // Tasks sheet
    const ws = wb.addWorksheet('تفاصيل المهام');
    ws.views = [{ rightToLeft: true }];
    this.addTaskColumns(ws);
    this.addTaskRows(ws, [tp]);

    // At-risk sheet
    this.buildAtRiskSheetFromTracks(wb, [tp]);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private buildSummarySheet(wb: ExcelJS.Workbook, data: ProjectProductivity) {
    const ws = wb.addWorksheet('ملخص المسارات');
    ws.views = [{ rightToLeft: true }];

    ws.columns = [
      { header: 'المسار', key: 'track', width: 25 },
      { header: 'الوزن النسبي %', key: 'weight', width: 14 },
      { header: 'الإنتاجية %', key: 'prod', width: 14 },
      { header: 'التسليم في الوقت %', key: 'ontime', width: 20 },
      { header: 'الاعتماد من أول مرة %', key: 'firstAcc', width: 22 },
      { header: 'جاهزية الكراسة %', key: 'claim', width: 20 },
      { header: 'نسبة التميّز %', key: 'excellence', width: 16 },
      { header: 'مهام متأخرة', key: 'overdue', width: 15 },
      { header: 'مهام محظورة', key: 'blocked', width: 15 },
      { header: 'حجم المتأخر', key: 'backlog', width: 14 },
      { header: 'اتجاه السرعة', key: 'trend', width: 16 },
      { header: 'الحالة', key: 'status', width: 12 },
    ];

    // Header row styling
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 28;

    // Data rows
    data.trackProductivities.forEach((tp, i) => {
      const row = ws.addRow({
        track: tp.trackNameAr,
        weight: tp.trackWeightPercent,
        prod: tp.productivityPercent,
        ontime: tp.onTimeDeliveryRate,
        firstAcc: tp.firstAcceptanceRate,
        claim: tp.claimReadiness,
        excellence: tp.excellenceRate,
        overdue: tp.overdueCount,
        blocked: tp.blockerCount,
        backlog: tp.backlogDepth,
        trend: trendLabel(tp.velocityTrend),
        status: statusLabel(tp.productivityPercent),
      });

      const bg = i % 2 === 0 ? ODD_ROW : EVEN_ROW;
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { ...WHITE, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Color productivity column
      const prodCell = row.getCell('prod');
      prodCell.font = { ...WHITE, size: 10, bold: true, color: { argb: prodColor(tp.productivityPercent) } };
    });

    // Total row
    const totalRow = ws.addRow({
      track: 'إجمالي المشروع',
      weight: '',
      prod: data.overallProductivityPercent,
      ontime: '', firstAcc: '', claim: '', excellence: '',
      overdue: data.totalOverdueTasks,
      blocked: data.totalBlockedTasks,
      backlog: '', trend: '', status: '',
    });
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.font = { ...HEADER_FONT, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  }

  private addTaskColumns(ws: ExcelJS.Worksheet) {
    ws.columns = [
      { header: 'المسار', key: 'track', width: 22 },
      { header: 'المهمة', key: 'task', width: 30 },
      { header: 'المصدر', key: 'source', width: 18 },
      { header: 'الأولوية', key: 'priority', width: 14 },
      { header: 'الحالة', key: 'status', width: 14 },
      { header: 'التقدم %', key: 'progress', width: 12 },
      { header: 'الأهمية', key: 'importance', width: 12 },
      { header: 'جودة التنفيذ', key: 'quality', width: 15 },
      { header: 'النقاط', key: 'score', width: 12 },
      { header: 'الحد الأقصى', key: 'maxScore', width: 14 },
      { header: 'الإنتاجية %', key: 'prod', width: 14 },
      { header: 'التوقيت (أيام)', key: 'timing', width: 16 },
      { header: 'حالة الاعتماد', key: 'approval', width: 18 },
      { header: 'مرات الإعادة', key: 'resubmit', width: 15 },
      { header: 'مستثناة', key: 'excluded', width: 12 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 28;
  }

  private addTaskRows(ws: ExcelJS.Worksheet, tps: TrackProductivity[]) {
    let rowIdx = 0;
    for (const tp of tps) {
      for (const s of tp.taskScores) {
        const row = ws.addRow({
          track: tp.trackNameAr,
          task: s.taskName,
          source: SOURCE_AR[s.taskId] || '—', // We need to get source from somewhere
          priority: '—',
          status: '—',
          progress: Math.round(s.statusFactor * 100),
          importance: s.importanceScore,
          quality: Math.round(s.executionQuality * 100) / 100,
          score: Math.round(s.score * 100) / 100,
          maxScore: s.maxScore,
          prod: s.productivityPercent,
          timing: s.timelinessDays !== null ? s.timelinessDays : '—',
          approval: '—',
          resubmit: s.resubmitCount,
          excluded: s.isExcluded ? 'نعم' : 'لا',
        });

        const bg = rowIdx % 2 === 0 ? ODD_ROW : EVEN_ROW;
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font = { ...WHITE, size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        rowIdx++;
      }
    }
  }

  private buildTasksSheet(wb: ExcelJS.Workbook, data: ProjectProductivity) {
    const ws = wb.addWorksheet('تفاصيل المهام');
    ws.views = [{ rightToLeft: true }];
    this.addTaskColumns(ws);
    this.addTaskRows(ws, data.trackProductivities);
  }

  private buildAtRiskSheet(wb: ExcelJS.Workbook, data: ProjectProductivity) {
    this.buildAtRiskSheetFromTracks(wb, data.trackProductivities);
  }

  private buildAtRiskSheetFromTracks(wb: ExcelJS.Workbook, tps: TrackProductivity[]) {
    const ws = wb.addWorksheet('المهام المعرّضة للخطر');
    ws.views = [{ rightToLeft: true }];

    ws.columns = [
      { header: 'المسار', key: 'track', width: 22 },
      { header: 'المهمة', key: 'task', width: 30 },
      { header: 'الأهمية', key: 'importance', width: 12 },
      { header: 'أيام حتى الموعد', key: 'days', width: 18 },
      { header: 'التقدم %', key: 'progress', width: 12 },
      { header: 'مستوى الخطر', key: 'risk', width: 14 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 28;

    let hasRisk = false;
    let rowIdx = 0;
    for (const tp of tps) {
      for (const ar of tp.atRiskTasks) {
        hasRisk = true;
        const riskAr = ar.riskLevel === 'CRITICAL' ? 'حرج' : 'تنبيه';
        const row = ws.addRow({
          track: tp.trackNameAr,
          task: ar.taskName,
          importance: ar.importanceScore,
          days: ar.daysUntilDeadline,
          progress: ar.currentProgress,
          risk: riskAr,
        });

        const bg = rowIdx % 2 === 0 ? ODD_ROW : EVEN_ROW;
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font = { ...WHITE, size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        const riskCell = row.getCell('risk');
        if (ar.riskLevel === 'CRITICAL') {
          riskCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
          riskCell.font = { ...WHITE, bold: true, size: 10 };
        } else {
          riskCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
          riskCell.font = { name: 'IBM Plex Sans Arabic', bold: true, size: 10, color: { argb: 'FF000000' } };
        }
        rowIdx++;
      }
    }

    if (!hasRisk) {
      const row = ws.addRow({ track: '✓ لا توجد مهام معرّضة للخطر حالياً' });
      row.getCell(1).font = { ...WHITE, size: 11, italic: true, color: { argb: GREEN } };
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PPTX — Executive Presentation
  // ═══════════════════════════════════════════════════════════

  async generatePptxReport(): Promise<Buffer> {
    const data = await this.productivity.getProjectProductivity();
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    (pptx as any).rtl = true;

    const C = {
      DARK: '0F172A', CARD: '1E293B', PRIMARY: '6366F1',
      SUCCESS: '22C55E', WARNING: 'F59E0B', DANGER: 'EF4444',
      TEXT: 'F1F5F9', MUTED: '94A3B8',
    };

    // ─── Slide 1: Executive Summary ──────────────────────────
    const s1 = pptx.addSlide();
    s1.background = { color: C.DARK };

    s1.addText('تقرير الإنتاجية — منصة رؤية', { x: 0.5, y: 0.3, w: 12, h: 0.6, fontSize: 24, bold: true, color: C.TEXT, align: 'right' });
    s1.addText(new Date().toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }),
      { x: 0.5, y: 0.9, w: 12, h: 0.4, fontSize: 12, color: C.MUTED, align: 'right' });

    // KPI Cards
    const cards = [
      { label: 'إنتاجية المشروع', value: `${data.overallProductivityPercent}%`, color: data.overallProductivityPercent >= 85 ? C.SUCCESS : data.overallProductivityPercent >= 60 ? C.WARNING : C.DANGER },
      { label: 'معرّضة للخطر', value: `${data.totalAtRiskTasks}`, color: data.totalAtRiskTasks > 0 ? C.DANGER : C.SUCCESS },
      { label: 'محظورة', value: `${data.totalBlockedTasks}`, color: data.totalBlockedTasks > 0 ? C.WARNING : C.SUCCESS },
      { label: 'متأخرة', value: `${data.totalOverdueTasks}`, color: data.totalOverdueTasks > 0 ? C.DANGER : C.SUCCESS },
    ];

    cards.forEach((c, i) => {
      const x = 0.5 + i * 3.1;
      s1.addShape(pptx.ShapeType.roundRect, { x, y: 1.6, w: 2.8, h: 1.4, fill: { color: C.CARD }, line: { color: c.color, width: 2 }, rectRadius: 0.15 });
      s1.addText(c.value, { x, y: 1.7, w: 2.8, h: 0.8, fontSize: 28, bold: true, color: c.color, align: 'center' });
      s1.addText(c.label, { x, y: 2.4, w: 2.8, h: 0.4, fontSize: 11, color: C.MUTED, align: 'center' });
    });

    // Flags
    let flagY = 3.4;
    if (data.greenFlagTracks.length > 0) {
      s1.addText(`✓ مسارات متميزة: ${data.greenFlagTracks.join('، ')}`,
        { x: 0.5, y: flagY, w: 12, h: 0.4, fontSize: 12, color: C.SUCCESS, align: 'right' });
      flagY += 0.5;
    }
    if (data.redFlagTracks.length > 0) {
      s1.addText(`⚠ مسارات تحت المتابعة: ${data.redFlagTracks.join('، ')}`,
        { x: 0.5, y: flagY, w: 12, h: 0.4, fontSize: 12, color: C.DANGER, align: 'right' });
    }

    // ─── Slide 2: Track Table ────────────────────────────────
    const s2 = pptx.addSlide();
    s2.background = { color: C.DARK };
    s2.addText('أداء المسارات', { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 20, bold: true, color: C.TEXT, align: 'right' });

    const tableRows: PptxGenJS.TableRow[] = [
      [
        { text: 'المسار', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'الإنتاجية %', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'الوزن %', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'في الوقت %', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'الكراسة %', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'متأخر', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'الحالة', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
      ],
    ];

    for (const tp of data.trackProductivities) {
      const pc = tp.productivityPercent >= 85 ? C.SUCCESS : tp.productivityPercent >= 60 ? C.WARNING : C.DANGER;
      const bg = C.CARD;
      tableRows.push([
        { text: tp.trackNameAr, options: { color: C.TEXT, fill: { color: bg }, align: 'right', fontSize: 9 } },
        { text: `${tp.productivityPercent}%`, options: { color: pc, fill: { color: bg }, align: 'center', bold: true, fontSize: 9 } },
        { text: `${tp.trackWeightPercent}%`, options: { color: C.MUTED, fill: { color: bg }, align: 'center', fontSize: 9 } },
        { text: `${tp.onTimeDeliveryRate}%`, options: { color: C.TEXT, fill: { color: bg }, align: 'center', fontSize: 9 } },
        { text: `${tp.claimReadiness}%`, options: { color: C.TEXT, fill: { color: bg }, align: 'center', fontSize: 9 } },
        { text: `${tp.overdueCount}`, options: { color: tp.overdueCount > 0 ? C.DANGER : C.TEXT, fill: { color: bg }, align: 'center', fontSize: 9 } },
        { text: statusLabel(tp.productivityPercent), options: { color: pc, fill: { color: bg }, align: 'center', fontSize: 9 } },
      ]);
    }

    s2.addTable(tableRows, { x: 0.3, y: 1.0, w: 12.7, colW: [2.5, 1.5, 1.2, 1.5, 1.5, 1.2, 1.2], border: { type: 'solid', color: '334155', pt: 0.5 } });

    // ─── Slide 3: Predictive ─────────────────────────────────
    const s3 = pptx.addSlide();
    s3.background = { color: C.DARK };
    s3.addText('المؤشرات التنبؤية', { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 20, bold: true, color: C.TEXT, align: 'right' });

    const predRows: PptxGenJS.TableRow[] = [
      [
        { text: 'المسار', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'اتجاه السرعة', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'أسابيع متبقية', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'معرّضة للخطر', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
      ],
    ];

    for (const tp of data.trackProductivities) {
      const trendColor = tp.velocityTrend > 1.05 ? C.SUCCESS : tp.velocityTrend >= 0.85 ? C.MUTED : C.DANGER;
      const burnColor = tp.burnRateWeeksRemaining === null ? C.MUTED : tp.burnRateWeeksRemaining <= 3 ? C.SUCCESS : tp.burnRateWeeksRemaining <= 6 ? C.WARNING : C.DANGER;

      predRows.push([
        { text: tp.trackNameAr, options: { color: C.TEXT, fill: { color: C.CARD }, align: 'right', fontSize: 9 } },
        { text: trendLabel(tp.velocityTrend), options: { color: trendColor, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
        { text: tp.burnRateWeeksRemaining !== null ? `${tp.burnRateWeeksRemaining}` : '—', options: { color: burnColor, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
        { text: `${tp.atRiskTasks.length}`, options: { color: tp.atRiskTasks.length > 0 ? C.DANGER : C.SUCCESS, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
      ]);
    }

    s3.addTable(predRows, { x: 0.5, y: 1.0, w: 12, colW: [4, 3, 2.5, 2.5], border: { type: 'solid', color: '334155', pt: 0.5 } });

    // ─── Slide 4: Diagnostics ────────────────────────────────
    const s4 = pptx.addSlide();
    s4.background = { color: C.DARK };
    s4.addText('التشخيص التفصيلي', { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 20, bold: true, color: C.TEXT, align: 'right' });

    const diagRows: PptxGenJS.TableRow[] = [
      [
        { text: 'المسار', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'اعتماد أول مرة %', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'إعادة تقديم %', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'محظورة', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'معلّقة >5 أيام', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
        { text: 'التميّز %', options: { bold: true, color: C.TEXT, fill: { color: C.PRIMARY }, align: 'center', fontSize: 10 } },
      ],
    ];

    for (const tp of data.trackProductivities) {
      diagRows.push([
        { text: tp.trackNameAr, options: { color: C.TEXT, fill: { color: C.CARD }, align: 'right', fontSize: 9 } },
        { text: `${tp.firstAcceptanceRate}%`, options: { color: C.TEXT, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
        { text: `${tp.resubmitRate}%`, options: { color: C.MUTED, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
        { text: `${tp.blockerCount}`, options: { color: tp.blockerCount > 0 ? C.DANGER : C.TEXT, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
        { text: `${tp.pendingReviewAge}`, options: { color: tp.pendingReviewAge > 0 ? C.WARNING : C.TEXT, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
        { text: `${tp.excellenceRate}%`, options: { color: tp.excellenceRate > 30 ? C.SUCCESS : C.TEXT, fill: { color: C.CARD }, align: 'center', fontSize: 9 } },
      ]);
    }

    s4.addTable(diagRows, { x: 0.3, y: 1.0, w: 12.7, colW: [2.8, 2, 2, 1.5, 1.8, 1.5], border: { type: 'solid', color: '334155', pt: 0.5 } });
    s4.addText('* إعادة التقديم مؤشر تشخيصي فقط — لا يؤثر على حساب الإنتاجية',
      { x: 0.5, y: 6.5, w: 12, h: 0.3, fontSize: 9, italic: true, color: C.MUTED, align: 'right' });

    // ─── Slide 5: Decisions ──────────────────────────────────
    const s5 = pptx.addSlide();
    s5.background = { color: C.DARK };
    s5.addText('الخلاصة والقرارات', { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 20, bold: true, color: C.TEXT, align: 'right' });

    let y = 1.2;
    if (data.greenFlagTracks.length > 0) {
      s5.addText('نقاط القوة:', { x: 0.5, y, w: 12, h: 0.4, fontSize: 14, bold: true, color: C.SUCCESS, align: 'right' });
      y += 0.45;
      for (const t of data.greenFlagTracks) {
        s5.addText(`✓ ${t}`, { x: 0.8, y, w: 11, h: 0.35, fontSize: 11, color: C.SUCCESS, align: 'right' });
        y += 0.35;
      }
      y += 0.2;
    }

    if (data.redFlagTracks.length > 0) {
      s5.addText('نقاط تحتاج متابعة:', { x: 0.5, y, w: 12, h: 0.4, fontSize: 14, bold: true, color: C.DANGER, align: 'right' });
      y += 0.45;
      for (const t of data.redFlagTracks) {
        s5.addText(`⚠ ${t}`, { x: 0.8, y, w: 11, h: 0.35, fontSize: 11, color: C.DANGER, align: 'right' });
        y += 0.35;
      }
      y += 0.2;
    }

    // Auto-generated decisions
    s5.addText('القرارات المطلوبة:', { x: 0.5, y, w: 12, h: 0.4, fontSize: 14, bold: true, color: C.TEXT, align: 'right' });
    y += 0.45;

    const decisions: string[] = [];
    for (const tp of data.trackProductivities) {
      if (tp.overdueCount > 0 && tp.trackWeightPercent > 10) {
        decisions.push(`مراجعة عاجلة: ${tp.trackNameAr} — ${tp.overdueCount} مهام متأخرة`);
      }
      if (tp.burnRateWeeksRemaining !== null && tp.burnRateWeeksRemaining > 6) {
        decisions.push(`دعم إضافي مطلوب: ${tp.trackNameAr}`);
      }
      if (tp.blockerCount > 2) {
        decisions.push(`حل عوائق فوراً: ${tp.trackNameAr} — ${tp.blockerCount} عائق`);
      }
    }

    if (decisions.length === 0) {
      decisions.push('✓ المشروع يسير وفق الخطة');
    }

    for (const d of decisions) {
      const isPositive = d.startsWith('✓');
      s5.addText(`• ${d}`, { x: 0.8, y, w: 11, h: 0.35, fontSize: 11, color: isPositive ? C.SUCCESS : C.WARNING, align: 'right' });
      y += 0.38;
    }

    return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  }
}
