/**
 * Centralized chart theme — premium dark glassmorphism.
 * All Recharts components should import from here.
 */

// ─── Semantic Status Colors ─────────────────────────
export const STATUS_CHART_COLORS: Record<string, string> = {
  new: '#38BDF8',        // sky-400
  pending: '#A78BFA',    // violet-400
  in_progress: '#38BDF8',// sky-400
  under_review: '#FBBF24',// amber-400
  completed: '#34D399',  // emerald-400
  delayed: '#F87171',    // red-400
  cancelled: '#94A3B8',  // slate-400
  scheduled: '#22D3EE',  // cyan-400
};

export const PRIORITY_CHART_COLORS: Record<string, string> = {
  low: '#94A3B8',
  medium: '#38BDF8',
  high: '#FBBF24',
  critical: '#F87171',
};

// ─── Brand palette ──────────────────────────────────
export const CHART_PALETTE = [
  '#34D399', '#38BDF8', '#A78BFA', '#FBBF24',
  '#F87171', '#2DD4BF', '#A3E635', '#818CF8',
];

// ─── Tooltip ────────────────────────────────────────
export const chartTooltipStyle: React.CSSProperties = {
  backgroundColor: 'rgba(8, 15, 28, 0.94)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  borderRadius: '14px',
  color: '#F1F5F9',
  direction: 'rtl',
  padding: '10px 16px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
  backdropFilter: 'blur(16px)',
  fontSize: '12px',
  lineHeight: '1.7',
};

export const chartTooltipCursor = { fill: 'rgba(148, 163, 184, 0.06)' };
export const chartTooltipLineCursor = { stroke: 'rgba(148, 163, 184, 0.2)', strokeWidth: 1, strokeDasharray: '4 4' };

// ─── Axis ───────────────────────────────────────────
export const axisTickStyle = { fill: '#94A3B8', fontSize: 10, fontFamily: 'inherit' };
export const axisTickStyleSmall = { fill: '#64748B', fontSize: 9 };

// ─── Grid ───────────────────────────────────────────
export const gridStroke = 'rgba(148, 163, 184, 0.07)';
export const gridStrokeDash = '3 3';

// ─── Legend ─────────────────────────────────────────
export const legendStyle: React.CSSProperties = {
  color: '#CBD5E1',
  fontSize: 11,
  direction: 'rtl',
  paddingTop: '10px',
};

// ─── Pie / Donut ────────────────────────────────────
export const pieStroke = 'rgba(8, 15, 28, 0.7)';
export const pieStrokeWidth = 2;

// ─── Active dot (Line/Area charts) ──────────────────
export const activeDotStyle = (color: string) => ({
  r: 6,
  fill: color,
  stroke: 'rgba(255,255,255,0.85)',
  strokeWidth: 2.5,
  filter: `drop-shadow(0 0 6px ${color}66)`,
});

export const dotStyle = (color: string) => ({
  fill: color,
  r: 3,
  strokeWidth: 0,
});

// ─── Bar hover ──────────────────────────────────────
export const barFillOpacity = 0.88;

// ─── Gradients ──────────────────────────────────────
export const areaGradients = {
  blue: { id: 'themeAreaBlue', color: '#38BDF8' },
  green: { id: 'themeAreaGreen', color: '#34D399' },
  purple: { id: 'themeAreaPurple', color: '#A78BFA' },
};

// ─── Date formatter ─────────────────────────────────
export function formatChartDate(v: string): string {
  const parts = v.split('-');
  return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : v;
}
