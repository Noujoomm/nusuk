import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class AIReportsService {
  private readonly logger = new Logger(AIReportsService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
  ) {}

  async generateReport(params: { type: string; trackId?: string; userId: string }) {
    const { type, trackId, userId } = params;

    // 1. Collect data from the database
    const data = await this.collectReportData(type, trackId);

    // 2. Build Arabic prompt
    const prompt = this.buildPrompt(type, data);

    // 3. Call OpenAI
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content:
          'أنت محلل بيانات متخصص في إدارة المشاريع. تقوم بإنشاء تقارير مفصلة ودقيقة باللغة العربية. استخدم تنسيق HTML بسيط للعناوين والقوائم.',
      },
      { role: 'user', content: prompt },
    ];

    const content = await this.openai.chat(messages, { temperature: 0.3 });

    // 4. Generate title and summary
    const typeLabels: Record<string, { title: string; titleAr: string }> = {
      executive: { title: 'Executive Report', titleAr: 'تقرير تنفيذي' },
      daily: { title: 'Daily Report', titleAr: 'تقرير يومي' },
      weekly: { title: 'Weekly Report', titleAr: 'تقرير أسبوعي' },
      monthly: { title: 'Monthly Report', titleAr: 'تقرير شهري' },
      track_performance: { title: 'Track Performance Report', titleAr: 'تقرير أداء المسار' },
      kpi_analysis: { title: 'KPI Analysis Report', titleAr: 'تقرير تحليل مؤشرات الأداء' },
    };

    const labels = typeLabels[type] || { title: 'AI Report', titleAr: 'تقرير ذكاء اصطناعي' };
    const dateStr = new Date().toLocaleDateString('ar-SA');
    const title = `${labels.title} - ${dateStr}`;
    const titleAr = `${labels.titleAr} - ${dateStr}`;

    // Extract first paragraph as summary
    const summary = content.substring(0, 500).replace(/<[^>]*>/g, '').trim();

    // 5. Store in database
    const report = await this.prisma.aIReport.create({
      data: {
        type: type as any,
        title,
        titleAr,
        trackId: trackId || null,
        generatedBy: userId,
        prompt: prompt.substring(0, 2000),
        content,
        contentHtml: content,
        summary,
      },
      include: {
        track: { select: { id: true, nameAr: true, color: true } },
        author: { select: { id: true, name: true, nameAr: true } },
      },
    });

    return report;
  }

  async collectReportData(type: string, trackId?: string): Promise<any> {
    const now = new Date();

    switch (type) {
      case 'executive': {
        const [
          tracksCount,
          kpiEntries,
          unresolvedPenalties,
          totalTasks,
          tasksByStatus,
          overdueTasks,
          employeesCount,
          reportsCount,
        ] = await Promise.all([
          this.prisma.track.count({ where: { isActive: true } }),
          this.prisma.kPIEntry.findMany({
            select: { name: true, nameAr: true, targetValue: true, actualValue: true, status: true },
          }),
          this.prisma.penalty.count({ where: { isResolved: false } }),
          this.prisma.task.count(),
          this.prisma.task.groupBy({ by: ['status'], _count: true }),
          this.prisma.task.count({
            where: { dueDate: { lt: now }, status: { notIn: ['completed', 'cancelled'] } },
          }),
          this.prisma.employee.count(),
          this.prisma.report.count(),
        ]);

        const avgTarget =
          kpiEntries.length > 0
            ? kpiEntries.reduce((sum, k) => sum + k.targetValue, 0) / kpiEntries.length
            : 0;
        const avgActual =
          kpiEntries.length > 0
            ? kpiEntries.reduce((sum, k) => sum + k.actualValue, 0) / kpiEntries.length
            : 0;

        return {
          tracksCount,
          kpiAvgTarget: avgTarget.toFixed(1),
          kpiAvgActual: avgActual.toFixed(1),
          kpiEntries: kpiEntries.slice(0, 20),
          unresolvedPenalties,
          totalTasks,
          tasksByStatus: tasksByStatus.reduce(
            (acc, t) => ({ ...acc, [t.status]: t._count }),
            {},
          ),
          overdueTasks,
          employeesCount,
          reportsCount,
        };
      }

      case 'daily':
      case 'weekly':
      case 'monthly': {
        const dateRanges: Record<string, number> = {
          daily: 1,
          weekly: 7,
          monthly: 30,
        };
        const daysBack = dateRanges[type] || 1;
        const since = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

        const [tasks, kpiEntries] = await Promise.all([
          this.prisma.task.findMany({
            where: { updatedAt: { gte: since } },
            select: { title: true, titleAr: true, status: true, progress: true },
          }),
          this.prisma.kPIEntry.findMany({
            where: { updatedAt: { gte: since } },
            select: {
              name: true,
              nameAr: true,
              targetValue: true,
              actualValue: true,
              status: true,
            },
          }),
        ]);

        return { period: type, since: since.toISOString(), tasks, kpiEntries };
      }

      case 'track_performance': {
        if (!trackId) return { error: 'trackId is required for track_performance report' };

        const track = await this.prisma.track.findUnique({
          where: { id: trackId },
          include: {
            tasks: {
              select: { title: true, titleAr: true, status: true, progress: true, dueDate: true },
              take: 50,
            },
            kpis: { select: { name: true, nameAr: true } },
            kpiEntries: {
              select: {
                name: true,
                nameAr: true,
                targetValue: true,
                actualValue: true,
                status: true,
              },
            },
            penalties: {
              select: { violation: true, violationAr: true, severity: true, isResolved: true },
            },
            employees: {
              select: { fullName: true, fullNameAr: true, position: true, positionAr: true },
            },
          },
        });

        return {
          trackName: track?.nameAr || track?.name,
          tasks: track?.tasks || [],
          kpis: track?.kpis || [],
          kpiEntries: track?.kpiEntries || [],
          penalties: track?.penalties || [],
          employees: track?.employees || [],
        };
      }

      case 'kpi_analysis': {
        const where: any = {};
        if (trackId) where.trackId = trackId;

        const kpiEntries = await this.prisma.kPIEntry.findMany({
          where,
          include: { track: { select: { nameAr: true } } },
          orderBy: { createdAt: 'desc' },
        });

        return {
          kpiEntries: kpiEntries.map((k) => ({
            name: k.nameAr || k.name,
            target: k.targetValue,
            actual: k.actualValue,
            status: k.status,
            track: k.track?.nameAr,
            gap: k.targetValue - k.actualValue,
            achievementRate:
              k.targetValue > 0
                ? ((k.actualValue / k.targetValue) * 100).toFixed(1)
                : '0',
          })),
        };
      }

      default:
        return {};
    }
  }

  buildPrompt(type: string, data: any): string {
    const dataJson = JSON.stringify(data, null, 2);

    const typeInstructions: Record<string, string> = {
      executive: `قم بإنشاء تقرير تنفيذي شامل بالعربية.

البيانات:
${dataJson}

يجب أن يتضمن التقرير:
1. ملخص تنفيذي
2. تحليل الأداء العام
3. حالة المسارات والسجلات
4. تحليل مؤشرات الأداء (KPIs)
5. المخاطر والتحديات
6. التوصيات
7. خطة التحسين المقترحة`,

      daily: `قم بإنشاء تقرير يومي بالعربية.

البيانات:
${dataJson}

يجب أن يتضمن التقرير:
1. ملخص الأنشطة اليومية
2. التحديثات على السجلات والمهام
3. تغييرات مؤشرات الأداء
4. الأولويات للغد`,

      weekly: `قم بإنشاء تقرير أسبوعي بالعربية.

البيانات:
${dataJson}

يجب أن يتضمن التقرير:
1. ملخص الأسبوع
2. الإنجازات الرئيسية
3. حالة المهام والسجلات
4. تحديثات مؤشرات الأداء
5. التحديات والمخاطر
6. خطة الأسبوع القادم`,

      monthly: `قم بإنشاء تقرير شهري بالعربية.

البيانات:
${dataJson}

يجب أن يتضمن التقرير:
1. ملخص تنفيذي للشهر
2. تحليل الأداء الشهري
3. المقارنة مع الأهداف
4. تحليل المخاطر
5. التوصيات الاستراتيجية`,

      track_performance: `قم بتحليل أداء المسار التالي وإنشاء تقرير مفصل بالعربية.

البيانات:
${dataJson}

يجب أن يتضمن التقرير:
1. ملخص أداء المسار
2. حالة السجلات والمهام
3. تحليل مؤشرات الأداء
4. المخالفات والعقوبات
5. تقييم الموظفين
6. التوصيات`,

      kpi_analysis: `قم بتحليل مؤشرات الأداء التالية وإنشاء تقرير تحليلي بالعربية.

البيانات:
${dataJson}

يجب أن يتضمن التقرير:
1. ملخص عام لمؤشرات الأداء
2. المؤشرات المتحققة والمتأخرة
3. تحليل الفجوات
4. الاتجاهات والأنماط
5. التوصيات لتحسين الأداء`,
    };

    return (
      typeInstructions[type] ||
      `قم بإنشاء تقرير مفصل بالعربية بناءً على البيانات التالية:\n\n${dataJson}`
    );
  }

  async findAll(params: { page?: number; pageSize?: number; type?: string; trackId?: string }) {
    const { page = 1, pageSize = 25, type, trackId } = params;
    const where: any = {};
    if (type) where.type = type;
    if (trackId) where.trackId = trackId;

    const [data, total] = await Promise.all([
      this.prisma.aIReport.findMany({
        where,
        include: {
          track: { select: { id: true, nameAr: true, color: true } },
          author: { select: { id: true, name: true, nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aIReport.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    const report = await this.prisma.aIReport.findUnique({
      where: { id },
      include: {
        track: { select: { id: true, nameAr: true, color: true } },
        author: { select: { id: true, name: true, nameAr: true } },
      },
    });
    if (!report) throw new NotFoundException('التقرير غير موجود');
    return report;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.aIReport.delete({ where: { id } });
    return { message: 'تم حذف التقرير' };
  }

  async exportToExcel(id: string): Promise<Buffer> {
    const report = await this.findById(id);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nusuk Platform';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('التقرير', {
      properties: { defaultColWidth: 40 },
      views: [{ rightToLeft: true }],
    });

    // Title row
    worksheet.addRow(['عنوان التقرير', report.titleAr || report.title]);
    worksheet.addRow(['نوع التقرير', report.type]);
    worksheet.addRow(['تاريخ الإنشاء', report.createdAt.toLocaleDateString('ar-SA')]);
    worksheet.addRow([]);

    // Style header rows
    for (let i = 1; i <= 3; i++) {
      const row = worksheet.getRow(i);
      row.font = { bold: true, size: 12 };
      row.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F5E9' },
      };
    }

    // Summary
    if (report.summary) {
      worksheet.addRow(['الملخص']);
      worksheet.getRow(worksheet.rowCount).font = { bold: true, size: 14 };
      worksheet.addRow([report.summary]);
      worksheet.addRow([]);
    }

    // Content (strip HTML tags for plain text)
    worksheet.addRow(['المحتوى الكامل']);
    worksheet.getRow(worksheet.rowCount).font = { bold: true, size: 14 };

    const plainContent = report.content.replace(/<[^>]*>/g, '\n').replace(/\n{3,}/g, '\n\n');
    const contentLines = plainContent.split('\n').filter((l) => l.trim());
    for (const line of contentLines) {
      worksheet.addRow([line.trim()]);
    }

    // Auto-fit column widths
    worksheet.columns.forEach((column) => {
      column.width = 60;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
