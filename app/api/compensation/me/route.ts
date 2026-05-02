import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonUnauthorized, jsonServerError } from '@/lib/api/response';
import { getCompensation } from '@/lib/services/employees.service';

/** GET /api/compensation/me — authenticated employee's own compensation (salary slip). */
export async function GET(_request: NextRequest) {
  const auth = await verifyAuth(_request);
  if (!auth) return jsonUnauthorized();

  try {
    const compensation = await getCompensation(auth.employeeId);
    return jsonSuccess({ compensation });
  } catch (err) {
    console.error('API compensation/me error:', err);
    return jsonServerError(err, { route: '/api/compensation/me', action: 'get-compensation-me' });
  }
}
