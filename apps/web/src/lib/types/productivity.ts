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
  snapshotDate: string;
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
  onTimeDeliveryRate: number;
  firstAcceptanceRate: number;
  agreementCompletionRate: number;
  excellenceRate: number;
  totalTaskCount: number;
  highPriorityConcentration: number;
  backlogDepth: number;
  pendingReviewAge: number;
  overdueCount: number;
  resubmitRate: number;
  blockerCount: number;
  claimReadiness: number;
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
  calculatedAt: string;
}
