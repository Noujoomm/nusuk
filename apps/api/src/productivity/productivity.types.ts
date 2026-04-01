// ─── Task Scoring Types ──────────────────────────────────────

export interface TaskForScoring {
  id: string;
  name: string;
  trackId: string;
  source: string;       // agreement | agent | additional (from schema taskSource)
  priority: string;     // low | medium | high | critical
  status: string;       // new | pending | in_progress | under_review | completed | delayed | cancelled | scheduled
  progressPercent: number;
  plannedStartDate: Date | null;
  plannedDeliveryDate: Date | null;
  actualDeliveryDate: Date | null;
  approvalStatus: string; // approved | approved_with_notes | pending | resubmit
  approvalDate: Date | null;
  pendingDays: number;
  resubmitCount: number;
  isBlocked: boolean;
  blockerReason: string | null;
}

export interface TaskScore {
  taskId: string;
  taskName: string;
  trackId: string;
  sourceWeight: number;
  priorityWeight: number;
  importanceScore: number;
  statusFactor: number;
  timelinessFactor: number;
  acceptanceFactor: number;
  excellenceBonus: number;
  executionQuality: number;
  score: number;
  maxScore: number;
  productivityPercent: number;
  timelinessDays: number | null;
  isExcluded: boolean;
  exclusionReason?: string;
  resubmitCount: number;
}

export interface AtRiskTask {
  taskId: string;
  taskName: string;
  importanceScore: number;
  daysUntilDeadline: number;
  currentProgress: number;
  riskLevel: 'HIGH' | 'CRITICAL';
}

export interface WeeklySnapshot {
  snapshotDate: Date;
  weekLabel: string;
  productivityPercent: number;
  velocityPoints: number;
  completedTaskCount: number;
}

export interface TrackProductivity {
  trackId: string;
  trackName: string;
  trackNameAr: string;
  productivityPercent: number;
  totalScore: number;
  maxPossibleScore: number;
  taskCount: number;
  excludedCount: number;
  trackWeightPercent: number;
  // Performance
  onTimeDeliveryRate: number;
  firstAcceptanceRate: number;
  agreementCompletionRate: number;
  excellenceRate: number;
  // Workload
  totalTaskCount: number;
  highPriorityConcentration: number;
  backlogDepth: number;
  pendingReviewAge: number;
  // Risks
  overdueCount: number;
  resubmitRate: number;
  blockerCount: number;
  claimReadiness: number;
  // Predictive
  velocityThisWeek: number;
  velocityLastWeek: number;
  velocityTrend: number;
  burnRateWeeksRemaining: number | null;
  atRiskTasks: AtRiskTask[];
  weeklySnapshots: WeeklySnapshot[];
  taskScores: TaskScore[];
}

export interface ProjectProductivity {
  overallProductivityPercent: number;
  trackProductivities: TrackProductivity[];
  projectWeeklySnapshots: WeeklySnapshot[];
  redFlagTracks: string[];
  greenFlagTracks: string[];
  totalAtRiskTasks: number;
  totalBlockedTasks: number;
  totalOverdueTasks: number;
  calculatedAt: Date;
}

// ─── Constants ───────────────────────────────────────────────

export const SOURCE_WEIGHTS: Record<string, number> = {
  agreement: 7,
  agent: 4,
  additional: 1,
};

export const PRIORITY_WEIGHTS: Record<string, number> = {
  critical: 5,
  high: 5,
  medium: 3,
  low: 1,
};

export const TIMELINESS_BRACKETS: Array<{ maxDaysLate: number; factor: number }> = [
  { maxDaysLate: -3, factor: 1.00 },
  { maxDaysLate: 0, factor: 0.95 },
  { maxDaysLate: 1, factor: 0.90 },
  { maxDaysLate: 2, factor: 0.85 },
  { maxDaysLate: 3, factor: 0.80 },
  { maxDaysLate: 7, factor: 0.70 },
  { maxDaysLate: 14, factor: 0.55 },
  { maxDaysLate: Infinity, factor: 0.40 },
];

export const ACCEPTANCE_FACTORS: Record<string, number> = {
  approved: 1.00,
  approved_with_notes: 0.85,
  resubmit: 0.95,
};

export const PENDING_GRACE_DAYS = 5;
export const PENDING_WITHIN_GRACE = 0.95;
export const PENDING_OVER_GRACE = 0.80;

export const EXCELLENCE_EARLY_DELIVERY = 0.05;
export const EXCELLENCE_ZERO_DEFECTS = 0.05;

export const AT_RISK_MIN_IMPORTANCE = 20;
export const AT_RISK_DAYS_WINDOW = 7;
export const AT_RISK_MAX_PROGRESS = 80;

export const RED_FLAG_THRESHOLD = 60;
export const GREEN_FLAG_THRESHOLD = 85;
export const TRACK_WEIGHT_FLOOR = 500_000;
