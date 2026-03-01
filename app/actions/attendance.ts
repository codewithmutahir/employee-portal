'use server';

import * as attendanceService from '@/lib/services/attendance.service';

export async function clockIn(employeeId: string, dateOverride?: string) {
  return attendanceService.clockIn(employeeId, dateOverride);
}
export async function clockOut(employeeId: string, dateOverride?: string) {
  return attendanceService.clockOut(employeeId, dateOverride);
}
export async function startBreak(employeeId: string, dateOverride?: string) {
  return attendanceService.startBreak(employeeId, dateOverride);
}
export async function endBreak(employeeId: string, dateOverride?: string) {
  return attendanceService.endBreak(employeeId, dateOverride);
}
export async function getTodayAttendance(employeeId: string, dateOverride?: string) {
  return attendanceService.getTodayAttendance(employeeId, dateOverride);
}
export async function getAttendanceHistory(employeeId: string, limit?: number) {
  return attendanceService.getAttendanceHistory(employeeId, limit);
}
export async function getEmployeeAttendanceStats(employeeId: string, days?: number) {
  return attendanceService.getEmployeeAttendanceStats(employeeId, days);
}
export async function getEmployeeMonthlyStats(employeeId: string, months?: number) {
  return attendanceService.getEmployeeMonthlyStats(employeeId, months);
}
export async function getDepartmentAttendanceStats() {
  return attendanceService.getDepartmentAttendanceStats();
}
export async function getWorkforceInsights() {
  return attendanceService.getWorkforceInsights();
}
