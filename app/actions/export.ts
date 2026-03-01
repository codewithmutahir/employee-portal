'use server';

import * as exportService from '@/lib/services/export.service';

export async function exportEmployeeData(employeeId: string) {
  return exportService.exportEmployeeData(employeeId);
}
export async function exportAllEmployeesData() {
  return exportService.exportAllEmployeesData();
}
