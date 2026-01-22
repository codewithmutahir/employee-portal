'use server';

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { AttendanceRecord, BreakRecord } from '@/types';
import { getTodayDateString, isToday, calculateHours } from '@/lib/utils';

export async function clockIn(employeeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const today = getTodayDateString();
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${today}`);
    const attendanceDoc = await attendanceRef.get();

    if (attendanceDoc.exists) {
      const data = attendanceDoc.data();
      if (data?.clockIn) {
        return { success: false, error: 'Already clocked in today' };
      }
    }

    const now = FieldValue.serverTimestamp();
    await attendanceRef.set({
      employeeId,
      date: today,
      clockIn: now,
      breaks: [],
      isEditedByManagement: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error('Clock in error:', error);
    return { success: false, error: error.message };
  }
}

export async function clockOut(employeeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const today = getTodayDateString();
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${today}`);
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

    const now = FieldValue.serverTimestamp();
    const clockInTime = data.clockIn.toDate().toISOString();
    const clockOutTime = new Date().toISOString();

    // Calculate total hours
    const breaks = (data.breaks || []) as BreakRecord[];
    const totalHours = calculateHours(clockInTime, clockOutTime, breaks);

    await attendanceRef.update({
      clockOut: now,
      totalHours,
      updatedAt: now,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Clock out error:', error);
    return { success: false, error: error.message };
  }
}

export async function startBreak(employeeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const today = getTodayDateString();
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${today}`);
    const attendanceDoc = await attendanceRef.get();

    if (!attendanceDoc.exists || !attendanceDoc.data()?.clockIn) {
      return { success: false, error: 'Must be clocked in to take a break' };
    }

    const data = attendanceDoc.data();
    const breaks = [...(data?.breaks || [])] as BreakRecord[];

    // Check if there's an active break (no endTime)
    const activeBreak = breaks.find(b => !b.endTime);
    if (activeBreak) {
      return { success: false, error: 'Already on a break' };
    }

    const now = FieldValue.serverTimestamp();
    const newBreaks = [
      ...breaks,
      {
        startTime: new Date().toISOString(),
      }
    ];

    await attendanceRef.update({
      breaks: newBreaks,
      updatedAt: now,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Start break error:', error);
    return { success: false, error: error.message };
  }
}

export async function endBreak(employeeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const today = getTodayDateString();
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${today}`);
    const attendanceDoc = await attendanceRef.get();

    if (!attendanceDoc.exists) {
      return { success: false, error: 'No attendance record found' };
    }

    const data = attendanceDoc.data();
    const breaks = [...(data?.breaks || [])] as BreakRecord[];

    const activeBreakIndex = breaks.findIndex(b => !b.endTime);
    if (activeBreakIndex === -1) {
      return { success: false, error: 'No active break found' };
    }

    const endTime = new Date().toISOString();
    const startTime = breaks[activeBreakIndex].startTime;
    const duration = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60));

    const newBreaks = breaks.map((breakRecord, index) =>
      index === activeBreakIndex
        ? {
            ...breakRecord,
            endTime,
            duration,
          }
        : breakRecord
    );

    // Recalculate total hours if clocked out - USE newBreaks here!
    let totalHours = data?.totalHours;
    if (data?.clockOut) {
      const clockInTime = data.clockIn.toDate().toISOString();
      const clockOutTime = data.clockOut.toDate().toISOString();
      totalHours = calculateHours(clockInTime, clockOutTime, newBreaks); // Changed from 'breaks' to 'newBreaks'
    }

    // Build update data
    const updateData: any = {
      breaks: newBreaks,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Only include totalHours if it's a valid number
    if (typeof totalHours === 'number' && !isNaN(totalHours)) {
      updateData.totalHours = totalHours;
    }

    await attendanceRef.update(updateData);

    return { success: true };
  } catch (error: any) {
    console.error('End break error:', error);
    return { success: false, error: error.message };
  }
}

