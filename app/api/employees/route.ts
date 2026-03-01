import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as employeesService from '@/lib/services/employees.service';

/** GET /api/employees – list employees (management only). Query: excludeManagement=true. */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  const excludeManagement = request.nextUrl.searchParams.get('excludeManagement') !== 'false';

  try {
    const data = await employeesService.getAllEmployees(excludeManagement);
    return jsonSuccess(data);
  } catch (err) {
    console.error('API get employees error:', err);
    return jsonError('Internal server error', 500);
  }
}

/** POST /api/employees – create employee (management only). Body: { email, password, displayName, role, department?, position?, phoneNumber?, dateOfBirth?, hireDate }. */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  try {
    const body = await request.json();
    const email = body?.email;
    const password = body?.password;
    const displayName = body?.displayName;
    const role = body?.role ?? 'employee';
    const hireDate = body?.hireDate;
    if (!email || !password || !displayName || !hireDate) {
      return jsonError('email, password, displayName, hireDate required');
    }
    const result = await employeesService.createEmployee(
      {
        email,
        password,
        displayName,
        role,
        department: body?.department,
        position: body?.position,
        phoneNumber: body?.phoneNumber,
        dateOfBirth: body?.dateOfBirth,
        hireDate,
      },
      auth.employeeId
    );
    if (!result.success) return jsonError(result.error ?? 'Failed to create employee', 400);
    return jsonSuccess({ userId: result.userId });
  } catch (err) {
    console.error('API create employee error:', err);
    return jsonError('Internal server error', 500);
  }
}
