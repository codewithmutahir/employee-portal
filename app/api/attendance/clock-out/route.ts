import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as attendanceService from '@/lib/services/attendance.service';

/** POST /api/attendance/clock-out – clock out for the authenticated employee. Body: { dateOverride?: string }. */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const dateOverride = typeof body.dateOverride === 'string' ? body.dateOverride : undefined;
    const result = await attendanceService.clockOut(auth.employeeId, dateOverride);
    if (!result.success) return jsonError(result.error ?? 'Clock out failed', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API clock-out error:', err);
    return jsonError('Internal server error', 500);
  }
}
