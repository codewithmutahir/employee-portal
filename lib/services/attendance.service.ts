/**
 * Attendance service – clock in/out, breaks, history, stats.
 * Single source of truth for attendance business logic.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { AttendanceRecord, BreakRecord } from '@/types';
import { calculateHours } from '@/lib/utils';
import { getDateKey, getYesterdayDateString } from './date-helpers';

function docToAttendanceRecord(
  doc: { id: string; exists: boolean; data: () => Record<string, unknown> | undefined },
  dateKey: string
): AttendanceRecord {
  const data = doc.data() as Record<string, unknown> | undefined;
  const getTs = (v: unknown): string | undefined => {
    if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
      return (v as { toDate: () => Date }).toDate().toISOString();
    }
    return undefined;
  };
  return {
    id: doc.id,
    employeeId: data?.employeeId as string,
    date: (data?.date as string) ?? dateKey,
    clockIn: getTs(data?.clockIn),
    clockOut: getTs(data?.clockOut),
    breaks: ((data?.breaks as BreakRecord[]) || []).map((b) => ({
      startTime: b.startTime,
      endTime: b.endTime,
      duration: b.duration,
    })),
    totalHours: data?.totalHours as number | undefined,
    editedBy: data?.editedBy as string | undefined,
    editedAt: getTs(data?.editedAt),
    isEditedByManagement: (data?.isEditedByManagement as boolean) || false,
    createdAt: getTs(data?.createdAt) ?? '',
    updatedAt: getTs(data?.updatedAt) ?? '',
  } as AttendanceRecord;
}

export async function clockIn(
  employeeId: string,
  dateOverride?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dateKey = getDateKey(dateOverride);
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${dateKey}`);
    const attendanceDoc = await attendanceRef.get();

    if (attendanceDoc.exists) {
      const data = attendanceDoc.data();
      if (data?.clockIn) {
        return { success: false, error: 'Already clocked in today' };
      }
    }

    const now = FieldValue.serverTimestamp();
    await attendanceRef.set(
      {
        employeeId,
        date: dateKey,
        clockIn: now,
        breaks: [],
        isEditedByManagement: false,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Clock in error:', err);
    return { success: false, error: err.message };
  }
}

export async function clockOut(
  employeeId: string,
  dateOverride?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dateKey = getDateKey(dateOverride);
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${dateKey}`);
    const attendanceDoc = await attendanceRef.get();

    if (!attendanceDoc.exists) {
      return { success: false, error: 'No clock-in record found for today' };
    }

    const data = attendanceDoc.data();
    if (!data?.clockIn) {
      return { success: false, error: 'Must clock in before clocking out' };
    }

    if (data?.clockOut) {
      return { success: false, error: 'Already clocked out today' };
    }

    const breaks = (data.breaks || []) as BreakRecord[];
    const hasActiveBreak = breaks.some((b: BreakRecord) => !b.endTime);
    if (hasActiveBreak) {
      return { success: false, error: 'End your break before clocking out' };
    }

    const now = FieldValue.serverTimestamp();
    const clockInTime = (data.clockIn as { toDate: () => Date }).toDate().toISOString();
    const clockOutTime = new Date().toISOString();
    const totalHours = calculateHours(clockInTime, clockOutTime, breaks);

    await attendanceRef.update({
      clockOut: now,
      totalHours,
      updatedAt: now,
    });

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Clock out error:', err);
    return { success: false, error: err.message };
  }
}

export async function startBreak(
  employeeId: string,
  dateOverride?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dateKey = getDateKey(dateOverride);
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${dateKey}`);
    const attendanceDoc = await attendanceRef.get();

    if (!attendanceDoc.exists || !attendanceDoc.data()?.clockIn) {
      return { success: false, error: 'Must be clocked in to take a break' };
    }

    const data = attendanceDoc.data();
    const breaks = [...(data?.breaks || [])] as BreakRecord[];

    const activeBreak = breaks.find((b) => !b.endTime);
    if (activeBreak) {
      return { success: false, error: 'Already on a break' };
    }

    const now = FieldValue.serverTimestamp();
    const newBreaks = [
      ...breaks,
      {
        startTime: new Date().toISOString(),
      },
    ];

    await attendanceRef.update({
      breaks: newBreaks,
      updatedAt: now,
    });

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Start break error:', err);
    return { success: false, error: err.message };
  }
}

export async function endBreak(
  employeeId: string,
  dateOverride?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dateKey = getDateKey(dateOverride);
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${dateKey}`);
    const attendanceDoc = await attendanceRef.get();

    if (!attendanceDoc.exists) {
      return { success: false, error: 'No attendance record found' };
    }

    const data = attendanceDoc.data();
    const breaks = [...(data?.breaks || [])] as BreakRecord[];

    const activeBreakIndex = breaks.findIndex((b) => !b.endTime);
    if (activeBreakIndex === -1) {
      return { success: false, error: 'No active break found' };
    }

    const endTime = new Date().toISOString();
    const startTime = breaks[activeBreakIndex].startTime;
    const duration = Math.round(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60)
    );

    const newBreaks = breaks.map((breakRecord, index) =>
      index === activeBreakIndex
        ? { ...breakRecord, endTime, duration }
        : breakRecord
    );

    let totalHours = data?.totalHours as number | undefined;
    if (data?.clockOut) {
      const clockInTime = (data.clockIn as { toDate: () => Date }).toDate().toISOString();
      const clockOutTime = (data.clockOut as { toDate: () => Date }).toDate().toISOString();
      totalHours = calculateHours(clockInTime, clockOutTime, newBreaks);
    }

    const updateData: Record<string, unknown> = {
      breaks: newBreaks,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof totalHours === 'number' && !isNaN(totalHours)) {
      updateData.totalHours = totalHours;
    }

    await attendanceRef.update(updateData);

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('End break error:', err);
    return { success: false, error: err.message };
  }
}

const MINUTES_PER_DAY = 1440;

/** Minutes from midnight (0–1439) for a given ISO clock-in time (employee-local wall time). */
function clockInToMinutes(clockIn: string): number {
  const d = new Date(clockIn);
  return d.getHours() * 60 + d.getMinutes();
}

