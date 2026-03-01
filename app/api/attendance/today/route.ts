import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonUnauthorized } from '@/lib/api/response';
import * as attendanceService from '@/lib/services/attendance.service';

/** GET /api/attendance/today?date=YYYY-MM-DD – today's (or date) attendance for the authenticated employee. */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  const dateOverride = request.nextUrl.searchParams.get('date') ?? undefined;

  try {
    const data = await attendanceService.getTodayAttendance(auth.employeeId, dateOverride);
    return jsonSuccess(data);
  } catch (err) {
    console.error('API attendance today error:', err);
    return jsonSuccess(null);
  }
}
