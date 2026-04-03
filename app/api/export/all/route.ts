import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonServerError } from '@/lib/api/response';
import * as exportService from '@/lib/services/export.service';

/** GET /api/export/all – export all employees' data (management only). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  try {
    const data = await exportService.exportAllEmployeesData();
    if (!data) return jsonError('Export failed', 500);
    return jsonSuccess(data);
  } catch (err) {
    console.error('API export all error:', err);
    return jsonServerError(err, { route: '/api/export/all', action: 'export-all' });
  }
}
