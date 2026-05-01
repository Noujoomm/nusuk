import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DistributionVisionService } from './claude-vision.service';
import type {
  ExtractedDistributionData,
  ExtractedDistributionRow,
} from '../interfaces/analyzer.types';

/**
 * Routes the uploaded buffer to the right extractor:
 *   - Excel / CSV  → exceljs, header-driven column mapping
 *   - Image (jpg/png/webp) → Claude Vision
 *   - PDF → not yet wired (Phase 3)
 *
 * The Excel path expects the same column shape the platform exports
 * itself: التاريخ / الموافق / الشحنة / الشركات / الطرود / المركز / البطاقات.
 * Header names are matched case-insensitively after light normalisation
 * so user-edited copies still parse.
 */
@Injectable()
export class DistributionFileParserService {
  private readonly logger = new Logger(DistributionFileParserService.name);

  constructor(private readonly vision: DistributionVisionService) {}

  async parse(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<ExtractedDistributionData> {
    const ext = (fileName.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();

    if (mimeType.startsWith('image/')) {
      const mt = (mimeType === 'image/jpg' ? 'image/jpeg' : mimeType) as
        | 'image/jpeg'
        | 'image/png'
        | 'image/webp';
      return this.vision.extractFromImage(buffer, mt);
    }

    if (
      mimeType.includes('spreadsheet') ||
      mimeType === 'application/vnd.ms-excel' ||
      ext === '.xlsx' ||
      ext === '.xls'
    ) {
      return this.parseExcel(buffer);
    }

    if (mimeType === 'text/csv' || ext === '.csv') {
      return this.parseCsv(buffer);
    }

    if (mimeType === 'application/pdf' || ext === '.pdf') {
      throw new BadRequestException(
        'استخراج بيانات PDF قيد التجهيز — يُرجى رفع Excel أو صورة من الجدول حالياً.',
      );
    }

    throw new BadRequestException('نوع الملف غير مدعوم');
  }

  // ─── Excel ─────────────────────────────────────────────────────────────
  private async parseExcel(buffer: Buffer): Promise<ExtractedDistributionData> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch (err: any) {
      throw new BadRequestException(`فشل قراءة ملف Excel: ${err?.message || err}`);
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('ملف Excel فارغ');

    const cols = mapHeaders(ws.getRow(1));
    if (cols.gregorianDate == null && cols.hijriDate == null) {
      throw new BadRequestException(
        'لم يتم العثور على عمود التاريخ — تأكد أن الصف الأول يحتوي عناوين الأعمدة بالعربية أو الإنجليزية.',
      );
    }

    const rows: ExtractedDistributionRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const greg = cellDate(row.getCell(cols.gregorianDate ?? -1));
      const hijri = cols.hijriDate != null ? cellString(row.getCell(cols.hijriDate)) : null;
      // Skip total/footer rows: heuristic = no date and no batch.
      if (!greg && !hijri && cols.batch != null && !cellString(row.getCell(cols.batch))) return;

      rows.push({
        gregorianDate: greg ?? '',
        hijriDate: hijri || null,
        batch: cols.batch != null ? cellString(row.getCell(cols.batch)) : null,
        companies: cols.companies != null ? cellInt(row.getCell(cols.companies)) : null,
        parcels: cols.parcels != null ? cellInt(row.getCell(cols.parcels)) : null,
        totalCards: cols.totalCards != null ? cellInt(row.getCell(cols.totalCards)) : null,
        cardsPerHour: cols.cardsPerHour != null ? cellInt(row.getCell(cols.cardsPerHour)) : null,
        duration: cols.duration != null ? cellInt(row.getCell(cols.duration)) : null,
        specialists: cols.specialists != null ? cellInt(row.getCell(cols.specialists)) : null,
        center: cols.center != null ? centerOf(cellString(row.getCell(cols.center))) : null,
        notes: cols.notes != null ? cellString(row.getCell(cols.notes)) || null : null,
      });
    });

    this.logger.log(`Excel parser extracted ${rows.length} rows`);
    return {
      rows: rows.filter((r) => r.gregorianDate || r.hijriDate),
      source: 'EXCEL',
    };
  }

