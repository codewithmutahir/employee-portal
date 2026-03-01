/**
 * Shared date helpers for attendance and other services.
 * Single source of truth for date key and normalization logic.
 */

import { getTodayDateString } from '@/lib/utils';

/** Use provided date (employee's local YYYY-MM-DD) or server's today. Fixes timezone issues. */
export function getDateKey(dateOverride?: string): string {
  if (dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride.trim())) return dateOverride.trim();
  return getTodayDateString();
}

/** Get yesterday's date string (YYYY-MM-DD) from a given date string. Supports overnight shifts. */
export function getYesterdayDateString(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize to YYYY-MM-DD. Pass-through if already valid to avoid timezone shifting. */
export function normalizeDateString(date: string): string {
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
