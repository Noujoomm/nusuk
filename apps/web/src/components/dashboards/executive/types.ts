export interface TimelinePoint { date: string; count: number }
export interface ChartItem { name: string; color: string; value: number }
export interface Insight { type: 'success' | 'warning' | 'info'; icon: string; title_ar: string; description_ar: string }

export interface TrackPerf {
  id: string; name_ar: string; color: string;
  total_tasks: number; completed_tasks: number; overdue_tasks: number;
  recent_updates: number; employee_count: number; task_completion_rate: number; reports_count: number;
}

export interface ActivityItem {
  id: string; type: 'task_update' | 'report' | 'file';
  user_name: string; description: string; context: string; created_at: string;
}

export interface Analytics {
  reports: {
    total_reports: number; total_ai_reports: number; completed_ai_reports: number;
    pending_ai_reports: number; failed_ai_reports: number;
    reports_by_track: ChartItem[]; reports_by_type: { name: string; value: number }[];
    reports_timeline: TimelinePoint[];
  };
  achievements: {
    total_achievements: number; total_deliverables: number;
    completed_deliverables: number; pending_deliverables: number;
    deliverables_by_track: ChartItem[]; achievements_by_track: ChartItem[];
    top_contributors: { name: string; completed_tasks: number }[];
  };
  performance: {
    task_completion_rate: number; avg_completion_days: number;
    active_users: number; total_users: number; engagement_rate: number; daily_reports_rate: number;
    overdue_tasks: number; total_tasks: number; completed_tasks: number;
    tasks_by_status: Record<string, number>; tasks_by_priority: Record<string, number>;
    tasks_completed_by_track: ChartItem[]; updates_timeline: TimelinePoint[];
  };
  insights: Insight[];
  track_performance: TrackPerf[];
  summary: { total_daily_updates: number; total_files: number };
  activity_feed: ActivityItem[];
}
