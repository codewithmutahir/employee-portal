'use server';

import { adminDb } from '@/lib/firebase/admin';
import { Employee, AttendanceRecord, Compensation } from '@/types';

export async function exportEmployeeData(employeeId: string): Promise<{
  employee: Employee;
  compensation: Compensation | null;
  attendance: AttendanceRecord[];
} | null> {
  try {

    const [employeeDoc, compensationDoc, attendanceSnapshot] = await Promise.all([
      adminDb.collection('employees').doc(employeeId).get(),
      adminDb.collection('compensation').doc(employeeId).get(),
      adminDb.collection('attendance')
        .where('employeeId', '==', employeeId)
        .orderBy('date', 'desc')
        .limit(365)
        .get(),
    ]);

    if (!employeeDoc.exists) {
      return null;
    }

    const empData = employeeDoc.data();

    const employee: Employee = {
      id: employeeDoc.id,
      email: empData?.email || '',
      displayName: empData?.displayName || '',
      role: empData?.role || 'employee',
      status: empData?.status || 'active',
      department: empData?.department,
      position: empData?.position,
      phoneNumber: empData?.phoneNumber,
      dateOfBirth: empData?.dateOfBirth?.toDate?.()?.toISOString() || empData?.dateOfBirth,
      hireDate: empData?.hireDate?.toDate?.()?.toISOString() || empData?.hireDate,
      createdAt: empData?.createdAt?.toDate?.()?.toISOString() || empData?.createdAt,
      updatedAt: empData?.updatedAt?.toDate?.()?.toISOString() || empData?.updatedAt,
    };

    const compensation = compensationDoc.exists
      ? ({
          employeeId: compensationDoc.id,
          salary: compensationDoc.data()?.salary,
          allowance: compensationDoc.data()?.allowance,
          bonus: compensationDoc.data()?.bonus,
          currency: compensationDoc.data()?.currency || 'USD',
          hourlyRate: compensationDoc.data()?.hourlyRate,
          updatedAt: compensationDoc.data()?.updatedAt?.toDate?.()?.toISOString(),
          updatedBy: compensationDoc.data()?.updatedBy,
        } as Compensation)
      : null;

    const attendance: AttendanceRecord[] = attendanceSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId: data.employeeId,
        date: data.date,
        clockIn: data.clockIn?.toDate?.()?.toISOString(),
        clockOut: data.clockOut?.toDate?.()?.toISOString(),
        breaks: (data.breaks || []).map((b: any) => ({
          startTime: b.startTime,
          endTime: b.endTime,
          duration: b.duration,
          type: b.type,
          isPaid: b.isPaid,
        })),
        totalHours: data.totalHours,
        payrollId: data.payrollId,
        noShowReason: data.noShowReason,
        employeeNote: data.employeeNote,
        managerNote: data.managerNote,
        editedBy: data.editedBy,
        editedAt: data.editedAt?.toDate?.()?.toISOString(),
        isEditedByManagement: data.isEditedByManagement || false,
        createdAt: data.createdAt?.toDate?.()?.toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
      };
    });

    return { employee, compensation, attendance };
  } catch (error: any) {
    return null;
  }
}

export async function exportAllEmployeesData(): Promise<Array<{
  employee: Employee;
  compensation: Compensation | null;
  attendance: AttendanceRecord[];
}> | null> {
  try {
    
    const employeesSnapshot = await adminDb
      .collection('employees')
      .where('status', '==', 'active')
      .where('role', '==', 'employee')
      .get();


    const employeesData = await Promise.all(
      employeesSnapshot.docs.map(async (doc) => {
        const employeeId = doc.id;
        const data = await exportEmployeeData(employeeId);
        return data;
      })
    );

    const validData = employeesData.filter((data): data is NonNullable<typeof data> => data !== null);
    
    return validData;
  } catch (error: any) {
    console.error('❌ Export all employees error:', error);
    return null;
  }
}