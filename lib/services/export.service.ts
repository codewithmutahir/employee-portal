/**
 * Export service – export employee data (single or all) for reporting.
 * Single source of truth for export business logic.
 */

import { adminDb } from '@/lib/firebase/admin';
import { Employee, AttendanceRecord, Compensation } from '@/types';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { getEmployeeDateRangeSchedules, getScheduleHistory } from './employees.service';
import { ScheduleHistoryEntry } from '@/lib/schedule-history';
import type { EmployeeDateRangeSchedule } from '@/types';

function toISOString(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function exportEmployeeData(employeeId: string): Promise<{
  employee: Employee;
  compensation: Compensation | null;
  attendance: AttendanceRecord[];
  scheduleHistory: ScheduleHistoryEntry[];
  dateRangeSchedules: EmployeeDateRangeSchedule[];
} | null> {
  try {
    const [employeeDoc, compensationDoc, attendanceSnapshot, scheduleHistory, dateRangeSchedules] =
      await Promise.all([
        adminDb.collection('employees').doc(employeeId).get(),
        adminDb.collection('compensation').doc(employeeId).get(),
        adminDb
          .collection('attendance')
          .where('employeeId', '==', employeeId)
          .orderBy('date', 'desc')
          .limit(365)
          .get(),
        getScheduleHistory(employeeId),
        getEmployeeDateRangeSchedules(employeeId),
      ]);

    if (!employeeDoc.exists) {
      return null;
    }

    const empData = employeeDoc.data();

    const employee: Employee = {
      id: employeeDoc.id,
      email: (empData?.email as string) || '',
      displayName: (empData?.displayName as string) || '',
      role: (empData?.role as Employee['role']) || 'employee',
      status: (empData?.status as Employee['status']) || 'active',
      department: empData?.department,
      position: empData?.position,
      phoneNumber: empData?.phoneNumber,
      dateOfBirth:
        toISOString(empData?.dateOfBirth) || (empData?.dateOfBirth as string),
      hireDate:
        toISOString(empData?.hireDate) || (empData?.hireDate as string),
      scheduleStart: empData?.scheduleStart as string | undefined,
      scheduleEnd: empData?.scheduleEnd as string | undefined,
      dayOff: empData?.dayOff as string | undefined,
      createdAt:
        toISOString(empData?.createdAt) || (empData?.createdAt as string),
      updatedAt:
        toISOString(empData?.updatedAt) || (empData?.updatedAt as string),
    };

    const cd = compensationDoc.data();
    const compensation = compensationDoc.exists
      ? ({
          employeeId: compensationDoc.id,
          salary: Number(cd?.salary ?? 0),
          allowance:
            cd?.allowance !== undefined && cd?.allowance !== null ? Number(cd.allowance) : undefined,
          bonus: cd?.bonus !== undefined && cd?.bonus !== null ? Number(cd.bonus) : undefined,
          currency: (cd?.currency as string) || DEFAULT_CURRENCY,
          updatedAt: toISOString(cd?.updatedAt),
          updatedBy: cd?.updatedBy as string | undefined,
        } as Compensation)
      : null;

    const attendance: AttendanceRecord[] = attendanceSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId: data.employeeId,
        date: data.date,
        clockIn: toISOString(data.clockIn),
        clockOut: toISOString(data.clockOut),
        breaks: (data.breaks || []).map((b: BreakRecordLike) => ({
          startTime: b.startTime,
          endTime: b.endTime,
          duration: b.duration,
          type: b.type,
          isPaid: b.isPaid,
        })),
        totalHours: data.totalHours,
        status: data.status,
        payrollId: data.payrollId,
        noShowReason: data.noShowReason,
        employeeNote: data.employeeNote,
        managerNote: data.managerNote,
        editedBy: data.editedBy,
        editedAt: toISOString(data.editedAt),
        isEditedByManagement: data.isEditedByManagement || false,
        createdAt: toISOString(data.createdAt),
        updatedAt: toISOString(data.updatedAt),
      } as AttendanceRecord;
    });

    return { employee, compensation, attendance, scheduleHistory, dateRangeSchedules };
  } catch (error: unknown) {
    console.error('Export employee data error:', error);
    return null;
  }
}

interface BreakRecordLike {
  startTime: string;
  endTime?: string;
  duration?: number;
  type?: string;
  isPaid?: boolean;
}

export async function exportAllEmployeesData(): Promise<
  Array<{
    employee: Employee;
    compensation: Compensation | null;
    attendance: AttendanceRecord[];
    scheduleHistory: ScheduleHistoryEntry[];
    dateRangeSchedules: EmployeeDateRangeSchedule[];
  }> | null
> {
  try {
    const employeesSnapshot = await adminDb
      .collection('employees')
      .where('status', '==', 'active')
      .where('role', '==', 'employee')
      .get();

    const employeesData = await Promise.all(
      employeesSnapshot.docs.map(async (doc) => {
        const employeeId = doc.id;
        return exportEmployeeData(employeeId);
      })
    );

    const validData = employeesData.filter(
      (data): data is NonNullable<typeof data> => data !== null
    );

    return validData;
  } catch (error: unknown) {
    console.error('Export all employees error:', error);
    return null;
  }
}
