import { redirect } from 'next/navigation';

/**
 * Backward compatibility: the old combined dashboard now lives under two
 * dedicated routes (/makkah, /madinah). Keep the old URL working by
 * redirecting to Makkah — the user can switch via the sidebar.
 */
export default function AttendanceAnalyticsRedirect() {
  redirect('/attendance-analytics/makkah');
}
