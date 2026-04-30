import { NextRequest } from 'next/server';
import { verifyAuth, requireAdmin } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonServerError } from '@/lib/api/response';
import * as exportService from '@/lib/services/export.service';

/** GET /api/export/all – export all employees' data (admin only). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!requireAdmin(auth)) return jsonUnauthorized();

  try {
    const data = await exportService.exportAllEmployeesData();
    if (!data) return jsonError('Export failed', 500);
    return jsonSuccess(data);
  } catch (err) {
    console.error('API export all error:', err);
    return jsonServerError(err, { route: '/api/export/all', action: 'export-all' });
  }
}
