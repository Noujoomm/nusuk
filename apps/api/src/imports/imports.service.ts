import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { ImportDataDto } from './imports.dto';
import { buildSkipTake } from '../common/utils/pagination.util';

// Field definitions for each entity type
const ENTITY_FIELDS: Record<string, Array<{ field: string; label: string; labelAr: string; required?: boolean }>> = {
  task: [
    { field: 'title', label: 'Task Name', labelAr: 'اسم المهمة', required: true },
    { field: 'titleAr', label: 'Task Name (Arabic)', labelAr: 'اسم المهمة بالعربي' },
    { field: 'description', label: 'Description', labelAr: 'الوصف' },
    { field: 'status', label: 'Status', labelAr: 'الحالة' },
    { field: 'priority', label: 'Priority', labelAr: 'الأولوية' },
    { field: 'progress', label: 'Progress %', labelAr: 'نسبة الإنجاز' },
    { field: 'startDate', label: 'Start Date', labelAr: 'تاريخ البدء' },
    { field: 'dueDate', label: 'End Date', labelAr: 'تاريخ الانتهاء' },
    { field: 'owner', label: 'Owner / Responsible', labelAr: 'المسؤول' },
    { field: 'trackName', label: 'Track', labelAr: 'المسار' },
    { field: 'notes', label: 'Notes', labelAr: 'ملاحظات' },
    { field: 'duration', label: 'Duration (days)', labelAr: 'المدة (أيام)' },
  ],
  employee: [
    { field: 'fullNameAr', label: 'Full Name (Arabic)', labelAr: 'الاسم بالعربي', required: true },
    { field: 'fullName', label: 'Full Name (English)', labelAr: 'الاسم بالإنجليزي', required: true },
    { field: 'positionAr', label: 'Position (Arabic)', labelAr: 'المنصب بالعربي' },
    { field: 'position', label: 'Position (English)', labelAr: 'المنصب بالإنجليزي' },
    { field: 'contractType', label: 'Contract Type', labelAr: 'نوع العقد' },
    { field: 'email', label: 'Email', labelAr: 'البريد الإلكتروني' },
    { field: 'phone', label: 'Phone', labelAr: 'رقم الجوال' },
    { field: 'department', label: 'Department', labelAr: 'القسم' },
    { field: 'status', label: 'Status', labelAr: 'الحالة' },
    { field: 'nationalId', label: 'National ID', labelAr: 'رقم الهوية' },
    { field: 'notes', label: 'Notes', labelAr: 'ملاحظات' },
  ],
  deliverable: [
    { field: 'nameAr', label: 'Name (Arabic)', labelAr: 'الاسم بالعربي', required: true },
    { field: 'name', label: 'Name (English)', labelAr: 'الاسم بالإنجليزي', required: true },
    { field: 'outputs', label: 'Outputs', labelAr: 'المخرجات' },
    { field: 'deliveryIndicators', label: 'Delivery Indicators', labelAr: 'مؤشرات التسليم' },
  ],
  penalty: [
    { field: 'violationAr', label: 'Violation (Arabic)', labelAr: 'المخالفة بالعربي', required: true },
    { field: 'violation', label: 'Violation (English)', labelAr: 'المخالفة بالإنجليزي', required: true },
    { field: 'severity', label: 'Severity', labelAr: 'الخطورة' },
    { field: 'impactScore', label: 'Impact Score', labelAr: 'درجة التأثير' },
  ],
  scope: [
    { field: 'titleAr', label: 'Title (Arabic)', labelAr: 'العنوان بالعربي', required: true },
    { field: 'title', label: 'Title (English)', labelAr: 'العنوان بالإنجليزي', required: true },
    { field: 'description', label: 'Description', labelAr: 'الوصف' },
  ],
  track_kpi: [
    { field: 'nameAr', label: 'Name (Arabic)', labelAr: 'الاسم بالعربي', required: true },
    { field: 'name', label: 'Name (English)', labelAr: 'الاسم بالإنجليزي', required: true },
  ],
};

