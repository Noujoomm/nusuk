import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Undo the classic multer/busboy mojibake where an Arabic UTF-8 filename was
 * decoded as Latin-1. Used for render-time and download-time display of
 * legacy rows whose DB values predate the server-side fix. Returns the
 * original string unchanged when it isn't mojibake.
 */
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export function fixArabicMojibake(name: string | null | undefined): string {
  if (!name) return '';
  if (ARABIC_RE.test(name)) return name;
  try {
    const bytes = new Uint8Array(
      Array.from(name, (c) => c.charCodeAt(0) & 0xff),
    );
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (ARABIC_RE.test(decoded)) return decoded;
  } catch {
    /* fall through */
  }
  return name;
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشط',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'مرتفع',
  critical: 'حرج',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  system_manager: 'المدير التنفيذي',
  pm: 'مدير المشروع',
  track_lead: 'قائد المسار',
  employee: 'موظف',
  hr: 'موارد بشرية',
};

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-300',
  active: 'bg-blue-500/20 text-blue-300',
  in_progress: 'bg-amber-500/20 text-amber-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  cancelled: 'bg-red-500/20 text-red-300',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-300',
  medium: 'bg-blue-500/20 text-blue-300',
  high: 'bg-amber-500/20 text-amber-300',
  critical: 'bg-red-500/20 text-red-300',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  under_review: 'تحت المراجعة',
  completed: 'مكتملة',
  delayed: 'متأخرة',
  cancelled: 'ملغاة',
  scheduled: 'مجدولة',
};

export const TASK_STATUS_COLORS: Record<string, string> = {
  new: 'bg-violet-500/20 text-violet-300',
  pending: 'bg-gray-500/20 text-gray-300',
  in_progress: 'bg-blue-500/20 text-blue-300',
  under_review: 'bg-orange-500/20 text-orange-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  delayed: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-zinc-500/20 text-zinc-400',
  scheduled: 'bg-cyan-500/20 text-cyan-300',
};

export const ASSIGNEE_TYPE_LABELS: Record<string, string> = {
  TRACK: 'مسار',
  USER: 'موظف',
  HR: 'الموارد البشرية',
  GLOBAL: 'عام',
};

export const ASSIGNEE_TYPE_COLORS: Record<string, string> = {
  TRACK: 'bg-indigo-500/20 text-indigo-300',
  USER: 'bg-cyan-500/20 text-cyan-300',
  HR: 'bg-purple-500/20 text-purple-300',
  GLOBAL: 'bg-teal-500/20 text-teal-300',
};

export const AI_REPORT_TYPE_LABELS: Record<string, string> = {
  daily: 'تقرير يومي',
  weekly: 'تقرير أسبوعي',
  monthly: 'تقرير شهري',
  executive: 'تقرير تنفيذي',
  track_performance: 'أداء المسار',
  kpi_analysis: 'تحليل المؤشرات',
};

export const SCOPE_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  delayed: 'متأخر',
};

export const SCOPE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-300',
  in_progress: 'bg-amber-500/20 text-amber-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  delayed: 'bg-red-500/20 text-red-300',
};

export const IMPACT_TYPE_LABELS: Record<string, string> = {
  high: 'تأثير عالي',
  medium: 'تأثير متوسط',
  low: 'تأثير منخفض',
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  full_time: 'دوام كامل',
  part_time: 'دوام جزئي',
  contract: 'عقد',
  freelance: 'مستقل',
  secondment: 'إعارة',
};

export const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  approved: 'معتمد',
  completed: 'مكتمل',
  needs_revision: 'يحتاج مراجعة',
};

export const CHECKLIST_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  completed: 'bg-blue-500/20 text-blue-300',
  needs_revision: 'bg-amber-500/20 text-amber-300',
};

/** Convert any Arabic/Persian numerals to English */
export function toEnglishDigits(str: string): string {
  return str
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatPercent(n: number) {
  return `${Math.round(n)}%`;
}

/** Safe division — returns 0 on divide-by-zero or invalid inputs */
export function safeDivide(a: number, b: number, multiplier = 100): number {
  if (!b || !isFinite(a) || !isFinite(b)) return 0;
  return Math.round((a / b) * multiplier * 10) / 10;
}
