/**
 * Centralized chart theme — dark glassmorphism.
 * All Recharts components import from here for consistency.
 */

// ─── Semantic Status Colors ─────────────────────────
export const STATUS_CHART_COLORS: Record<string, string> = {
  new: '#38BDF8',
  pending: '#A78BFA',
  in_progress: '#38BDF8',
  under_review: '#FBBF24',
  completed: '#34D399',
  delayed: '#F87171',
  cancelled: '#94A3B8',
  scheduled: '#22D3EE',
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

// ─── Tooltip (all text white, dark glass background) ─
export const chartTooltipStyle: React.CSSProperties = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  color: '#ffffff',
  direction: 'rtl',
  padding: '10px 14px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(10px)',
  fontSize: '12px',
  lineHeight: '1.7',
};

export const chartTooltipLabelStyle: React.CSSProperties = {
  color: '#ffffff',
  fontWeight: 'bold',
  fontSize: '12px',
};

export const chartTooltipItemStyle: React.CSSProperties = {
  color: '#e5e7eb',
  fontSize: '12px',
};

export const chartTooltipCursor = { fill: 'rgba(148, 163, 184, 0.06)' };
export const chartTooltipLineCursor = { stroke: 'rgba(148, 163, 184, 0.2)', strokeWidth: 1, strokeDasharray: '4 4' };

// ─── Axis (white/light gray text, visible strokes) ──
export const axisStroke = '#e5e7eb';
export const axisTickStyle = { fill: '#e5e7eb', fontSize: 10, fontFamily: 'inherit' };
export const axisTickStyleSmall = { fill: '#e5e7eb', fontSize: 9 };

// ─── Grid ───────────────────────────────────────────
export const gridStroke = 'rgba(255, 255, 255, 0.08)';
export const gridStrokeDash = '3 3';

// ─── Legend (white text) ────────────────────────────
export const legendStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: 11,
  direction: 'rtl',
  paddingTop: '10px',
};

// ─── Pie / Donut ────────────────────────────────────
export const pieStroke = 'rgba(15, 23, 42, 0.7)';
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

// ─── Bar ────────────────────────────────────────────
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