@Injectable()
export class ImportsService {
  private readonly logger = new Logger('ImportsService');

  constructor(private prisma: PrismaService) {}

  getEntityFields(entityType: string) {
    const fields = ENTITY_FIELDS[entityType];
    if (!fields) throw new BadRequestException('نوع البيانات غير مدعوم');
    return fields;
  }

  // ─── Universal File Parser (Excel + CSV) ───

  async parseFile(filePath: string, ext: string) {
    if (ext === '.csv') {
      return this.parseCSVFile(filePath);
    }
    return this.parseExcel(filePath);
  }

  // ─── CSV Parsing ───

  private async parseCSVFile(filePath: string) {
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
    const lines = raw.split(/\r?\n/).filter(l => l.trim());

    if (lines.length === 0) {
      throw new BadRequestException('ملف CSV فارغ');
    }

    // Auto-detect delimiter
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delimiter = tabCount > commaCount && tabCount > semicolonCount ? '\t'
      : semicolonCount > commaCount ? ';' : ',';

    this.logger.log(`CSV detected: ${lines.length} lines, delimiter="${delimiter === '\t' ? 'TAB' : delimiter}"`);

    const headers = this.parseCSVLine(lines[0], delimiter);

    if (headers.length === 0) {
      throw new BadRequestException('لم يتم العثور على أعمدة في الملف');
    }

    const previewRows: any[] = [];
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      const cols = this.parseCSVLine(lines[i], delimiter);
      const rowData: Record<string, any> = {};
      headers.forEach((header, idx) => {
        rowData[header] = cols[idx] || '';
      });
      previewRows.push(rowData);
    }