export async function getTodayAttendance(employeeId: string): Promise<AttendanceRecord | null> {
  try {
    const today = getTodayDateString();
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${today}`);
    const attendanceDoc = await attendanceRef.get();

    if (!attendanceDoc.exists) {
      return null;
    }

    const data = attendanceDoc.data();
    return {
      id: attendanceDoc.id,
      employeeId: data?.employeeId,
      date: data?.date,
      clockIn: data?.clockIn?.toDate().toISOString(),
      clockOut: data?.clockOut?.toDate().toISOString(),
      breaks: (data?.breaks || []).map((b: any) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        duration: b.duration,
      })),
      totalHours: data?.totalHours,
      editedBy: data?.editedBy,
      editedAt: data?.editedAt?.toDate().toISOString(),
      isEditedByManagement: data?.isEditedByManagement || false,
      createdAt: data?.createdAt?.toDate().toISOString(),
      updatedAt: data?.updatedAt?.toDate().toISOString(),
    } as AttendanceRecord;
  } catch (error: any) {
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

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId: data.employeeId,
        date: data.date,
        clockIn: data.clockIn?.toDate().toISOString(),
        clockOut: data.clockOut?.toDate().toISOString(),
        breaks: (data.breaks || []).map((b: any) => ({
          startTime: b.startTime,
          endTime: b.endTime,
          duration: b.duration,
        })),
        totalHours: data.totalHours,
        editedBy: data.editedBy,
        editedAt: data.editedAt?.toDate().toISOString(),
        isEditedByManagement: data.isEditedByManagement || false,
        createdAt: data.createdAt?.toDate().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as AttendanceRecord;
    });
  } catch (error: any) {
    console.error('Get attendance history error:', error);
    return [];
  }
}

export async function getEmployeeAttendanceStats(employeeId: string, days: number = 30): Promise<{
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

    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        date: data.date,
        totalHours: data.totalHours || 0,
        clockIn: data.clockIn,
      };
    });

    const presentDays = records.filter(r => r.clockIn).length;
    const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    const averageHours = presentDays > 0 ? totalHours / presentDays : 0;
    const attendanceRate = days > 0 ? (presentDays / days) * 100 : 0;

    // Recent trend (last 7 days)
    const recentTrend = records.slice(0, 7).map(r => ({
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
  } catch (error: any) {
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

export async function getEmployeeMonthlyStats(employeeId: string, months: number = 6): Promise<{
  monthlyStats: { month: string; totalHours: number; presentDays: number; attendanceRate: number }[];
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

      const records = snapshot.docs.map(doc => doc.data());
      const presentDays = records.filter(r => r.clockIn).length;
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
  } catch (error: any) {
    console.error('Get employee monthly stats error:', error);
    return { monthlyStats: [] };
  }
}

export async function getDepartmentAttendanceStats(): Promise<{
  departmentStats: { department: string; employeeCount: number; averageAttendance: number; totalHours: number }[];
  overallStats: { totalEmployees: number; averageAttendanceRate: number; totalHoursWorked: number };
}> {
  try {
    // Get all active employees
    const employeesSnapshot = await adminDb
      .collection('employees')
      .where('status', '==', 'active')
      .where('role', '==', 'employee')
      .get();

    const employees = employeesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: data.displayName || '',
        department: data.department || 'No Department',
        email: data.email || '',
      };
    });

    // Group employees by department
    const departmentMap = new Map<string, any[]>();
    employees.forEach(emp => {
      const dept = emp.department || 'No Department';
      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, []);
      }
      departmentMap.get(dept)!.push(emp);
    });

    // Calculate stats for each department (last 30 days)
    const departmentStats = [];
    let totalEmployees = 0;
    let totalAttendanceRate = 0;
    let totalHoursWorked = 0;

    for (const [department, deptEmployees] of departmentMap) {
      const employeeIds = deptEmployees.map(emp => emp.id);
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
      averageAttendanceRate: totalEmployees > 0 ? Math.round((totalAttendanceRate / totalEmployees) * 10) / 10 : 0,
      totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
    };

    return { departmentStats, overallStats };
  } catch (error: any) {
    console.error('Get department attendance stats error:', error);
    return {
      departmentStats: [],
      overallStats: { totalEmployees: 0, averageAttendanceRate: 0, totalHoursWorked: 0 },
    };
  }
}

export async function getWorkforceInsights(): Promise<{
  attendanceTrends: { date: string; presentCount: number; totalEmployees: number }[];
  topPerformers: { employeeId: string; displayName: string; department: string; attendanceRate: number; totalHours: number }[];
  departmentDistribution: { department: string; count: number; percentage: number }[];
}> {
  try {
    const employeesSnapshot = await adminDb
      .collection('employees')
      .where('status', '==', 'active')
      .where('role', '==', 'employee')
      .get();

    const employees = employeesSnapshot.docs.map(doc => ({
      id: doc.id,
      displayName: doc.data().displayName,
      department: doc.data().department || 'No Department',
    }));

    // Department distribution
    const deptCount = new Map<string, number>();
    employees.forEach(emp => {
      deptCount.set(emp.department, (deptCount.get(emp.department) || 0) + 1);
    });

    const totalEmployees = employees.length;
    const departmentDistribution = Array.from(deptCount).map(([department, count]) => ({
      department,
      count,
      percentage: Math.round((count / totalEmployees) * 100),
    }));

    // Attendance trends (last 7 days)
    const attendanceTrends = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      let presentCount = 0;
      for (const employee of employees) {
        const attendanceDoc = await adminDb.collection('attendance').doc(`${employee.id}_${dateStr}`).get();
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

    // Top performers (last 30 days)
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

    // Sort by attendance rate and take top 5
    topPerformers.sort((a, b) => b.attendanceRate - a.attendanceRate);

    return {
      attendanceTrends,
      topPerformers: topPerformers.slice(0, 5),
      departmentDistribution,
    };
  } catch (error: any) {
    console.error('Get workforce insights error:', error);
    return {
      attendanceTrends: [],
      topPerformers: [],
      departmentDistribution: [],
    };
  }
}

