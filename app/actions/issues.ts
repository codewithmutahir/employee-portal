'use server';

import * as issuesService from '@/lib/services/issues.service';

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
export async function getIssues() {
  return issuesService.getIssues();
}
export async function updateIssueStatus(
  issueId: string,
  status: Parameters<typeof issuesService.updateIssueStatus>[1],
  managementNote?: string
) {
  return issuesService.updateIssueStatus(issueId, status, managementNote);
}