/** Shortest distance between two times-of-day on a 24h circle (handles overnight). */
function circularMinutesDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, MINUTES_PER_DAY - d);
}

/** Minutes moving forward on the circle from `start` to `end` (both 0–1439). */
function forwardMinutesOnCircle(start: number, end: number): number {
  if (end >= start) return end - start;
  return MINUTES_PER_DAY - start + end;
}

/** When history mixes late-evening and early-morning clock-ins, map “next calendar morning” past midnight for linear clustering. */
function expandMinutesForOvernightClustering(minutes: number[]): number[] {
  if (minutes.length === 0) return minutes;
  const hasEvening = minutes.some((m) => m >= 18 * 60);
  const hasEarlyMorning = minutes.some((m) => m < 6 * 60);
  if (!hasEvening || !hasEarlyMorning) return minutes;
  return minutes.map((m) => (m < 12 * 60 ? m + MINUTES_PER_DAY : m));
}

/**
 * Clusters clock-in times (in minutes) by proximity. Times within MAX_GAP minutes
 * are considered the same shift; otherwise a new cluster starts. Uses expanded
 * timeline when evening + early-morning mixes appear (overnight shifts).
 */
function clusterClockInTimes(minutes: number[], maxGapMinutes: number = 240): number[][] {
  if (minutes.length === 0) return [];
  const expanded = expandMinutesForOvernightClustering(minutes);
  const sorted = [...expanded].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap <= maxGapMinutes) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);
  return clusters;
}

/** Median on the expanded timeline; fold back to 0–1439 for “time of day” (overnight-aware). */
function medianTimeOfDayFromExpandedCluster(cluster: number[]): number {
  if (cluster.length === 0) return 0;
  const sorted = [...cluster].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  let m = raw;
  while (m >= MINUTES_PER_DAY) m -= MINUTES_PER_DAY;
  return Math.round(m);
}

/**
 * Infers "expected start" times from an employee's own clock-in history (one per
 * shift cluster), then decides On Time vs Late In using a grace period. No
 * hardcoded 9 AM / 9 PM — works for morning, evening, and night shifts.
 */
