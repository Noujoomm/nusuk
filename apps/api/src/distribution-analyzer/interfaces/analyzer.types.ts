/**
 * Shared types for the Distribution Smart Analyzer.
 *
 * All field names mirror `DistributionAchievement` (the comparison target):
 *   gregorianDate, hijriDate, companies, parcels, batch, totalCards,
 *   cardsPerHour, distributionCenter.
 *
 * `center` is normalised to 'makkah' | 'madinah' | 'shared' regardless of
 * what the source called it (مكة / Makkah / makkah …) so downstream
 * matching against `DistributionAchievement.distributionCenter` is exact.
 */

export type CenterCode = 'makkah' | 'madinah' | 'shared';

export interface ExtractedDistributionRow {
  gregorianDate: string; // ISO YYYY-MM-DD
  hijriDate?: string | null;
  batch?: string | null;
  companies?: number | null;
  parcels?: number | null;
  totalCards?: number | null;
  cardsPerHour?: number | null;
  duration?: number | null;
  specialists?: number | null;
  center: CenterCode | null;
  notes?: string | null;
}

export interface ExtractedDistributionTotals {
  companies?: number | null;
  parcels?: number | null;
  totalCards?: number | null;
  batches?: number | null;
}

export interface ExtractedDistributionData {
  rows: ExtractedDistributionRow[];
  totals?: ExtractedDistributionTotals;
  uncertainData?: Array<{ row: number; field: string; reason: string }>;
  confidence?: number; // 0..1, only meaningful for vision extraction
  source: 'EXCEL' | 'CSV' | 'IMAGE' | 'PDF';
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface PlatformDistributionRow {
  gregorianDate: string;
  hijriDate: string | null;
  center: CenterCode;
  companies: number;
  parcels: number;
  batch: string | null;
  totalCards: number;
  cardsPerHour: number;
}

export interface PlatformDistributionData {
  rows: PlatformDistributionRow[];
  totals: {
    companies: number;
    parcels: number;
    totalCards: number;
    batches: number;
  };
}

export type DiscrepancyType = 'VALUE_MISMATCH' | 'MISSING_IN_PLATFORM' | 'MISSING_IN_UPLOAD';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface RowComparison {
  rowIdentifier: string; // `${gregorianDate}_${center}` for VALUE_MISMATCH; date alone for MISSING_*
  gregorianDate: string;
  center: CenterCode | null;
  fieldName?: string;
  fieldLabel?: string; // Arabic label for the UI
  extractedValue: string | number | null;
  platformValue: string | number | null;
  difference: number | null;
  percentDifference: number | null;
  severity: Severity;
  type: DiscrepancyType;
}

export interface ComparisonResult {
  matchPercentage: number;
  totalRows: number;
  matchedRows: number;
  mismatchedRows: number;
  rowComparisons: RowComparison[];
  totals: {
    extracted: ExtractedDistributionTotals;
    platform: ExtractedDistributionTotals;
  };
}
