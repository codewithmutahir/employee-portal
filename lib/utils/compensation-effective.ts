/**
 * Compensation history helpers — resolve the salary that was effective on a
 * given calendar date by replaying `CompensationHistoryEvent` records.
 *
 * Used by export/CSV/report code (per-day accurate wage rate) and by the
 * employee dashboard (salary-history card).
 *
 * Calendar-day comparisons (not timestamps) intentionally:
 * - Admin date pickers submit "YYYY-MM-DD"; `new Date("YYYY-MM-DD")` parses
 *   that as UTC midnight, which is *not* the same calendar day in non-UTC
 *   zones (e.g. in Asia/Karachi `2026-05-15` becomes 05:00 local on May 15).
 * - Attendance records also store "YYYY-MM-DD" but are reconstructed as a
 *   local Date.
 *
 * Comparing those as timestamps would incorrectly exclude records on the
 * exact effective date (the record at local midnight ends up "before" the
 * event at local 05:00). Comparing as YYYY-MM-DD strings sidesteps that
 * entirely.
 *
 * Rules:
 * - An event applies on `date` when its calendar effective day <= `date`'s
 *   calendar day and `newSalary` is set.
 * - The most recent applicable event wins.
 * - `status` is intentionally ignored. Even a `superseded` event is the
 *   correct historical answer for the window it covered.
 * - If no event applies, fall back to the earliest event's `previousSalary`
 *   so retroactive entries produce sensible numbers for older months.
 * - If history is empty, return the caller-provided `fallbackSalary`.
 */
import type { CompensationHistoryEvent } from '@/types';

/** YYYY-MM-DD calendar day for a `Date`, using local-time components. */
function dateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * YYYY-MM-DD for an event's `effectiveDate`. Strings stored as `YYYY-MM-DD`
 * or full ISO timestamps both round to the right calendar day via the UTC
 * prefix (admin date pickers always submit at UTC midnight).
 */
function eventYmd(iso: string): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Returns the monthly salary that was effective on `date`. */
export function salaryEffectiveOn(
  history: CompensationHistoryEvent[] | null | undefined,
  fallbackSalary: number,
  date: Date
): number {
  if (!history || history.length === 0) return fallbackSalary;
  if (Number.isNaN(date.getTime())) return fallbackSalary;

  const dateKey = dateYmd(date);

  let bestSalary: number | null = null;
  let bestKey = '';

  for (const evt of history) {
    if (evt.newSalary === null || evt.newSalary === undefined) continue;
    const evtKey = eventYmd(evt.effectiveDate);
    if (!evtKey) continue;
    if (evtKey > dateKey) continue;
    if (evtKey > bestKey) {
      bestKey = evtKey;
      bestSalary = evt.newSalary;
    }
  }

  if (bestSalary !== null) return bestSalary;

  const earliest = [...history]
    .filter((e) => e.previousSalary !== null && e.previousSalary !== undefined)
    .sort((a, b) => {
      const aKey = eventYmd(a.effectiveDate) ?? '';
      const bKey = eventYmd(b.effectiveDate) ?? '';
      return aKey.localeCompare(bKey);
    })[0];
  if (earliest && earliest.previousSalary !== null) {
    return earliest.previousSalary;
  }

  return fallbackSalary;
}

/** True if any salary change has an effective calendar day strictly inside (start, end]. */
export function salaryChangedInRange(
  history: CompensationHistoryEvent[] | null | undefined,
  start: Date,
  end: Date
): boolean {
  if (!history || history.length === 0) return false;
  const startKey = dateYmd(start);
  const endKey = dateYmd(end);
  return history.some((e) => {
    if (e.newSalary === null || e.newSalary === undefined) return false;
    const k = eventYmd(e.effectiveDate);
    if (!k) return false;
    return k > startKey && k <= endKey;
  });
}

/**
 * Computes the prorated full-month earning when salary changed mid-month.
 * Sums each working day's effective per-day rate (effective_salary / wd).
 *
 * For an unchanged month this equals `effectiveSalary` exactly (the existing
 * formula). For a month with a salary change it returns the day-weighted
 * full-month salary — i.e., what the employee would earn for that month if
 * they attended every working day at their then-current rate.
 */
const PRORATE_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function proratedMonthlySalary(
  history: CompensationHistoryEvent[] | null | undefined,
  fallbackSalary: number,
  year: number,
  monthIndex: number,
  dayOff: string | null | undefined,
  workingDays: number
): number {
  if (workingDays <= 0) return 0;
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  const dayOffLc = (dayOff || '').toLowerCase();
  let total = 0;
  for (let day = 1; day <= dim; day++) {
    const d = new Date(year, monthIndex, day);
    if (PRORATE_WEEKDAY_NAMES[d.getDay()].toLowerCase() === dayOffLc) continue;
    const sal = salaryEffectiveOn(history, fallbackSalary, d);
    total += sal / workingDays;
  }
  return total;
}
