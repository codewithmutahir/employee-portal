import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonUnauthorized } from '@/lib/api/response';
import * as attendanceService from '@/lib/services/attendance.service';

/** GET /api/attendance/history?limit=30 – attendance history for the authenticated employee. */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 30)) : 30;

  try {
    const data = await attendanceService.getAttendanceHistory(auth.employeeId, limit);
    return jsonSuccess(data);
  } catch (err) {
    console.error('API attendance history error:', err);
    return jsonSuccess([]);
  }
}
