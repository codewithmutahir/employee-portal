'use server';

import * as exportService from '@/lib/services/export.service';
import * as employeesService from '@/lib/services/employees.service';
import { isAdminRole, isStaffRole } from '@/lib/roles';

export async function exportEmployeeData(employeeId: string, requestedById: string) {
  const actor = await employeesService.getEmployee(requestedById);
  if (!actor) throw new Error('Unauthorized');
  if (!isStaffRole(actor.role) && actor.id !== employeeId) throw new Error('Forbidden');
  return exportService.exportEmployeeData(employeeId);
}

export async function exportAllEmployeesData(requestedById: string) {
  const actor = await employeesService.getEmployee(requestedById);
  if (!actor || !isAdminRole(actor.role)) throw new Error('Forbidden');
  return exportService.exportAllEmployeesData();
}