const GRACE_MINUTES = 10;
const MIN_CLOCK_INS_FOR_INFERENCE = 2;
/** Clock-ins from this minute onward are treated as “evening” for overnight lateness. */
const EVENING_START_MINUTES = 18 * 60;
/** Clock-ins at or before this minute may be “next morning” after an evening shift start. */
const MORNING_END_MINUTES = 8 * 60;

function inferStatusFromHistory(
  clockIn: string | undefined,
  totalHours: number | undefined,
  allClockInMinutes: number[]
): 'On Time' | 'Late In' | 'Absent' | 'Half Day' {
  if (!clockIn) return 'Absent';
  if (totalHours !== undefined && totalHours < 4) return 'Half Day';

  const minutes = allClockInMinutes.filter((m) => m >= 0);
  if (minutes.length < MIN_CLOCK_INS_FOR_INFERENCE) {
    return 'On Time'; // Not enough data to infer; default to generous
  }

  const clusters = clusterClockInTimes(minutes);
  const medians = clusters.map((c) => medianTimeOfDayFromExpandedCluster(c));
  const thisMin = clockInToMinutes(clockIn);

  // Nearest shift cluster by circular distance (fixes 10pm vs 7am mis-grouping).
  let nearestMedian = medians[0];
  let bestDist = circularMinutesDistance(thisMin, medians[0]);
  for (let i = 1; i < medians.length; i++) {
    const d = circularMinutesDistance(thisMin, medians[i]);
    if (d < bestDist) {
      bestDist = d;
      nearestMedian = medians[i];
    }
  }

  // Lateness: same “calendar segment” uses linear delta; evening start + early-morning clock-in uses forward distance on the circle.
  let late = false;
  if (thisMin >= nearestMedian) {
    late = thisMin - nearestMedian > GRACE_MINUTES;
  } else if (nearestMedian >= EVENING_START_MINUTES && thisMin <= MORNING_END_MINUTES) {
    late = forwardMinutesOnCircle(nearestMedian, thisMin) > GRACE_MINUTES;
  }

  return late ? 'Late In' : 'On Time';
}

async function fetchRecentClockInMinutes(employeeId: string, limit: number = 30): Promise<number[]> {
  const snapshot = await adminDb
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  const mins: number[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const ci = data?.clockIn;
    if (ci && typeof (ci as { toDate?: () => Date }).toDate === 'function') {
      const iso = (ci as { toDate: () => Date }).toDate().toISOString();
      mins.push(clockInToMinutes(iso));
    }
  }
  return mins;
}

export async function getTodayAttendance(
  employeeId: string,
  dateOverride?: string
): Promise<AttendanceRecord | null> {
  try {
    const dateKey = getDateKey(dateOverride);
    const todayRef = adminDb.collection('attendance').doc(`${employeeId}_${dateKey}`);
    const todayDoc = await todayRef.get();

    let record: AttendanceRecord | null = null;

    if (todayDoc.exists) {
      record = docToAttendanceRecord(todayDoc, dateKey);
    } else {
      const yesterdayKey = getYesterdayDateString(dateKey);
      const yesterdayRef = adminDb.collection('attendance').doc(`${employeeId}_${yesterdayKey}`);
      const yesterdayDoc = await yesterdayRef.get();

      if (yesterdayDoc.exists) {
        const yesterdayData = yesterdayDoc.data();
        if (yesterdayData?.clockIn && !yesterdayData?.clockOut) {
          record = docToAttendanceRecord(yesterdayDoc, yesterdayKey);
        }
      }
    }

    if (record?.clockIn) {
      const mins = await fetchRecentClockInMinutes(employeeId, 30);
      record = {
        ...record,
        status: inferStatusFromHistory(record.clockIn, record.totalHours, mins),
      };
    }

    return record;
  } catch (error: unknown) {
    console.error('Get attendance error:', error);
    return null;
  }
}

