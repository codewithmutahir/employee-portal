'use server';

import type { LeaveRequestKind, LeaveRequestStatus } from '@/types';
import * as leaveRequestsService from '@/lib/services/leave-requests.service';
import * as employeesService from '@/lib/services/employees.service';

async function assertStaff(
  actorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await employeesService.getEmployee(actorId);
  if (!actor) return { ok: false, error: 'Unauthorized' };
  if (actor.role !== 'management' && actor.role !== 'admin') {
    return { ok: false, error: 'Unauthorized' };
  }
  return { ok: true };
}

export async function createMyLeaveRequest(
  employeeId: string,
  payload: {
    startDate: string;
    endDate: string;
    kind: LeaveRequestKind;
    reason?: string;
  },
  actorId: string
) {
  return leaveRequestsService.createLeaveRequest(employeeId, payload, actorId);
}

export async function getMyLeaveRequests(employeeId: string, actorId: string) {
  if (employeeId !== actorId) return [];
  return leaveRequestsService.getLeaveRequestsForEmployee(employeeId, 40);
}

export async function getPendingLeaveRequestsForStaff(actorId: string) {
  const gate = await assertStaff(actorId);
  if (!gate.ok) return [];
  return leaveRequestsService.getPendingLeaveRequests();
}

export async function staffDecideLeaveRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  actorId: string,
  options?: { kindOverride?: LeaveRequestKind; adminNote?: string }
) {
  const gate = await assertStaff(actorId);
  if (!gate.ok) return { success: false as const, error: gate.error };
  return leaveRequestsService.decideLeaveRequest(requestId, decision, actorId, options);
}

export async function staffCreateUnplannedLeave(
  employeeId: string,
  payload: { startDate: string; endDate: string; reason?: string },
  actorId: string
) {
  const gate = await assertStaff(actorId);
  if (!gate.ok) return { success: false as const, error: gate.error };
  return leaveRequestsService.createUnplannedLeaveRequest(employeeId, payload, actorId);
}

export async function staffUpdateLeaveRequestMeta(
  requestId: string,
  updates: { kind?: LeaveRequestKind; status?: LeaveRequestStatus; adminNote?: string },
  actorId: string
) {
  const gate = await assertStaff(actorId);
  if (!gate.ok) return { success: false as const, error: gate.error };
  return leaveRequestsService.updateLeaveRequestMeta(requestId, updates, actorId);
}
