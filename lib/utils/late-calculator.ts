/**
 * Single source of truth for lateness rules (portal + exports).
 *
 * Universal rule (all shifts — morning, afternoon, overnight, etc.):
 * - Use the employee’s scheduled shift **start** (HH:mm wall clock) for that day.
 * - Clock-in **at or before** start → On Time.
 * - Clock-in **more than** {@link DEFAULT_ATTENDANCE_GRACE_MINUTES} minutes after start → Late In.
 * - Shift end time is not used for lateness.
 *
 * When no schedule is set, optional history inference applies the same grace window.
 */

import type { AttendanceStatus } from '@/types';
import { clockInToMinutesInTimeZone, resolvePortalTimeZone } from '@/lib/portal-timezone';

export type LateCategory = 'On Time' | 'Late' | 'Absent' | 'No Schedule';

export type ExportAttendanceStatusLabel =
  | 'On Time'
  | 'Late'
  | 'Absent'
  | 'No Schedule'
  | 'Half Day';

export interface CalculateLateStatusParams {
  scheduledStart: string | null;
  actualClockIn: string | null;
  recordDate: string;
  graceMinutes?: number;
  /** IANA timezone for wall-clock comparison (e.g. Asia/Karachi). */
  timeZone?: string;
  /** When true, this calendar day is the employee’s weekly day off (no scheduled shift). */
  isScheduledDayOff?: boolean;
}

const MINUTES_PER_DAY = 1440;
export const DEFAULT_ATTENDANCE_GRACE_MINUTES = 15;
const MIN_CLOCK_INS_FOR_INFERENCE = 2;
const EVENING_START_MINUTES = 18 * 60;
const MORNING_END_MINUTES = 8 * 60;

/** @param timeZone IANA zone; defaults via {@link resolvePortalTimeZone}. */
export function clockInToMinutes(clockIn: string, timeZone?: string): number {
  return clockInToMinutesInTimeZone(clockIn, resolvePortalTimeZone(timeZone));
}

function circularMinutesDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, MINUTES_PER_DAY - d);
}

function forwardMinutesOnCircle(start: number, end: number): number {
  if (end >= start) return end - start;
  return MINUTES_PER_DAY - start + end;
}

function expandMinutesForOvernightClustering(minutes: number[]): number[] {
  if (minutes.length === 0) return minutes;
  const hasEvening = minutes.some((m) => m >= 18 * 60);
  const hasEarlyMorning = minutes.some((m) => m < 6 * 60);
  if (!hasEvening || !hasEarlyMorning) return minutes;
  return minutes.map((m) => (m < 12 * 60 ? m + MINUTES_PER_DAY : m));
}

function clusterClockInTimes(minutes: number[], maxGapMinutes: number = 240): number[][] {
  if (minutes.length === 0) return [];
  const expanded = expandMinutesForOvernightClustering(minutes);
  const sorted = [...expanded].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap <= maxGapMinutes) {
      current.push(sorted[i]!);
    } else {
      clusters.push(current);
      current = [sorted[i]!];
    }
  }
  clusters.push(current);
  return clusters;
}

function medianTimeOfDayFromExpandedCluster(cluster: number[]): number {
  if (cluster.length === 0) return 0;
  const sorted = [...cluster].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  let m = raw;
  while (m >= MINUTES_PER_DAY) m -= MINUTES_PER_DAY;
  return Math.round(m);
}

/** Parse HH:mm schedule start to minutes since midnight (0–1439). */
export function scheduleStartToMinutes(scheduledStart: string): number {
  const parts = scheduledStart.trim().split(':');
  const hStr = parts[0] ?? '0';
  const mStr = parts[1] ?? '0';
  return parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
}

/**
 * Minutes clock-in is after scheduled start (0 if early or on time).
 * Same wall-clock day comparison — applies to every shift type.
 */
export function minutesAfterScheduledStart(
  scheduledStart: string,
  clockIn: string,
  timeZone?: string
): number {
  const scheduleMinutes = scheduleStartToMinutes(scheduledStart);
  const clockInMinutes = clockInToMinutes(clockIn, timeZone);
  if (clockInMinutes <= scheduleMinutes) return 0;
  return clockInMinutes - scheduleMinutes;
}

/**
 * Core rules (schedule + clock-in). Caller supplies `isScheduledDayOff` and resolved `scheduledStart`.
 */
export function calculateLateStatus(params: CalculateLateStatusParams): {
  isLate: boolean;
  lateMinutes: number | null;
  lateCategory: LateCategory;
} {
  const grace = params.graceMinutes ?? DEFAULT_ATTENDANCE_GRACE_MINUTES;
  const tz = resolvePortalTimeZone(params.timeZone);
  const { scheduledStart, actualClockIn, isScheduledDayOff } = params;

  if (isScheduledDayOff) {
    return { isLate: false, lateMinutes: null, lateCategory: 'No Schedule' };
  }

  if (!scheduledStart) {
    return { isLate: false, lateMinutes: null, lateCategory: 'No Schedule' };
  }

  if (!actualClockIn) {
    return { isLate: false, lateMinutes: null, lateCategory: 'Absent' };
  }

  const minutesAfterStart = minutesAfterScheduledStart(scheduledStart, actualClockIn, tz);
  if (minutesAfterStart > grace) {
    return { isLate: true, lateMinutes: minutesAfterStart, lateCategory: 'Late' };
  }
  return { isLate: false, lateMinutes: 0, lateCategory: 'On Time' };
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function isCalendarDayOff(dateYmd: string, dayOff: string | null | undefined): boolean {
  if (!dayOff) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd.trim())) return false;
  const [y, m, d] = dateYmd.split('-').map(Number);
  const dt = new Date(y!, (m || 1) - 1, d || 1);
  if (isNaN(dt.getTime())) return false;
  const idx = WEEKDAY_NAMES.findIndex((name) => name.toLowerCase() === dayOff.toLowerCase());
  if (idx < 0) return false;
  return dt.getDay() === idx;
}