export async function getAttendanceHistory(
  employeeId: string,
  limit: number = 30
): Promise<AttendanceRecord[]> {
  try {
    const snapshot = await adminDb
      .collection('attendance')
      .where('employeeId', '==', employeeId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();

    const getTs = (v: unknown): string | undefined => {
      if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
        return (v as { toDate: () => Date }).toDate().toISOString();
      }
      return undefined;
    };

    const rows = snapshot.docs.map((doc) => {
      const data = doc.data();
      const clockIn = getTs(data.clockIn);
      const clockOut = getTs(data.clockOut);
      return {
        id: doc.id,
        data,
        clockIn,
        clockOut,
        totalHours: data.totalHours as number | undefined,
        getTs,
      };
    });

    const allClockInMinutes = rows
      .filter((r) => r.clockIn)
      .map((r) => clockInToMinutes(r.clockIn!));

    return rows.map(({ id, data, clockIn, clockOut, totalHours, getTs }) => ({
      id,
      employeeId: data.employeeId,
      date: data.date,
      clockIn,
      clockOut,
      breaks: (data.breaks || []).map((b: BreakRecord) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        duration: b.duration,
      })),
      totalHours,
      status: inferStatusFromHistory(clockIn, totalHours, allClockInMinutes),
      editedBy: data.editedBy,
      editedAt: getTs(data.editedAt),
      isEditedByManagement: data.isEditedByManagement || false,
      createdAt: getTs(data.createdAt),
      updatedAt: getTs(data.updatedAt),
    })) as AttendanceRecord[];
  } catch (error: unknown) {
    console.error('Get attendance history error:', error);
    return [];
  }
}

export async function getEmployeeAttendanceStats(
  employeeId: string,
  days: number = 30
): Promise<{
  totalDays: number;
  presentDays: number;
  totalHours: number;
  averageHours: number;
  attendanceRate: number;
  recentTrend: { date: string; hours: number }[];
}> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const snapshot = await adminDb
      .collection('attendance')
      .where('employeeId', '==', employeeId)
      .where('date', '>=', startDate.toISOString().split('T')[0])
      .where('date', '<=', endDate.toISOString().split('T')[0])
      .orderBy('date', 'desc')
      .get();

    const records = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        date: data.date,
        totalHours: data.totalHours || 0,
        clockIn: data.clockIn,
      };
    });

    const presentDays = records.filter((r) => r.clockIn).length;
    const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    const averageHours = presentDays > 0 ? totalHours / presentDays : 0;
    const attendanceRate = days > 0 ? (presentDays / days) * 100 : 0;

    const recentTrend = records.slice(0, 7).map((r) => ({
      date: r.date,
      hours: r.totalHours || 0,
    }));

    return {
      totalDays: days,
      presentDays,
      totalHours,
      averageHours,
      attendanceRate,
      recentTrend,
    };
  } catch (error: unknown) {
    console.error('Get employee attendance stats error:', error);
    return {
      totalDays: days,
      presentDays: 0,
      totalHours: 0,
      averageHours: 0,
      attendanceRate: 0,
      recentTrend: [],
    };
  }
}

export async function getEmployeeMonthlyStats(
  employeeId: string,
  months: number = 6
): Promise<{
  monthlyStats: {
    month: string;
    totalHours: number;
    presentDays: number;
    attendanceRate: number;
  }[];
}> {
  try {
    const stats = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = date.getMonth();

      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      const daysInMonth = endDate.getDate();

      const snapshot = await adminDb
        .collection('attendance')
        .where('employeeId', '==', employeeId)
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .where('date', '<=', endDate.toISOString().split('T')[0])
        .get();

      const records = snapshot.docs.map((doc) => doc.data());
      const presentDays = records.filter((r) => r.clockIn).length;
      const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);
      const attendanceRate = (presentDays / daysInMonth) * 100;

      stats.push({
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        totalHours,
        presentDays,
        attendanceRate,
      });
    }

    return { monthlyStats: stats };
  } catch (error: unknown) {
    console.error('Get employee monthly stats error:', error);
    return { monthlyStats: [] };
  }
}

