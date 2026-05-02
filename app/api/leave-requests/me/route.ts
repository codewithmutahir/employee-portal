import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonForbidden, jsonServerError } from '@/lib/api/response';
import type { LeaveRequestKind } from '@/types';
import * as leaveRequestsService from '@/lib/services/leave-requests.service';

const KINDS: LeaveRequestKind[] = ['monthly', 'emergency', 'paid', 'unpaid'];

function parseKind(v: unknown): LeaveRequestKind | null {
  if (typeof v === 'string' && (KINDS as string[]).includes(v)) return v as LeaveRequestKind;
  return null;
}

/** GET /api/leave-requests/me — list own leave requests (employees only). */
export async function GET(_request: NextRequest) {
  const auth = await verifyAuth(_request);
  if (!auth) return jsonUnauthorized();
  if (auth.role !== 'employee') {
    return jsonForbidden('Leave requests list is only for employee accounts.');
  }

  try {
    const leaveRequests = await leaveRequestsService.getLeaveRequestsForEmployee(auth.employeeId, 40);
    return jsonSuccess({ leaveRequests });
  } catch (err) {
    console.error('API leave-requests/me GET error:', err);
    return jsonServerError(err, { route: '/api/leave-requests/me', action: 'list-leave-me' });
  }
}

/** POST /api/leave-requests/me — submit leave request (employees only). */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();
  if (auth.role !== 'employee') {
    return jsonForbidden('Only employees can submit leave requests from the app.');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const startDate = typeof body.startDate === 'string' ? body.startDate.trim() : '';
    const endDate = typeof body.endDate === 'string' ? body.endDate.trim() : '';
    const kind = parseKind(body.kind);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined;

    if (!startDate || !endDate) {
      return jsonError('startDate and endDate are required (YYYY-MM-DD).');
    }
    if (!kind) {
      return jsonError(`kind must be one of: ${KINDS.join(', ')}`);
    }

    const result = await leaveRequestsService.createLeaveRequest(
      auth.employeeId,
      { startDate, endDate, kind, reason: reason || undefined },
      auth.employeeId
    );

    if (!result.success) {
      return jsonError(result.error ?? 'Could not create leave request', 400);
    }
    return jsonSuccess({ id: result.id });
  } catch (err) {
    console.error('API leave-requests/me POST error:', err);
    return jsonServerError(err, { route: '/api/leave-requests/me', action: 'create-leave-me' });
  }
}