export interface ComputeAttendanceAnalysisParams {
  date: string;
  clockIn: string | undefined | null;
  totalHours: number | undefined | null;
  scheduleStart: string | null | undefined;
  dayOff: string | null | undefined;
  allClockInMinutes: number[];
  graceMinutes?: number;
  timeZone?: string;
}

export interface AttendanceAnalysis {
  status: AttendanceStatus;
  exportStatus: ExportAttendanceStatusLabel;
  isLate: boolean;
  lateMinutes: number | null;
  lateCategory: LateCategory;
  scheduledStartDisplay: string | null;
}

/**
 * Full portal/export analysis: day-off, half-day, schedule, then history inference.
 */
export function computeAttendanceAnalysis(p: ComputeAttendanceAnalysisParams): AttendanceAnalysis {
  const grace = p.graceMinutes ?? DEFAULT_ATTENDANCE_GRACE_MINUTES;
  const tz = resolvePortalTimeZone(p.timeZone);
  const onDayOff = isCalendarDayOff(p.date, p.dayOff);
  const scheduledStart = p.scheduleStart?.trim() || null;

  if (!p.clockIn) {
    if (onDayOff) {
      return {
        status: 'Absent',
        exportStatus: 'No Schedule',
        isLate: false,
        lateMinutes: null,
        lateCategory: 'No Schedule',
        scheduledStartDisplay: scheduledStart,
      };
    }
    return {
      status: 'Absent',
      exportStatus: 'Absent',
      isLate: false,
      lateMinutes: null,
      lateCategory: 'Absent',
      scheduledStartDisplay: scheduledStart,
    };
  }

  const clockIn = p.clockIn;

  if (p.totalHours !== undefined && p.totalHours !== null && p.totalHours < 4) {
    const base = computeLateCore(
      onDayOff,
      scheduledStart,
      clockIn,
      p.allClockInMinutes,
      grace,
      tz
    );
    return {
      status: 'Half Day',
      exportStatus: 'Half Day',
      isLate: base.isLate,
      lateMinutes: base.lateMinutes,
      lateCategory: base.lateCategory,
      scheduledStartDisplay: scheduledStart,
    };
  }

  if (onDayOff) {
    return {
      status: 'On Time',
      exportStatus: 'No Schedule',
      isLate: false,
      lateMinutes: null,
      lateCategory: 'No Schedule',
      scheduledStartDisplay: scheduledStart,
    };
  }

  const core = computeLateCore(false, scheduledStart, clockIn, p.allClockInMinutes, grace, tz);
  const status: AttendanceStatus = core.lateCategory === 'Late' ? 'Late In' : 'On Time';
  return {
    status,
    exportStatus: core.lateCategory === 'Late' ? 'Late' : 'On Time',
    isLate: core.isLate,
    lateMinutes: core.lateMinutes,
    lateCategory: core.lateCategory,
    scheduledStartDisplay: scheduledStart,
  };
}

function inferMinutesLateAfterMedian(
  clockIn: string,
  allClockInMinutes: number[],
  grace: number
): { late: boolean; minutes: number } {
  const minutes = allClockInMinutes.filter((m) => m >= 0);
  if (minutes.length < MIN_CLOCK_INS_FOR_INFERENCE) {
    return { late: false, minutes: 0 };
  }
  const clusters = clusterClockInTimes(minutes, 240);
  const medians = clusters.map((c) => medianTimeOfDayFromExpandedCluster(c));
  const thisMin = clockInToMinutes(clockIn);
  let nearestMedian = medians[0]!;
  let bestDist = circularMinutesDistance(thisMin, nearestMedian);
  for (let i = 1; i < medians.length; i++) {
    const d = circularMinutesDistance(thisMin, medians[i]!);
    if (d < bestDist) {
      bestDist = d;
      nearestMedian = medians[i]!;
    }
  }

  let delta = 0;
  if (thisMin >= nearestMedian) {
    delta = thisMin - nearestMedian;
  } else if (nearestMedian >= EVENING_START_MINUTES && thisMin <= MORNING_END_MINUTES) {
    delta = forwardMinutesOnCircle(nearestMedian, thisMin);
  } else {
    delta = forwardMinutesOnCircle(nearestMedian, thisMin);
  }

  if (delta > 720) return { late: false, minutes: 0 };
  if (delta > grace) return { late: true, minutes: delta };
  return { late: false, minutes: 0 };
}

function computeLateCore(
  onDayOff: boolean,
  scheduledStart: string | null,
  clockIn: string,
  allClockInMinutes: number[],
  grace: number,
  timeZone: string
): { isLate: boolean; lateMinutes: number | null; lateCategory: LateCategory } {
  if (onDayOff) {
    return { isLate: false, lateMinutes: null, lateCategory: 'No Schedule' };
  }
  if (scheduledStart) {
    return calculateLateStatus({
      scheduledStart,
      actualClockIn: clockIn,
      recordDate: '',
      graceMinutes: grace,
      timeZone,
      isScheduledDayOff: false,
    });
  }

  const { late, minutes } = inferMinutesLateAfterMedian(clockIn, allClockInMinutes, grace);
  if (late) {
    return { isLate: true, lateMinutes: minutes, lateCategory: 'Late' };
  }

  return { isLate: false, lateMinutes: 0, lateCategory: 'On Time' };
}
