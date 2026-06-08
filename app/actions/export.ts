'use server';

import * as exportService from '@/lib/services/export.service';
import * as employeesService from '@/lib/services/employees.service';
import { isAdminRole, isStaffRole } from '@/lib/roles';
import { wrapFirebaseError } from '@/lib/firebase/errors';

export async function exportEmployeeData(employeeId: string, requestedById: string) {
  try {
    const actor = await employeesService.getEmployee(requestedById);
    if (!actor) throw new Error('Could not verify your account. Please sign out and sign in again.');
    if (!isStaffRole(actor.role) && actor.id !== employeeId) throw new Error('Forbidden');
    return await exportService.exportEmployeeData(employeeId);
  } catch (error: unknown) {
    throw wrapFirebaseError(error);
  }
}

export async function exportAllEmployeesData(requestedById: string) {
  try {
    const actor = await employeesService.getEmployee(requestedById);
    if (!actor) {
      throw new Error('Could not verify your account. The database may be temporarily unavailable.');
    }
    if (!isAdminRole(actor.role)) throw new Error('Forbidden — only administrators can export all employees.');
    return await exportService.exportAllEmployeesData();
  } catch (error: unknown) {
    throw wrapFirebaseError(error);
  }
}
