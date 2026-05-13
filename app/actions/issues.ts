'use server';

import * as issuesService from '@/lib/services/issues.service';
import { getEmployee } from '@/lib/services/employees.service';
import { isStaffRole } from '@/lib/roles';

export async function createIssue(
  data: Parameters<typeof issuesService.createIssue>[0],
  employeeId: string,
  employeeName: string,
  employeeEmail: string
) {
  return issuesService.createIssue(
    data,
    employeeId,
    employeeName,
    employeeEmail
  );
}

export async function getIssues(requestedById: string) {
  const actor = await getEmployee(requestedById);
  if (!actor || !isStaffRole(actor.role)) {
    throw new Error('Forbidden');
  }
  return issuesService.getIssues();
}

export async function getMyIssues(employeeId: string, requestedById: string) {
  if (employeeId !== requestedById) {
    throw new Error('Forbidden');
  }
  return issuesService.getIssuesByReporter(employeeId);
}

export async function updateIssueStatus(
  issueId: string,
  status: Parameters<typeof issuesService.updateIssueStatus>[1],
  managementNote: string | undefined,
  requestedById: string,
  updatedByName: string
) {
  const actor = await getEmployee(requestedById);
  if (!actor || !isStaffRole(actor.role)) {
    throw new Error('Forbidden');
  }
  return issuesService.updateIssueStatus(issueId, status, managementNote, {
    updatedByName,
  });
}
