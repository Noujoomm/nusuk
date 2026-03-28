/**
 * Centralized chart theme for all Recharts visualizations.
 * Matches the platform's dark glassmorphism design.
 */

// ─── Status Colors (consistent across all charts) ───
export const STATUS_CHART_COLORS: Record<string, string> = {
  new: '#1DA1F2',
  pending: '#8B5CF6',
  in_progress: '#0EA5E9',
  under_review: '#F59E0B',
  completed: '#22C58B',
  delayed: '#EF4444',
  cancelled: '#64748B',
  scheduled: '#06B6D4',
};

export const PRIORITY_CHART_COLORS: Record<string, string> = {
  low: '#64748B',
  medium: '#0EA5E9',
  high: '#F59E0B',
  critical: '#EF4444',
};

// ─── Brand palette for multi-series charts ───
export const CHART_PALETTE = [
  '#22C58B', '#1DA1F2', '#8B5CF6', '#F59E0B',
  '#F43F5E', '#14B8A6', '#84CC16', '#6366f1',
];

// ─── Tooltip ───
export const chartTooltipStyle: React.CSSProperties = {
  backgroundColor: 'rgba(10, 18, 32, 0.92)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '16px',
  color: '#F8FAFC',
  direction: 'rtl',
  padding: '10px 14px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
  backdropFilter: 'blur(12px)',
  fontSize: '12px',
  lineHeight: '1.6',
};

// ─── Axis tick styles ───
export const axisTickStyle = { fill: '#94A3B8', fontSize: 10 };
export const axisTickStyleSmall = { fill: '#64748B', fontSize: 9 };

// ─── Grid ───
export const gridStroke = 'rgba(148, 163, 184, 0.06)';

// ─── Legend ───
export const legendStyle: React.CSSProperties = {
  color: '#CBD5E1',
  fontSize: 11,
  direction: 'rtl',
  paddingTop: '8px',
};

// ─── Gradients (for AreaCharts) ───
export const areaGradients = {
  blue: { id: 'areaBlue', color: '#1DA1F2' },
  green: { id: 'areaGreen', color: '#22C58B' },
  purple: { id: 'areaPurple', color: '#8B5CF6' },
};

// ─── Interaction ───
export const hoverOpacity = 0.92;
export const activeStroke = 'rgba(255,255,255,0.7)';
export const activeStrokeWidth = 2;

// ─── Date formatter ───
export function formatChartDate(v: string): string {
  const parts = v.split('-');
  return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : v;
}
