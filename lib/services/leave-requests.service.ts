/**
 * Leave requests — employee submissions and staff approvals (Firestore `leaveRequests`).
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { LeaveRequest, LeaveRequestKind, LeaveRequestSource, LeaveRequestStatus } from '@/types';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { getEmployee, getManagementUsers } from '@/lib/services/employees.service';
import { sendLeaveRequestSubmittedEmail } from '@/lib/services/email.service';
import { sendPushToEmployee } from '@/lib/services/push.service';

const LEAVE_KINDS: LeaveRequestKind[] = ['monthly', 'emergency', 'paid', 'unpaid'];

function parseLeaveKind(value: unknown): LeaveRequestKind {
  if (typeof value === 'string' && (LEAVE_KINDS as string[]).includes(value)) {
    return value as LeaveRequestKind;
  }
  return 'emergency';
}

/** Approved monthly or paid leave consumes accrued leave balance days. */
export function leaveKindDeductsBalance(kind: LeaveRequestKind): boolean {
  return kind === 'monthly' || kind === 'paid';
}

function toISO(v: unknown): string {
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === 'string') return v;
  return '';
}

function docToLeaveRequest(id: string, data: Record<string, unknown>): LeaveRequest {
  return {
    id,
    employeeId: data.employeeId as string,
    employeeName: (data.employeeName as string) || '',
    startDate: data.startDate as string,
    endDate: data.endDate as string,
    kind: parseLeaveKind(data.kind),
    reason: data.reason as string | undefined,
    status: (data.status as LeaveRequestStatus) || 'pending',
    source: (data.source as LeaveRequestSource) || 'employee',
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
    decidedBy: data.decidedBy as string | undefined,
    decidedAt: data.decidedAt ? toISO(data.decidedAt) : undefined,
    adminNote: data.adminNote as string | undefined,
  };
}

