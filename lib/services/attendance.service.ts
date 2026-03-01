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

export async function getTodayAttendance(
  employeeId: string,
  dateOverride?: string
): Promise<AttendanceRecord | null> {
  try {
    const dateKey = getDateKey(dateOverride);
    const todayRef = adminDb.collection('attendance').doc(`${employeeId}_${dateKey}`);
    const todayDoc = await todayRef.get();

    if (todayDoc.exists) {
      return docToAttendanceRecord(todayDoc, dateKey);
    }

    const yesterdayKey = getYesterdayDateString(dateKey);
    const yesterdayRef = adminDb.collection('attendance').doc(`${employeeId}_${yesterdayKey}`);
    const yesterdayDoc = await yesterdayRef.get();

    if (yesterdayDoc.exists) {
      const yesterdayData = yesterdayDoc.data();
      if (yesterdayData?.clockIn && !yesterdayData?.clockOut) {
        return docToAttendanceRecord(yesterdayDoc, yesterdayKey);
      }
    }

    return null;
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

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const getTs = (v: unknown): string | undefined => {
        if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
          return (v as { toDate: () => Date }).toDate().toISOString();
        }
        return undefined;
      };
      return {
        id: doc.id,
        employeeId: data.employeeId,
        date: data.date,
        clockIn: getTs(data.clockIn),
        clockOut: getTs(data.clockOut),
        breaks: (data.breaks || []).map((b: BreakRecord) => ({
          startTime: b.startTime,
          endTime: b.endTime,
          duration: b.duration,
        })),
        totalHours: data.totalHours,
        editedBy: data.editedBy,
        editedAt: getTs(data.editedAt),
        isEditedByManagement: data.isEditedByManagement || false,
        createdAt: getTs(data.createdAt),
        updatedAt: getTs(data.updatedAt),
      } as AttendanceRecord;
    });
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