  // ─── CSV (UTF-8 with BOM tolerated) ────────────────────────────────────
  private async parseCsv(buffer: Buffer): Promise<ExtractedDistributionData> {
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('ملف CSV فارغ أو بدون بيانات');

    const headerCells = splitCsv(lines[0]);
    const cols = mapHeaderArray(headerCells);
    if (cols.gregorianDate == null && cols.hijriDate == null) {
      throw new BadRequestException('لم يتم العثور على عمود التاريخ في ملف CSV');
    }

    const rows: ExtractedDistributionRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsv(lines[i]);
      const greg = cols.gregorianDate != null ? parseDateString(cells[cols.gregorianDate]) : null;
      const hijri = cols.hijriDate != null ? cells[cols.hijriDate] || null : null;
      rows.push({
        gregorianDate: greg ?? '',
        hijriDate: hijri,
        batch: cols.batch != null ? cells[cols.batch] || null : null,
        companies: parseIntLoose(cols.companies != null ? cells[cols.companies] : null),
        parcels: parseIntLoose(cols.parcels != null ? cells[cols.parcels] : null),
        totalCards: parseIntLoose(cols.totalCards != null ? cells[cols.totalCards] : null),
        cardsPerHour: parseIntLoose(cols.cardsPerHour != null ? cells[cols.cardsPerHour] : null),
        duration: parseIntLoose(cols.duration != null ? cells[cols.duration] : null),
        specialists: parseIntLoose(cols.specialists != null ? cells[cols.specialists] : null),
        center: cols.center != null ? centerOf(cells[cols.center]) : null,
        notes: cols.notes != null ? cells[cols.notes] || null : null,
      });
    }

    this.logger.log(`CSV parser extracted ${rows.length} rows`);
    return { rows: rows.filter((r) => r.gregorianDate || r.hijriDate), source: 'CSV' };
  }
}

// ─── Header mapping helpers ─────────────────────────────────────────────

interface ColIndex {
  gregorianDate?: number;
  hijriDate?: number;
  batch?: number;
  companies?: number;
  parcels?: number;
  totalCards?: number;
  cardsPerHour?: number;
  duration?: number;
  specialists?: number;
  center?: number;
  notes?: number;
}

function normalize(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\sـ]+/g, ' ')
    .trim();
}

function mapHeaders(headerRow: ExcelJS.Row): ColIndex {
  const headers: string[] = [];
  for (let c = 1; c <= headerRow.cellCount; c++) {
    headers.push(normalize(cellString(headerRow.getCell(c)) ?? ''));
  }
  // 1-indexed indices on Excel rows.
  const idx = mapHeaderArray(headers);
  const out: ColIndex = {};
  (Object.keys(idx) as Array<keyof ColIndex>).forEach((k) => {
    if (idx[k] != null) out[k] = (idx[k] as number) + 1;
  });
  return out;
}

function mapHeaderArray(arr: string[]): ColIndex {
  const out: ColIndex = {};
  arr.forEach((h, i) => {
    const n = normalize(h);
    if (matches(n, ['التاريخ', 'date', 'gregorian'])) out.gregorianDate = i;
    else if (matches(n, ['الموافق', 'هجري', 'hijri'])) out.hijriDate = i;
    else if (matches(n, ['الشحنة', 'batch', 'shipment'])) out.batch = i;
    else if (matches(n, ['الشركات', 'companies'])) out.companies = i;
    else if (matches(n, ['الطرود', 'parcels', 'packages'])) out.parcels = i;
    else if (matches(n, ['البطاقات', 'cards', 'total cards'])) out.totalCards = i;
    else if (matches(n, ['ساعة', 'cards per hour', 'بطاقة/ساعة', 'بطاقة /ساعة'])) out.cardsPerHour = i;
    else if (matches(n, ['المدة', 'duration', 'ساعات'])) out.duration = i;
    else if (matches(n, ['الاختصاصيين', 'specialists', 'موظفين'])) out.specialists = i;
    else if (matches(n, ['المركز', 'center', 'centre'])) out.center = i;
    else if (matches(n, ['ملاحظات', 'notes'])) out.notes = i;
  });
  return out;
}

function matches(needle: string, candidates: string[]): boolean {
  return candidates.some((c) => needle.includes(normalize(c)));
}

function cellString(cell: ExcelJS.Cell | undefined): string | null {
  if (!cell) return null;
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text).trim();
  if (typeof v === 'object' && 'result' in (v as any)) return String((v as any).result).trim();
  return String(v).trim();
}

function cellInt(cell: ExcelJS.Cell | undefined): number | null {
  return parseIntLoose(cellString(cell));
}

function cellDate(cell: ExcelJS.Cell | undefined): string | null {
  if (!cell) return null;
  const v = cell.value;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return parseDateString(cellString(cell));
}

function parseDateString(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // Generic JS Date fallback
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseIntLoose(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const cleaned = String(raw).replace(/[٬,٫\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function centerOf(raw: string | null | undefined): 'makkah' | 'madinah' | null {
  const s = (raw ?? '').toLowerCase().trim();
  if (!s) return null;
  if (s === 'makkah' || s.includes('مكة') || s.includes('مكه')) return 'makkah';
  if (s === 'madinah' || s === 'medina' || s.includes('مدين')) return 'madinah';
  return null;
}

// Minimal CSV split — handles double-quoted fields with embedded commas.
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"' && inQuotes) {
      cur += '"';
      i++;
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
