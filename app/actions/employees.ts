'use server';

import * as employeesService from '@/lib/services/employees.service';

export async function getEmployee(employeeId: string) {
  return employeesService.getEmployee(employeeId);
}
export async function getAllEmployees(excludeManagement?: boolean) {
  return employeesService.getAllEmployees(excludeManagement);
}
export async function getManagementUsers() {
  return employeesService.getManagementUsers();
}
export async function createEmployee(
  data: Parameters<typeof employeesService.createEmployee>[0],
  createdBy: string
) {
  return employeesService.createEmployee(data, createdBy);
}
export async function resendCredentials(
  employeeId: string,
  requestedBy: string
) {
  return employeesService.resendCredentials(employeeId, requestedBy);
}
export async function updateEmployee(
  employeeId: string,
  updates: Parameters<typeof employeesService.updateEmployee>[1],
  updatedBy: string
) {
  return employeesService.updateEmployee(employeeId, updates, updatedBy);
}
export async function deleteEmployee(
  employeeId: string,
  deletedBy: string,
  deleteAuthUser?: boolean
) {
  return employeesService.deleteEmployee(employeeId, deletedBy, deleteAuthUser);
}
export async function getCompensation(employeeId: string) {
  return employeesService.getCompensation(employeeId);
}
export async function updateCompensation(
  employeeId: string,
  compensation: Parameters<typeof employeesService.updateCompensation>[1],
  updatedBy: string
) {
  return employeesService.updateCompensation(
    employeeId,
    compensation,
    updatedBy
  );
}
export async function checkEmployeeExists(employeeId: string) {
  return employeesService.checkEmployeeExists(employeeId);
}
export async function getAllDepartments() {
  return employeesService.getAllDepartments();
}
export async function getEmployeesByDepartment() {
  return employeesService.getEmployeesByDepartment();
}
export async function getUpcomingBirthdays(
  days?: number,
  roleFilter?: 'employee' | 'management'
) {
  return employeesService.getUpcomingBirthdays(days, roleFilter);
}
export async function getUpcomingAnniversaries(
  days?: number,
  roleFilter?: 'employee' | 'management'
) {
  return employeesService.getUpcomingAnniversaries(days, roleFilter);
}
export async function getTenureStatistics() {
  return employeesService.getTenureStatistics();
}
