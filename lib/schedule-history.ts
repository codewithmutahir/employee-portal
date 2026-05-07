/**
 * Schedule history helpers.
 *
 * A schedule change applies from its effective-from date forward. Past
 * attendance, late-in determination, and salary-per-day calculations must
 * keep using whatever schedule was active at that point in time, even after
 * the employee's "current" schedule is updated.
 *
 * Each entry in `employees/{id}/scheduleHistory` covers the half-open range
 * [effectiveFrom, effectiveTo). When `effectiveTo` is null/undefined the
 * entry is the active one. The latest entry should always mirror the
 * employee document's `scheduleStart`/`scheduleEnd`/`dayOff`.
 */

export interface ScheduleHistoryEntry {
  id?: string;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  dayOff?: string | null;
  /** YYYY-MM-DD (inclusive). */
  effectiveFrom: string;
  /** YYYY-MM-DD (exclusive); null/undefined means still active. */
  effectiveTo?: string | null;
  createdAt?: string;
  createdBy?: string;
}

export interface ResolvedSchedule {
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  dayOff?: string | null;
}

function toYmd(value: string | Date): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    return formatYmd(d);
  }
  if (value instanceof Date && !isNaN(value.getTime())) return formatYmd(value);
  return null;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Sort by effectiveFrom ascending; entries with the same effectiveFrom keep input order. */
export function sortScheduleHistory(history: ScheduleHistoryEntry[]): ScheduleHistoryEntry[] {
  return [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/**
 * Resolve the schedule that was active on `date` for an employee.
 *
 * Falls back to `current` (the live values on the employee doc) if the
 * date precedes any history entry or if no history exists at all.
 */
export function resolveScheduleForDate(
  history: ScheduleHistoryEntry[] | null | undefined,
  date: string | Date,
  current: ResolvedSchedule
): ResolvedSchedule {
  const target = toYmd(date);
  if (!target) return current;
  if (!history || history.length === 0) return current;

  const sorted = sortScheduleHistory(history);
  let chosen: ScheduleHistoryEntry | undefined;
  for (const entry of sorted) {
    if (entry.effectiveFrom > target) break;
    const to = entry.effectiveTo;
    if (!to || target < to) {
      chosen = entry;
    }
  }

  if (!chosen) {
    // Date is before the earliest history entry – treat the earliest entry's
    // values as the historical default to avoid contaminating the past with
    // the current live schedule.
    const earliest = sorted[0];
    if (earliest) return pickFields(earliest);
    return current;
  }

  return pickFields(chosen);
}

/**
 * Resolve the schedule active on the first day of a calendar month. Used
 * for month-level salary-per-day calculations where the dominant schedule
 * over the month is needed.
 */
export function resolveScheduleForMonth(
  history: ScheduleHistoryEntry[] | null | undefined,
  year: number,
  monthIndex: number,
  current: ResolvedSchedule
): ResolvedSchedule {
  const firstOfMonth = new Date(year, monthIndex, 1);
  return resolveScheduleForDate(history, firstOfMonth, current);
}

function pickFields(entry: ScheduleHistoryEntry): ResolvedSchedule {
  return {
    scheduleStart: entry.scheduleStart ?? null,
    scheduleEnd: entry.scheduleEnd ?? null,
    dayOff: entry.dayOff ?? null,
  };
}

export function schedulesEqual(a: ResolvedSchedule, b: ResolvedSchedule): boolean {
  return (
    norm(a.scheduleStart) === norm(b.scheduleStart) &&
    norm(a.scheduleEnd) === norm(b.scheduleEnd) &&
    norm(a.dayOff) === norm(b.dayOff)
  );
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim();
}