    // CSV = single sheet named "CSV"
    return {
      sheets: [{
        name: 'CSV',
        rowCount: lines.length - 1,
        headers,
        preview: previewRows,
      }],
    };
  }

  private parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  // ─── Excel Parsing ───

  async parseExcel(filePath: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets = workbook.worksheets.map((ws) => {
      const headers: string[] = [];
      const firstRow = ws.getRow(1);
      firstRow.eachCell((cell, colNumber) => {
        headers.push(String(cell.value || `Column ${colNumber}`));
      });

      const previewRows: any[] = [];
      for (let i = 2; i <= Math.min(ws.rowCount, 6); i++) {
        const row = ws.getRow(i);
        const rowData: Record<string, any> = {};
        headers.forEach((header, idx) => {
          const cell = row.getCell(idx + 1);
          rowData[header] = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
        });
        previewRows.push(rowData);
      }

      return {
        name: ws.name,
        rowCount: ws.rowCount - 1,
        headers,
        preview: previewRows,
      };
    });

    return { sheets };
  }

  // ─── Parse Sheet (Excel or CSV) ───

  async parseSheet(filePath: string, sheetName: string, ext?: string) {
    if (ext === '.csv' || sheetName === 'CSV') {
      return this.parseCSVSheetFull(filePath);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) throw new BadRequestException('الورقة غير موجودة');

    const headers: string[] = [];
    const firstRow = ws.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers.push(String(cell.value || `Column ${colNumber}`));
    });

    const rows: Record<string, any>[] = [];
    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const rowData: Record<string, any> = {};
      let hasData = false;
      headers.forEach((header, idx) => {
        const cell = row.getCell(idx + 1);
        const val = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
        rowData[header] = val;
        if (val) hasData = true;
      });
      if (hasData) rows.push(rowData);
    }

    return { headers, rows, totalRows: rows.length };
  }

  private parseCSVSheetFull(filePath: string) {
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter(l => l.trim());

    if (lines.length < 2) {
      return { headers: [], rows: [], totalRows: 0 };
    }

    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delimiter = tabCount > commaCount && tabCount > semicolonCount ? '\t'
      : semicolonCount > commaCount ? ';' : ',';

    const headers = this.parseCSVLine(lines[0], delimiter);
    const rows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCSVLine(lines[i], delimiter);
      const rowData: Record<string, any> = {};
      let hasData = false;
      headers.forEach((header, idx) => {
        const val = cols[idx] || '';
        rowData[header] = val;
        if (val) hasData = true;
      });
      if (hasData) rows.push(rowData);
    }

    return { headers, rows, totalRows: rows.length };
  }

  // ─── Import Data ───

  async importData(dto: ImportDataDto, userId: string) {
    const { entityType, mapping, rows, trackId, fileName } = dto;

    if (!ENTITY_FIELDS[entityType]) {
      throw new BadRequestException('نوع البيانات غير مدعوم');
    }

    this.logger.log(`Starting import: type=${entityType}, rows=${rows.length}, trackId=${trackId || 'none'}`);

    if (entityType === 'task') {
      return this.importTasks(dto, userId);
    }

    let inserted = 0;
    let skipped = 0;
    const errors: any[] = [];

    // Process in batches of 100
    const BATCH_SIZE = 100;
    for (let batch = 0; batch < rows.length; batch += BATCH_SIZE) {
      const batchRows = rows.slice(batch, batch + BATCH_SIZE);

      for (let i = 0; i < batchRows.length; i++) {
        const rowIdx = batch + i;
        try {
          const record: Record<string, any> = {};
          for (const map of mapping) {
            if (map.dbField && map.excelColumn && batchRows[i][map.excelColumn] !== undefined) {
              let value: any = batchRows[i][map.excelColumn];
              if (map.dbField === 'impactScore') {
                value = parseFloat(value) || 0;
              }
              record[map.dbField] = value;
            }
          }

          if (Object.keys(record).length === 0) {
            skipped++;
            continue;
          }

          if (trackId) record.trackId = trackId;

          switch (entityType) {
            case 'employee':
              if (!record.fullNameAr || !record.fullName) { skipped++; continue; }
              await this.prisma.employee.create({ data: record as any });
              break;
            case 'deliverable':
              if (!record.nameAr || !record.name || !record.trackId) { skipped++; continue; }
              await this.prisma.deliverable.create({ data: record as any });
              break;
            case 'penalty':
              if (!record.violationAr || !record.violation || !record.trackId) { skipped++; continue; }
              await this.prisma.penalty.create({ data: record as any });
              break;
            case 'scope':
              if (!record.titleAr || !record.title || !record.trackId) { skipped++; continue; }
              await this.prisma.scope.create({ data: record as any });
              break;
            case 'track_kpi':
              if (!record.nameAr || !record.name || !record.trackId) { skipped++; continue; }
              await this.prisma.trackKPI.create({ data: record as any });
              break;
          }
          inserted++;
        } catch (err: any) {
          errors.push({ row: rowIdx + 2, error: err.message });
          skipped++;
        }
      }
    }

    this.logger.log(`Import complete: inserted=${inserted}, skipped=${skipped}, errors=${errors.length}`);

    await this.prisma.importHistory.create({
      data: {
        fileName: fileName || 'import.xlsx',
        fileSize: 0,
        importedBy: userId,
        status: errors.length > 0 ? (inserted > 0 ? 'completed' : 'failed') : 'completed',
        summary: { inserted, skipped, errors: errors.length, total: rows.length },
        errorLog: errors,
      },
    });

    return { inserted, skipped, errors: errors.length, total: rows.length, errorDetails: errors.slice(0, 20) };
  }

  // ─── Task Import with Validation ───

  private async importTasks(dto: ImportDataDto, userId: string) {
    const { mapping, rows, trackId, fileName } = dto;

    let inserted = 0;
    let skipped = 0;
    const errors: any[] = [];

    // Pre-load tracks and users for validation & lookup
    const allTracks = await this.prisma.track.findMany({
      select: { id: true, name: true, nameAr: true },
    });
    const allUsers = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameAr: true, email: true },
    });

    const trackMap = new Map<string, string>(); // normalized name -> id
    for (const t of allTracks) {
      trackMap.set(t.name.toLowerCase().trim(), t.id);
      trackMap.set(t.nameAr.toLowerCase().trim(), t.id);
    }

    const userMap = new Map<string, string>(); // normalized name/email -> id
    for (const u of allUsers) {
      if (u.name) userMap.set(u.name.toLowerCase().trim(), u.id);
      if (u.nameAr) userMap.set(u.nameAr.toLowerCase().trim(), u.id);
      if (u.email) userMap.set(u.email.toLowerCase().trim(), u.id);
    }

    // Process in batches
    const BATCH_SIZE = 50;
    for (let batch = 0; batch < rows.length; batch += BATCH_SIZE) {
      const batchRows = rows.slice(batch, batch + BATCH_SIZE);

      for (let i = 0; i < batchRows.length; i++) {
        const rowIdx = batch + i;
        const rowNum = rowIdx + 2; // 1-indexed + header row

        try {
          // Build record from mapping
          const record: Record<string, any> = {};
          for (const map of mapping) {
            if (map.dbField && map.excelColumn && batchRows[i][map.excelColumn] !== undefined) {
              record[map.dbField] = String(batchRows[i][map.excelColumn] || '').trim();
            }
          }

          // ─── Validate required: Task Name ───
          const taskName = record.title;
          if (!taskName) {
            errors.push({ row: rowNum, error: 'اسم المهمة مطلوب ولا يمكن أن يكون فارغاً' });
            skipped++;
            continue;
          }

          // ─── Resolve track ───
          let resolvedTrackId = trackId; // default from selector
          if (record.trackName) {
            const found = trackMap.get(record.trackName.toLowerCase().trim());
            if (found) {
              resolvedTrackId = found;
            } else {
              errors.push({ row: rowNum, error: `المسار "${record.trackName}" غير موجود في النظام` });
              skipped++;
              continue;
            }
          }

          if (!resolvedTrackId) {
            errors.push({ row: rowNum, error: 'يجب تحديد المسار (من الملف أو من القائمة)' });
            skipped++;
            continue;
          }

          // ─── Parse dates ───
          const startDate = this.parseFlexDate(record.startDate);
          const dueDate = this.parseFlexDate(record.dueDate);

          // Validate date order
          if (startDate && dueDate && startDate > dueDate) {
            errors.push({ row: rowNum, error: `تاريخ البدء (${record.startDate}) يجب أن يكون قبل تاريخ الانتهاء (${record.dueDate})` });
            skipped++;
            continue;
          }

          // ─── Map status ───
          const statusRaw = (record.status || '').toLowerCase();
          const STATUS_MAP: Record<string, string> = {
            'pending': 'pending', 'معلق': 'pending', 'لم يبدأ': 'pending', 'not started': 'pending',
            'in progress': 'in_progress', 'in_progress': 'in_progress', 'قيد التنفيذ': 'in_progress', 'جاري': 'in_progress',
            'completed': 'completed', 'done': 'completed', 'مكتمل': 'completed', 'مكتملة': 'completed', 'تم': 'completed',
            'delayed': 'delayed', 'متأخر': 'delayed', 'متأخرة': 'delayed',
            'under review': 'under_review', 'under_review': 'under_review', 'مراجعة': 'under_review',
            'cancelled': 'cancelled', 'canceled': 'cancelled', 'ملغي': 'cancelled', 'ملغية': 'cancelled',
          };
          const status = STATUS_MAP[statusRaw] || 'pending';

          // ─── Map priority ───
          const priorityRaw = (record.priority || '').toLowerCase();
          const PRIORITY_MAP: Record<string, string> = {
            'low': 'low', 'منخفض': 'low', 'منخفضة': 'low',
            'medium': 'medium', 'متوسط': 'medium', 'متوسطة': 'medium', 'عادي': 'medium',
            'high': 'high', 'عالي': 'high', 'عالية': 'high', 'مرتفع': 'high',
            'critical': 'critical', 'حرج': 'critical', 'حرجة': 'critical', 'عاجل': 'critical',
          };
          const priority = PRIORITY_MAP[priorityRaw] || 'medium';

          // ─── Parse progress ───
          let progress = parseInt(record.progress) || 0;
          progress = Math.min(100, Math.max(0, progress));
          if (status === 'completed' && progress === 0) progress = 100;

          // ─── Parse duration ───
          const duration = parseFloat(record.duration) || undefined;

          // ─── Resolve owner to user ───
          let assigneeUserId: string | undefined;
          if (record.owner) {
            const found = userMap.get(record.owner.toLowerCase().trim());
            if (found) {
              assigneeUserId = found;
            }
            // If owner not found, we still create the task but add note
          }

          // ─── Create task ───
          const taskData: any = {
            title: taskName,
            titleAr: record.titleAr || taskName,
            description: record.description || undefined,
            trackId: resolvedTrackId,
            status,
            priority,
            progress,
            startDate: startDate || undefined,
            dueDate: dueDate || undefined,
            duration: duration || undefined,
            notes: record.notes || (record.owner && !assigneeUserId ? `المسؤول: ${record.owner}` : undefined),
            createdById: userId,
            assigneeType: assigneeUserId ? 'USER' : 'TRACK',
            assigneeUserId: assigneeUserId || undefined,
            assigneeTrackId: resolvedTrackId,
            outlineLevel: 1,
            sortOrder: rowIdx,
          };

          if (status === 'completed') {
            taskData.completionDate = dueDate || new Date();
          }

          await this.prisma.task.create({ data: taskData });
          inserted++;
          this.logger.debug(`Row ${rowNum}: Created task "${taskName}" in track ${resolvedTrackId}`);
        } catch (err: any) {
          this.logger.error(`Row ${rowNum} error: ${err.message}`);
          errors.push({ row: rowNum, error: err.message });
          skipped++;
        }
      }
    }

    this.logger.log(`Task import complete: inserted=${inserted}, skipped=${skipped}, errors=${errors.length}`);

    await this.prisma.importHistory.create({
      data: {
        fileName: fileName || 'import.csv',
        fileSize: 0,
        importedBy: userId,
        status: errors.length > 0 ? (inserted > 0 ? 'completed' : 'failed') : 'completed',
        summary: { inserted, skipped, errors: errors.length, total: rows.length },
        errorLog: errors,
      },
    });

    return { inserted, skipped, errors: errors.length, total: rows.length, errorDetails: errors.slice(0, 20) };
  }

  // ─── Date Parser (flexible) ───

  private parseFlexDate(str?: string): Date | null {
    if (!str || !str.trim()) return null;
    const s = str.trim();

    // Try ISO: 2026-03-01
    const iso = Date.parse(s);
    if (!isNaN(iso)) return new Date(iso);

    // Try DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmyMatch) {
      const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
      if (!isNaN(d.getTime())) return d;
    }

    // Try MM/DD/YYYY
    const mdyMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (mdyMatch) {
      const month = parseInt(mdyMatch[1]);
      const day = parseInt(mdyMatch[2]);
      if (month > 12 && day <= 12) {
        // Swap: it's DD/MM
        const d = new Date(parseInt(mdyMatch[3]), day - 1, month);
        if (!isNaN(d.getTime())) return d;
      }
    }

    return null;
  }

  // ─── History ───

  async getHistory(params?: { page?: number; pageSize?: number }) {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const { skip, take } = buildSkipTake(page, pageSize);

    const [data, total] = await Promise.all([
      this.prisma.importHistory.findMany({
        include: {
          author: { select: { id: true, name: true, nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.importHistory.count(),
    ]);

    return { data, total, page, pageSize };
  }
}
