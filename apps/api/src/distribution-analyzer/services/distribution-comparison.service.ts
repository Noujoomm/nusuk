import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type {
  CenterCode,
  ComparisonResult,
  ExtractedDistributionData,
  ExtractedDistributionRow,
  PlatformDistributionData,
  PlatformDistributionRow,
  RowComparison,
  Severity,
} from '../interfaces/analyzer.types';

/**
 * Pure-ish comparison engine — fetches the platform window and diffs it
 * against the extracted rows field-by-field. Match key is `(date + center)`
 * because a single calendar day commonly has both a مكة and a مدينة batch
 * that mustn't collide.
 *
 * Severity bands match the spec: 20%+ critical, 10–20 high, 5–10 medium,
 * <5 low. A row found in only one side is HIGH (platform missing) or
 * MEDIUM (upload missing) — the latter is softer because the upload may
 * be a partial export.
 */
@Injectable()
export class DistributionComparisonService {
  private readonly logger = new Logger(DistributionComparisonService.name);

  // Field map: schema name → Arabic label shown in the UI.
  private readonly NUMERIC_FIELDS = [
    { key: 'companies', label: 'الشركات' },
    { key: 'parcels', label: 'الطرود' },
    { key: 'totalCards', label: 'البطاقات' },
    { key: 'cardsPerHour', label: 'البطاقات/ساعة' },
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  async loadPlatformWindow(
    extracted: ExtractedDistributionData,
    options: { dateFrom?: Date | null; dateTo?: Date | null; center?: 'makkah' | 'madinah' | 'all' | null },
  ): Promise<PlatformDistributionData> {
    // Derive the comparison window from the extracted data when the user
    // didn't pass an explicit range — keeps the diff tight by default.
    const dates = extracted.rows.map((r) => r.gregorianDate).filter(Boolean);
    const min = options.dateFrom ?? (dates.length ? new Date(dates.reduce((a, b) => (a < b ? a : b))) : null);
    const max = options.dateTo ?? (dates.length ? new Date(dates.reduce((a, b) => (a > b ? a : b))) : null);

    const where: any = {};
    if (min) where.gregorianDate = { gte: min };
    if (max) where.gregorianDate = { ...(where.gregorianDate ?? {}), lte: max };
    if (options.center && options.center !== 'all') {
      where.distributionCenter = options.center;
    }

    const records = await this.prisma.distributionAchievement.findMany({
      where,
      orderBy: { gregorianDate: 'asc' },
    });

    const rows: PlatformDistributionRow[] = records.map((r) => ({
      gregorianDate: r.gregorianDate.toISOString().slice(0, 10),
      hijriDate: r.hijriDate ?? null,
      center: ((r.distributionCenter as CenterCode) ?? 'shared') as CenterCode,
      companies: r.companies,
      parcels: r.parcels,
      batch: r.batch || null,
      totalCards: r.totalCards,
      cardsPerHour: r.cardsPerHour,
    }));

    return {
      rows,
      totals: {
        companies: rows.reduce((s, r) => s + r.companies, 0),
        parcels: rows.reduce((s, r) => s + r.parcels, 0),
        totalCards: rows.reduce((s, r) => s + r.totalCards, 0),
        batches: new Set(rows.map((r) => r.batch).filter(Boolean)).size,
      },
    };
  }

  compare(extracted: ExtractedDistributionData, platform: PlatformDistributionData): ComparisonResult {
    const platformMap = new Map<string, PlatformDistributionRow>();
    for (const r of platform.rows) platformMap.set(this.key(r.gregorianDate, r.center), r);

    const extractedKeys = new Set<string>();
    const rowComparisons: RowComparison[] = [];

    let totalFields = 0;
    let mismatchedFields = 0;
    const matchedDates = new Set<string>();

    for (const ex of extracted.rows) {
      if (!ex.gregorianDate) continue;
      const exCenter = ex.center ?? 'shared';
      const k = this.key(ex.gregorianDate, exCenter);
      extractedKeys.add(k);

      const pf = platformMap.get(k);
      if (!pf) {
        rowComparisons.push({
          rowIdentifier: k,
          gregorianDate: ex.gregorianDate,
          center: exCenter as CenterCode,
          extractedValue: this.summarise(ex),
          platformValue: null,
          difference: null,
          percentDifference: null,
          severity: 'HIGH',
          type: 'MISSING_IN_PLATFORM',
        });
        continue;
      }

      let dateMatched = true;
      for (const f of this.NUMERIC_FIELDS) {
        const exVal = (ex as any)[f.key] as number | null | undefined;
        const pfVal = (pf as any)[f.key] as number | null | undefined;
        if (exVal == null && pfVal == null) continue;
        totalFields += 1;

        if (exVal == null || pfVal == null || exVal === pfVal) {
          if (exVal !== pfVal) {
            mismatchedFields += 1;
            dateMatched = false;
            rowComparisons.push({
              rowIdentifier: k,
              gregorianDate: ex.gregorianDate,
              center: exCenter as CenterCode,
              fieldName: f.key,
              fieldLabel: f.label,
              extractedValue: exVal ?? null,
              platformValue: pfVal ?? null,
              difference: null,
              percentDifference: null,
              severity: 'MEDIUM',
              type: 'VALUE_MISMATCH',
            });
          }
          continue;
        }
        const diff = Math.abs(exVal - pfVal);
        const denom = Math.max(Math.abs(pfVal), 1);
        const pct = (diff / denom) * 100;
        const severity = this.severityFor(pct);
        mismatchedFields += 1;
        dateMatched = false;
        rowComparisons.push({
          rowIdentifier: k,
          gregorianDate: ex.gregorianDate,
          center: exCenter as CenterCode,
          fieldName: f.key,
          fieldLabel: f.label,
          extractedValue: exVal,
          platformValue: pfVal,
          difference: exVal - pfVal,
          percentDifference: +pct.toFixed(2),
          severity,
          type: 'VALUE_MISMATCH',
        });
      }
      if (dateMatched) matchedDates.add(k);
    }

    // Rows the platform has but the upload doesn't.
    for (const pf of platform.rows) {
      const k = this.key(pf.gregorianDate, pf.center);
      if (extractedKeys.has(k)) continue;
      rowComparisons.push({
        rowIdentifier: k,
        gregorianDate: pf.gregorianDate,
        center: pf.center,
        extractedValue: null,
        platformValue: this.summarise(pf as any),
        difference: null,
        percentDifference: null,
        severity: 'MEDIUM',
        type: 'MISSING_IN_UPLOAD',
      });
    }

    const totalRows = extracted.rows.length;
    const mismatchedRows = totalRows - matchedDates.size;
    const matchPercentage =
      totalFields === 0 ? 0 : +(((totalFields - mismatchedFields) / totalFields) * 100).toFixed(2);

    this.logger.log(
      `Comparison: extracted=${totalRows} platform=${platform.rows.length} matchPct=${matchPercentage} mismatches=${mismatchedFields}/${totalFields}`,
    );

    return {
      matchPercentage,
      totalRows,
      matchedRows: matchedDates.size,
      mismatchedRows,
      rowComparisons,
      totals: {
        extracted: extracted.totals ?? this.totalsOf(extracted.rows),
        platform: platform.totals,
      },
    };
  }

  // ─── helpers ───────────────────────────────────────────────────────────

  private key(date: string, center: string): string {
    return `${date}_${center}`;
  }

  private severityFor(pct: number): Severity {
    if (pct >= 20) return 'CRITICAL';
    if (pct >= 10) return 'HIGH';
    if (pct >= 5) return 'MEDIUM';
    return 'LOW';
  }

  private summarise(r: ExtractedDistributionRow | PlatformDistributionRow): string {
    const c = r.totalCards != null ? `${r.totalCards}` : '-';
    const p = r.parcels != null ? `${r.parcels}` : '-';
    const co = r.companies != null ? `${r.companies}` : '-';
    return `بطاقات=${c} طرود=${p} شركات=${co}`;
  }

  private totalsOf(rows: ExtractedDistributionRow[]): NonNullable<ExtractedDistributionData['totals']> {
    return {
      companies: rows.reduce((s, r) => s + (r.companies ?? 0), 0),
      parcels: rows.reduce((s, r) => s + (r.parcels ?? 0), 0),
      totalCards: rows.reduce((s, r) => s + (r.totalCards ?? 0), 0),
      batches: new Set(rows.map((r) => r.batch).filter(Boolean)).size,
    };
  }
}
