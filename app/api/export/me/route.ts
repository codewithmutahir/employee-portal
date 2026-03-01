import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as exportService from '@/lib/services/export.service';

/** GET /api/export/me – export authenticated employee's data (employee + compensation + attendance). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const data = await exportService.exportEmployeeData(auth.employeeId);
    if (!data) return jsonError('Export data not found', 404);
    return jsonSuccess(data);
  } catch (err) {
    console.error('API export me error:', err);
    return jsonError('Internal server error', 500);
  }
}
