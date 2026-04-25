import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PdfShiftType, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { normalizeArabic } from '../utils/arabic-normalizer';

/** Master sheet that holds the summary list of every employee. */
const SUMMARY_SHEET_NAME = 'Sheet1';

/** Headers we look for. Keys are canonical, values list every spelling we accept. */
const HEADER_ALIASES: Record<string, string[]> = {
  serial: ['م'],
  name: ['الاسم', 'الاسم الكامل', 'اسم الموظف'],
  track: ['المسار', 'المسار الأصلي'],
  phone: ['رقم الجوال', 'الجوال', 'رقم الهاتف'],
  checkIn: ['وقت الحضور'],
  checkOut: ['وقت الانصراف', 'وقت الانصارف'], // ⚠️ second one is the misspelling in the source file
  shift: ['فترة الدوام'],
  charter: ['العمل حسب الكراسة'],
};

/** Strings in `فترة الدوام` mapped to our enum. Falls back to `morning`. */
const SHIFT_TYPE_MAP: Array<{ keywords: string[]; type: PdfShiftType }> = [
  { keywords: ['صباحي/مسائي', 'بالتناوب', 'تناوب'], type: 'rotating' },
  { keywords: ['on call', 'on-call', 'oncall', 'اون كول'], type: 'on_call' },
  { keywords: ['اونلاين', 'أونلاين', 'online', 'عن بعد'], type: 'online' },
  { keywords: ['بدون وقت محدد', 'بدون وقت', 'غير محدد'], type: 'unscheduled' },
  { keywords: ['ليلي'], type: 'night' },
  { keywords: ['مسائي'], type: 'evening' },
  { keywords: ['صباحي'], type: 'morning' },
];

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

    // Pass 1 — summary sheet first so subsheets can override.
    const summary = workbook.getWorksheet(SUMMARY_SHEET_NAME);
    if (summary) {
      const { rows, errors: sheetErrors } = this.readSheet(summary, 'summary');
      totalRowsRead += rows.length;
      errors.push(...sheetErrors);
      for (const draft of rows) {
        drafts.set(draft.normalizedName, draft);
      }
    } else {
      this.logger.warn(`Workbook is missing the "${SUMMARY_SHEET_NAME}" master sheet`);
    }

    // Pass 2 — per-track subsheets win on shiftType / trackDetail / scheduled times.
    workbook.eachSheet((sheet) => {
      if (sheet.name === SUMMARY_SHEET_NAME) return;
      const { rows, errors: sheetErrors } = this.readSheet(sheet, 'subsheet');
      totalRowsRead += rows.length;
      errors.push(...sheetErrors);
      for (const draft of rows) {
        const existing = drafts.get(draft.normalizedName);
        if (existing) {
          drafts.set(draft.normalizedName, this.merge(existing, draft));
        } else {
          drafts.set(draft.normalizedName, draft);
        }
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
          await this.prisma.pdfAttendanceEmployee.update({
            where: { id: existing.id },
            data,
          });
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

  constructor(private prisma: PrismaService) {}

  // ─── parsing helpers ──────────────────────────────────────────────────────

  private readSheet(
    sheet: ExcelJS.Worksheet,
    source: 'summary' | 'subsheet',
  ): { rows: EmployeeDraft[]; errors: SeedResult['errors'] } {
    const rows: EmployeeDraft[] = [];
    const errors: SeedResult['errors'] = [];
    const headerRow = sheet.getRow(1);
    const cols = this.mapHeaders(headerRow);

    if (cols.name == null) {
      errors.push({ sheet: sheet.name, row: 1, reason: 'لا يوجد عمود "الاسم"' });
      return { rows, errors };
    }

    const trackFromSheetName = source === 'subsheet' ? sheet.name.trim() : null;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const rawName = this.cellString(row.getCell(cols.name!));
      if (!rawName) return;

      const normalizedName = normalizeArabic(rawName);
      if (!normalizedName) {
        errors.push({ sheet: sheet.name, row: rowNumber, reason: `اسم فارغ بعد التطبيع: "${rawName}"` });
        return;
      }

      const trackRaw = cols.track != null ? this.cellString(row.getCell(cols.track)) : '';
      const track = (trackRaw || trackFromSheetName || 'غير محدد').trim();
      const trackDetail = this.deriveTrackDetail(trackFromSheetName);

      rows.push({
        fullName: rawName.trim(),
        normalizedName,
        track,
        trackDetail,
        phoneNumber: cols.phone != null ? (this.cellString(row.getCell(cols.phone)) || null) : null,
        scheduledCheckIn: cols.checkIn != null ? this.cellTime(row.getCell(cols.checkIn)) : null,
        scheduledCheckOut: cols.checkOut != null ? this.cellTime(row.getCell(cols.checkOut)) : null,
        shiftType: this.parseShiftType(cols.shift != null ? this.cellString(row.getCell(cols.shift)) : ''),
        worksByCharter: this.parseTruthy(cols.charter != null ? this.cellString(row.getCell(cols.charter)) : ''),
        source,
      });
    });

    return { rows, errors };
  }

  /** Resolves canonical column → index based on the actual header strings present. */
  private mapHeaders(headerRow: ExcelJS.Row): Partial<Record<keyof typeof HEADER_ALIASES, number>> {
    const result: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
    headerRow.eachCell((cell, colNumber) => {
      const value = this.cellString(cell);
      if (!value) return;
      const cleaned = value.trim();
      for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some((a) => cleaned === a || cleaned.includes(a))) {
          result[canonical as keyof typeof HEADER_ALIASES] = colNumber;
          break;
        }
      }
    });
    return result;
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

  /** "التوزيع - مكة المكرمة" → "مكة المكرمة" ; otherwise null. */
  private deriveTrackDetail(sheetName: string | null): string | null {
    if (!sheetName) return null;
    const dashIdx = sheetName.indexOf('-');
    if (dashIdx === -1) return null;
    return sheetName.slice(dashIdx + 1).trim() || null;
  }

  private parseShiftType(value: string): PdfShiftType {
    if (!value) return 'morning';
    const lower = value.toLowerCase();
    for (const { keywords, type } of SHIFT_TYPE_MAP) {
      if (keywords.some((k) => lower.includes(k.toLowerCase()))) return type;
    }
    return 'morning';
  }

  private parseTruthy(value: string): boolean {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    return v === '✅' || v === 'نعم' || v === 'yes' || v === 'true' || v === '1' || v === '✓';
  }

  /** Cells may hold an ExcelJS rich-text or formula object — flatten to plain text. */
  private cellString(cell: ExcelJS.Cell): string {
    const v = cell?.value;
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      // Rich text or formula result
      const anyV = v as any;
      if (Array.isArray(anyV.richText)) {
        return anyV.richText.map((r: any) => r.text).join('');
      }
      if (anyV.result != null) return String(anyV.result);
      if (anyV.text) return String(anyV.text);
    }
    return String(v);
  }

  /**
   * Excel times come through as a JS Date in UTC at year 1899/1900. Format as
   * "HH:mm" using UTC getters so the local TZ doesn't shift the displayed time.
   * Strings like "07:00" pass through unchanged.
   */
  private cellTime(cell: ExcelJS.Cell): string | null {
    const v = cell?.value;
    if (v == null) return null;
    if (v instanceof Date) {
      const hh = String(v.getUTCHours()).padStart(2, '0');
      const mm = String(v.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    if (typeof v === 'string') {
      const match = v.match(/(\d{1,2}):(\d{2})/);
      if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
      return null;
    }
    if (typeof v === 'number') {
      // Excel serial — fractional day. 0.5 = noon.
      const totalMin = Math.round(v * 24 * 60) % (24 * 60);
      const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
      const mm = String(totalMin % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return null;
  }
}
