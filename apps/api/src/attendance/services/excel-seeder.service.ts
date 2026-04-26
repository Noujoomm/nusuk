import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PdfShiftType, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { normalizeArabic } from '../utils/arabic-normalizer';
import {
  HeaderKey,
  cellString,
  cellTime,
  deriveTrackDetail,
  mapHeaders,
  parseShiftType,
  parseTruthy,
} from '../utils/excel-helpers';

/** Master sheet that holds the summary list of every employee. */
const SUMMARY_SHEET_NAME = 'Sheet1';

export interface SeedResult {
  totalRowsRead: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ sheet: string; row: number; reason: string }>;
}

interface EmployeeDraft {
  fullName: string;
  normalizedName: string;
  track: string;
  trackDetail: string | null;
  phoneNumber: string | null;
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  shiftType: PdfShiftType;
  worksByCharter: boolean;
  source: 'summary' | 'subsheet';
}

@Injectable()
export class ExcelSeederService {
  private readonly logger = new Logger(ExcelSeederService.name);

  constructor(private prisma: PrismaService) {}

  async seedFromBuffer(buffer: Buffer): Promise<SeedResult> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch (err: any) {
      throw new BadRequestException(`فشل قراءة ملف Excel: ${err?.message || err}`);
    }

    const drafts = new Map<string, EmployeeDraft>();
    const errors: SeedResult['errors'] = [];
    let totalRowsRead = 0;

    // Pass 1 — summary sheet first so subsheets win on conflicting fields.
    const summary = workbook.getWorksheet(SUMMARY_SHEET_NAME);
    if (summary) {
      const { rows, errors: sheetErrors } = this.readSheet(summary, 'summary');
      totalRowsRead += rows.length;
      errors.push(...sheetErrors);
      for (const draft of rows) drafts.set(draft.normalizedName, draft);
    } else {
      this.logger.warn(`Workbook is missing the "${SUMMARY_SHEET_NAME}" master sheet`);
    }

    // Pass 2 — per-track subsheets.
    workbook.eachSheet((sheet) => {
      if (sheet.name === SUMMARY_SHEET_NAME) return;
      const { rows, errors: sheetErrors } = this.readSheet(sheet, 'subsheet');
      totalRowsRead += rows.length;
      errors.push(...sheetErrors);
      for (const draft of rows) {
        const existing = drafts.get(draft.normalizedName);
        drafts.set(
          draft.normalizedName,
          existing ? this.merge(existing, draft) : draft,
        );
      }
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const draft of drafts.values()) {
      try {
        const existing = await this.prisma.pdfAttendanceEmployee.findFirst({
          where: { normalizedName: draft.normalizedName },
          select: { id: true },
        });

        const data: Prisma.PdfAttendanceEmployeeUncheckedCreateInput = {
          fullName: draft.fullName,
          normalizedName: draft.normalizedName,
          track: draft.track,
          trackDetail: draft.trackDetail,
          phoneNumber: draft.phoneNumber,
          scheduledCheckIn: draft.scheduledCheckIn,
          scheduledCheckOut: draft.scheduledCheckOut,
          shiftType: draft.shiftType,
          worksByCharter: draft.worksByCharter,
          isActive: true,
        };

        if (existing) {
          await this.prisma.pdfAttendanceEmployee.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await this.prisma.pdfAttendanceEmployee.create({ data });
          created++;
        }
      } catch (err: any) {
        skipped++;
        this.logger.error(`Failed to upsert "${draft.fullName}": ${err?.message}`);
      }
    }

    const result = { totalRowsRead, created, updated, skipped, errors };
    this.logger.log(
      `Seed complete — read=${totalRowsRead} created=${created} updated=${updated} skipped=${skipped} parseErrors=${errors.length}`,
    );
    return result;
  }

  private readSheet(
    sheet: ExcelJS.Worksheet,
    source: 'summary' | 'subsheet',
  ): { rows: EmployeeDraft[]; errors: SeedResult['errors'] } {
    const rows: EmployeeDraft[] = [];
    const errors: SeedResult['errors'] = [];
    const cols = mapHeaders(sheet.getRow(1));

    if (cols.name == null) {
      errors.push({ sheet: sheet.name, row: 1, reason: 'لا يوجد عمود "الاسم"' });
      return { rows, errors };
    }

    const trackFromSheetName = source === 'subsheet' ? sheet.name.trim() : null;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const rawName = cellString(row.getCell(cols.name!));
      if (!rawName) return;

      const normalizedName = normalizeArabic(rawName);
      if (!normalizedName) {
        errors.push({ sheet: sheet.name, row: rowNumber, reason: `اسم فارغ بعد التطبيع: "${rawName}"` });
        return;
      }

      const trackRaw = cols.track != null ? cellString(row.getCell(cols.track)) : '';
      const track = (trackRaw || trackFromSheetName || 'غير محدد').trim();

      rows.push({
        fullName: rawName.trim(),
        normalizedName,
        track,
        trackDetail: deriveTrackDetail(trackFromSheetName),
        phoneNumber: cols.phone != null ? (cellString(row.getCell(cols.phone)) || null) : null,
        scheduledCheckIn: cols.checkIn != null ? cellTime(row.getCell(cols.checkIn)) : null,
        scheduledCheckOut: cols.checkOut != null ? cellTime(row.getCell(cols.checkOut)) : null,
        shiftType: parseShiftType(cols.shift != null ? cellString(row.getCell(cols.shift)) : ''),
        worksByCharter: parseTruthy(cols.charter != null ? cellString(row.getCell(cols.charter)) : ''),
        source,
      });
    });

    return { rows, errors };
  }

  private merge(base: EmployeeDraft, override: EmployeeDraft): EmployeeDraft {
    // Subsheet wins on per-track fields; keep summary's name spelling if present.
    return {
      fullName: base.fullName || override.fullName,
      normalizedName: base.normalizedName,
      track: override.track || base.track,
      trackDetail: override.trackDetail ?? base.trackDetail,
      phoneNumber: override.phoneNumber ?? base.phoneNumber,
      scheduledCheckIn: override.scheduledCheckIn ?? base.scheduledCheckIn,
      scheduledCheckOut: override.scheduledCheckOut ?? base.scheduledCheckOut,
      shiftType: override.shiftType !== 'morning' ? override.shiftType : base.shiftType,
      worksByCharter: override.worksByCharter || base.worksByCharter,
      source: 'subsheet',
    };
  }
}
