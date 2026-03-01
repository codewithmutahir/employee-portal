'use server';

import * as attendanceManagementService from '@/lib/services/attendance-management.service';

export async function updateAttendance(
  employeeId: string,
  date: string,
  updates: Parameters<typeof attendanceManagementService.updateAttendance>[2],
  editedBy: string
) {
  return attendanceManagementService.updateAttendance(
    employeeId,
    date,
    updates,
    editedBy
  );
}
export async function getAttendanceByDate(employeeId: string, date: string) {
  return attendanceManagementService.getAttendanceByDate(employeeId, date);
}
