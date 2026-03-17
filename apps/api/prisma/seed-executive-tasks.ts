/**
 * Seed script to import المتابعة اليومية.xlsx into executive_tasks table.
 * Run: npx ts-node prisma/seed-executive-tasks.ts
 */
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as path from 'path';

const prisma = new PrismaClient();

const STATUS_MAP: Record<string, string> = {
  'تم الارسال': 'sent',
  'قيد التنفيذ': 'in_progress',
  'قيد التعديل': 'editing',
  'تم التعديل': 'edited',
  'معتمد': 'approved',
  'مكتملة': 'completed',
  'مكتمل': 'completed',
};

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseStatus(val: any): string {
  if (!val) return 'in_progress';
  const s = val.toString().trim();
  return STATUS_MAP[s] || 'in_progress';
}

async function main() {
  const filePath = '/Users/mazin/Dash/المتابعة اليومية.xlsx';
  console.log(`Reading Excel: ${filePath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // Sheet configs: map each sheet to how we extract data
  const sheetConfigs: Array<{
    sheetName: string;
    displayName: string;
    columns: Record<string, string>; // Excel header -> field name
  }> = [
    {
      sheetName: 'تحديث',
      displayName: 'تحديث',
      columns: {
        'الاسم': 'name',
        'الحالة': 'status',
        'المسار': 'track',
        'الجهة': 'entity',
        'تاريخ استلام': 'receiveDate',
        'تاريخ اخر اجراء': 'lastActionDate',
        'تاريخ استحقاق': 'dueDate',
        'الملاحظات': 'notes',
      },
    },
    {
      sheetName: 'مهام د. حسام',
      displayName: 'مهام د. حسام',
      columns: {
        'الاسم': 'name',
        'الحالة': 'status',
        'المسؤولية': 'responsible',
        'المتابعة': 'followUp',
        'تاريخ الطلب ': 'receiveDate',
        'تسليم الطلب': 'deliveryDate',
        'ملاحظات': 'notes',
      },
    },
    {
      sheetName: 'جدول الطباعة',
      displayName: 'جدول الطباعة',
      columns: {
        'اليوم': 'name',
        'التاريخ الميلادي': 'receiveDate',
        'التاريخ الهجري': 'notes',
        'الكمية المتوقعة': 'entity',
        'التراكمي': 'responsible',
        'الفرع': 'track',
      },
    },
  ];

  // Clear existing executive tasks
  await prisma.executiveTask.deleteMany({});
  console.log('Cleared existing executive tasks');

  let totalImported = 0;

  for (const config of sheetConfigs) {
    const worksheet = workbook.getWorksheet(config.sheetName);
    if (!worksheet) {
      console.log(`Sheet "${config.sheetName}" not found, skipping`);
      continue;
    }

    // Read headers from first row
    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString().trim() || '';
    });

    const tasks: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rawData: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          // Handle formula cells - get the result value
          rawData[header] = cell.result !== undefined ? cell.result : cell.value;
        }
      });

      // Map to our fields
      const mappedData: Record<string, any> = {};
      for (const [excelKey, fieldName] of Object.entries(config.columns)) {
        mappedData[fieldName] = rawData[excelKey];
      }

      const name = (mappedData.name || '').toString().trim();
      if (!name) return;

      // For جدول الطباعة, format the name with date
      let finalName = name;
      if (config.sheetName === 'جدول الطباعة') {
        const dateVal = mappedData.receiveDate;
        if (dateVal instanceof Date) {
          finalName = `${name} - ${dateVal.toLocaleDateString('ar-SA')}`;
        }
      }

      tasks.push({
        sheetName: config.displayName,
        name: finalName,
        status: parseStatus(mappedData.status) as any,
        track: mappedData.track?.toString().trim() || null,
        entity: mappedData.entity?.toString().trim() || null,
        responsible: mappedData.responsible?.toString().trim() || null,
        followUp: mappedData.followUp?.toString().trim() || null,
        receiveDate: parseDate(mappedData.receiveDate),
        lastActionDate: parseDate(mappedData.lastActionDate),
        dueDate: parseDate(mappedData.dueDate),
        deliveryDate: parseDate(mappedData.deliveryDate),
        notes: mappedData.notes?.toString().trim() || null,
        sortOrder: rowNumber - 1,
      });
    });

    if (tasks.length > 0) {
      await prisma.executiveTask.createMany({ data: tasks });
      console.log(`Imported ${tasks.length} tasks from "${config.sheetName}"`);
      totalImported += tasks.length;
    }
  }

  console.log(`\nTotal imported: ${totalImported} executive tasks`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