export async function getDepartmentAttendanceStats(): Promise<{
  departmentStats: {
    department: string;
    employeeCount: number;
    averageAttendance: number;
    totalHours: number;
  }[];
  overallStats: {
    totalEmployees: number;
    averageAttendanceRate: number;
    totalHoursWorked: number;
  };
}> {
  try {
    const employeesSnapshot = await adminDb
      .collection('employees')
      .where('status', '==', 'active')
      .where('role', '==', 'employee')
      .get();

    const employees = employeesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: data.displayName || '',
        department: data.department || 'No Department',
        email: data.email || '',
      };
    });

    const departmentMap = new Map<string, typeof employees>();
    employees.forEach((emp) => {
      const dept = emp.department || 'No Department';
      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, []);
      }
      departmentMap.get(dept)!.push(emp);
    });

    const departmentStats: {
      department: string;
      employeeCount: number;
      averageAttendance: number;
      totalHours: number;
    }[] = [];
    let totalEmployees = 0;
    let totalAttendanceRate = 0;
    let totalHoursWorked = 0;

    for (const [department, deptEmployees] of departmentMap) {
      const employeeIds = deptEmployees.map((emp) => emp.id);
      let deptTotalHours = 0;
      let deptTotalAttendanceRate = 0;

      for (const employeeId of employeeIds) {
        const stats = await getEmployeeAttendanceStats(employeeId, 30);
        deptTotalHours += stats.totalHours;
        deptTotalAttendanceRate += stats.attendanceRate;
      }

      const averageAttendance = deptTotalAttendanceRate / employeeIds.length;

      departmentStats.push({
        department,
        employeeCount: employeeIds.length,
        averageAttendance: Math.round(averageAttendance * 10) / 10,
        totalHours: Math.round(deptTotalHours * 10) / 10,
      });

      totalEmployees += employeeIds.length;
      totalAttendanceRate += deptTotalAttendanceRate;
      totalHoursWorked += deptTotalHours;
    }

    const overallStats = {
      totalEmployees,
      averageAttendanceRate:
        totalEmployees > 0 ? Math.round((totalAttendanceRate / totalEmployees) * 10) / 10 : 0,
      totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
    };

    return { departmentStats, overallStats };
  } catch (error: unknown) {
    console.error('Get department attendance stats error:', error);
    return {
      departmentStats: [],
      overallStats: { totalEmployees: 0, averageAttendanceRate: 0, totalHoursWorked: 0 },
    };
  }
}

export async function getWorkforceInsights(): Promise<{
  attendanceTrends: { date: string; presentCount: number; totalEmployees: number }[];
  topPerformers: {
    employeeId: string;
    displayName: string;
    department: string;
    attendanceRate: number;
    totalHours: number;
  }[];
  departmentDistribution: { department: string; count: number; percentage: number }[];
}> {
  try {
    const employeesSnapshot = await adminDb
      .collection('employees')
      .where('status', '==', 'active')
      .where('role', '==', 'employee')
      .get();

    const employees = employeesSnapshot.docs.map((doc) => ({
      id: doc.id,
      displayName: doc.data().displayName,
      department: doc.data().department || 'No Department',
    }));

    const deptCount = new Map<string, number>();
    employees.forEach((emp) => {
      deptCount.set(emp.department, (deptCount.get(emp.department) || 0) + 1);
    });

    const totalEmployees = employees.length;
    const departmentDistribution = Array.from(deptCount).map(([department, count]) => ({
      department,
      count,
      percentage: Math.round((count / totalEmployees) * 100),
    }));

    const attendanceTrends: { date: string; presentCount: number; totalEmployees: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      let presentCount = 0;
      for (const employee of employees) {
        const attendanceDoc = await adminDb
          .collection('attendance')
          .doc(`${employee.id}_${dateStr}`)
          .get();
        if (attendanceDoc.exists && attendanceDoc.data()?.clockIn) {
          presentCount++;
        }
      }

      attendanceTrends.push({
        date: dateStr,
        presentCount,
        totalEmployees,
      });
    }

    const topPerformers = [];
    for (const employee of employees) {
      const stats = await getEmployeeAttendanceStats(employee.id, 30);
      topPerformers.push({
        employeeId: employee.id,
        displayName: employee.displayName,
        department: employee.department,
        attendanceRate: Math.round(stats.attendanceRate * 10) / 10,
        totalHours: Math.round(stats.totalHours * 10) / 10,
      });
    }

    topPerformers.sort((a, b) => b.attendanceRate - a.attendanceRate);

    return {
      attendanceTrends,
      topPerformers: topPerformers.slice(0, 5),
      departmentDistribution,
    };
  } catch (error: unknown) {
    console.error('Get workforce insights error:', error);
    return {
      attendanceTrends: [],
      topPerformers: [],
      departmentDistribution: [],
    };
  }
}
