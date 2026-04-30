import { NextRequest } from 'next/server';
import { verifyAuth, requireStaff, requireAdmin } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonServerError } from '@/lib/api/response';
import * as employeesService from '@/lib/services/employees.service';

/** GET /api/employees/:id – get one employee (management only, or self). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Employee id required');

  if (id !== auth.employeeId && !requireStaff(auth)) {
    return jsonError('Forbidden', 403);
  }

  try {
    const data = await employeesService.getEmployee(id);
    if (!data) return jsonError('Employee not found', 404);
    return jsonSuccess(data);
  } catch (err) {
    console.error('API get employee error:', err);
    return jsonServerError(err, { route: '/api/employees/[id]', action: 'get-employee' });
  }
}

/** PATCH /api/employees/:id – update employee (admin only). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  const admin = requireAdmin(auth);
  if (!admin) return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Employee id required');

  try {
    const body = await request.json().catch(() => ({}));
    const result = await employeesService.updateEmployee(id, body, admin.employeeId);
    if (!result.success) return jsonError(result.error ?? 'Failed to update employee', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API update employee error:', err);
    return jsonServerError(err, { route: '/api/employees/[id]', action: 'update-employee' });
  }
}

/** DELETE /api/employees/:id – delete employee (management only). Body: { deleteAuthUser?: boolean }. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  const admin = requireAdmin(auth);
  if (!admin) return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Employee id required');

  try {
    const body = await request.json().catch(() => ({}));
    const deleteAuthUser = body?.deleteAuthUser !== false;
    const result = await employeesService.deleteEmployee(id, admin.employeeId, deleteAuthUser);
    if (!result.success) return jsonError(result.error ?? 'Failed to delete employee', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API delete employee error:', err);
    return jsonServerError(err, { route: '/api/employees/[id]', action: 'delete-employee' });
  }
}