/** Inclusive calendar days between YYYY-MM-DD dates (min 1). */
export function inclusiveLeaveDays(startDate: string, endDate: string): number {
  const a = new Date(startDate.trim() + 'T12:00:00');
  const b = new Date(endDate.trim() + 'T12:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  if (b.getTime() < a.getTime()) return 0;
  const diff = Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

export async function createLeaveRequest(
  employeeId: string,
  payload: {
    startDate: string;
    endDate: string;
    kind: LeaveRequestKind;
    reason?: string;
  },
  actorId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    if (employeeId !== actorId) {
      return { success: false, error: 'You can only submit leave for your own account.' };
    }
    const actor = await getEmployee(actorId);
    if (!actor || actor.status !== 'active') {
      return { success: false, error: 'Unauthorized' };
    }
    if (actor.role !== 'employee') {
      return { success: false, error: 'Leave requests are for employee accounts only.' };
    }
    const emp = await getEmployee(employeeId);
    if (!emp) return { success: false, error: 'Employee not found' };

    const days = inclusiveLeaveDays(payload.startDate, payload.endDate);
    if (days < 1) {
      return { success: false, error: 'Invalid date range.' };
    }

    const ref = adminDb.collection('leaveRequests').doc();
    await ref.set({
      employeeId,
      employeeName: emp.displayName || '',
      startDate: payload.startDate.trim(),
      endDate: payload.endDate.trim(),
      kind: payload.kind,
      reason: payload.reason?.trim() || null,
      status: 'pending' as LeaveRequestStatus,
      source: 'employee' as LeaveRequestSource,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const nowIso = new Date().toISOString();
    try {
      const staff = await getManagementUsers();
      const staffEmails = [
        ...new Set(
          staff
            .filter((u) => u.status === 'active')
            .map((m) => m.email.trim())
            .filter((e) => e.includes('@'))
        ),
      ];
      if (staffEmails.length > 0) {
        const emailResult = await sendLeaveRequestSubmittedEmail(staffEmails, {
          employeeName: emp.displayName || 'Employee',
          employeeEmail: emp.email || '',
          startDate: payload.startDate.trim(),
          endDate: payload.endDate.trim(),
          kind: payload.kind,
          reason: payload.reason?.trim(),
          days,
          requestId: ref.id,
          submittedAt: nowIso,
        });
        if (!emailResult.success) {
          console.error('Failed to send leave request notification email:', emailResult.error);
        }
      } else {
        console.warn('No management/admin emails found for leave request notification');
      }
    } catch (notifyErr: unknown) {
      console.error('Leave request notification email error:', notifyErr);
    }

    return { success: true, id: ref.id };
  } catch (e: unknown) {
    const err = e as Error;
    console.error('createLeaveRequest', err);
    return { success: false, error: err.message };
  }
}

/** Staff logs absence-without-request as emergency leave (pending until reviewed). */
export async function createUnplannedLeaveRequest(
  employeeId: string,
  payload: { startDate: string; endDate: string; reason?: string },
  actorId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const actor = await getEmployee(actorId);
    if (!actor || (actor.role !== 'management' && actor.role !== 'admin')) {
      return { success: false, error: 'Only management or administrators can log unplanned leave.' };
    }
    const emp = await getEmployee(employeeId);
    if (!emp) return { success: false, error: 'Employee not found' };

    const days = inclusiveLeaveDays(payload.startDate, payload.endDate);
    if (days < 1) return { success: false, error: 'Invalid date range.' };

    const ref = adminDb.collection('leaveRequests').doc();
    await ref.set({
      employeeId,
      employeeName: emp.displayName || '',
      startDate: payload.startDate.trim(),
      endDate: payload.endDate.trim(),
      kind: 'emergency' as LeaveRequestKind,
      reason: payload.reason?.trim() || 'Recorded as unplanned absence (default: emergency).',
      status: 'pending' as LeaveRequestStatus,
      source: 'absence_default_emergency' as LeaveRequestSource,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByStaffId: actorId,
    });
    return { success: true, id: ref.id };
  } catch (e: unknown) {
    const err = e as Error;
    console.error('createUnplannedLeaveRequest', err);
    return { success: false, error: err.message };
  }
}

export async function getLeaveRequestsForEmployee(
  employeeId: string,
  limit: number = 50
): Promise<LeaveRequest[]> {
  try {
    const snap = await adminDb
      .collection('leaveRequests')
      .where('employeeId', '==', employeeId)
      .limit(limit)
      .get();
    const rows = snap.docs.map((d) => docToLeaveRequest(d.id, d.data() as Record<string, unknown>));
    rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return rows;
  } catch (e: unknown) {
    console.error('getLeaveRequestsForEmployee', e);
    return [];
  }
}

export async function getPendingLeaveRequests(): Promise<LeaveRequest[]> {
  try {
    const snap = await adminDb.collection('leaveRequests').where('status', '==', 'pending').get();
    const rows = snap.docs.map((d) => docToLeaveRequest(d.id, d.data() as Record<string, unknown>));
    rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return rows;
  } catch (e: unknown) {
    console.error('getPendingLeaveRequests', e);
    return [];
  }
}

export async function decideLeaveRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  actorId: string,
  options?: { kindOverride?: LeaveRequestKind; adminNote?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await getEmployee(actorId);
    if (!actor || (actor.role !== 'management' && actor.role !== 'admin')) {
      return { success: false, error: 'Only management or administrators can decide leave requests.' };
    }

    const ref = adminDb.collection('leaveRequests').doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: 'Request not found' };
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== 'pending') {
      return { success: false, error: 'This request is no longer pending.' };
    }

    const employeeId = data.employeeId as string;
    const startDate = data.startDate as string;
    const endDate = data.endDate as string;
    let kind = parseLeaveKind(data.kind);
    if (options?.kindOverride) kind = options.kindOverride;

    if (decision === 'rejected') {
      await ref.update({
        status: 'rejected' as LeaveRequestStatus,
        kind,
        decidedBy: actorId,
        decidedAt: FieldValue.serverTimestamp(),
        adminNote: options?.adminNote?.trim() || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Notify the employee that their leave request was rejected.
      sendPushToEmployee(employeeId, {
        title: 'Leave request rejected',
        body:
          options?.adminNote?.trim() ||
          `Your ${kind} leave from ${startDate} to ${endDate} was not approved.`,
        screen: 'LeaveRequests',
        type: 'leave-rejected',
        extra: { requestId, status: 'rejected' },
      }).catch((e) => console.error('[Leave] push reject failed:', e));
      return { success: true };
    }

    // approved — transaction: approve + deduct monthly leave days from balance
    const days = inclusiveLeaveDays(startDate, endDate);
    await adminDb.runTransaction(async (tx) => {
      const reqRef = adminDb.collection('leaveRequests').doc(requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error('Request not found');
      const rd = reqSnap.data() as Record<string, unknown>;
      if (rd.status !== 'pending') throw new Error('This request is no longer pending.');

      tx.update(reqRef, {
        status: 'approved' as LeaveRequestStatus,
        kind,
        decidedBy: actorId,
        decidedAt: FieldValue.serverTimestamp(),
        adminNote: options?.adminNote?.trim() || null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (leaveKindDeductsBalance(kind) && days > 0) {
        const compRef = adminDb.collection('compensation').doc(employeeId);
        const compSnap = await tx.get(compRef);
        let cur = 0;
        if (compSnap.exists) {
          const v = compSnap.data()?.leaveBalance;
          if (v != null && v !== '') cur = Number(v);
        }
        const next = Math.max(0, cur - days);
        const compMerge: Record<string, unknown> = {
          leaveBalance: next,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actorId,
        };
        if (!compSnap.exists) {
          compMerge.employeeId = employeeId;
          compMerge.salary = 0;
          compMerge.currency = DEFAULT_CURRENCY;
        }
        tx.set(compRef, compMerge, { merge: true });
      }
    });
    // Notify the employee that their leave was approved.
    sendPushToEmployee(employeeId, {
      title: 'Leave approved',
      body:
        options?.adminNote?.trim() ||
        `Your ${kind} leave from ${startDate} to ${endDate} was approved.`,
      screen: 'LeaveRequests',
      type: 'leave-approved',
      extra: { requestId, status: 'approved' },
    }).catch((e) => console.error('[Leave] push approve failed:', e));
    return { success: true };
  } catch (e: unknown) {
    const err = e as Error;
    console.error('decideLeaveRequest', err);
    return { success: false, error: err.message };
  }
}

export async function updateLeaveRequestMeta(
  requestId: string,
  updates: { kind?: LeaveRequestKind; status?: LeaveRequestStatus; adminNote?: string },
  actorId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await getEmployee(actorId);
    if (!actor || (actor.role !== 'management' && actor.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const ref = adminDb.collection('leaveRequests').doc(requestId);
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (updates.kind) patch.kind = updates.kind;
    if (updates.status) patch.status = updates.status;
    if (updates.adminNote !== undefined) patch.adminNote = updates.adminNote || null;
    await ref.update(patch);
    return { success: true };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, error: err.message };
  }
}
