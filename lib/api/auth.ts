/**
 * API auth – verify Firebase ID token and resolve employee for role.
 * Use in all protected API routes.
 */

import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { getEmployee } from '@/lib/services/employees.service';

export interface AuthResult {
  employeeId: string;
  email: string;
  displayName: string;
  role: 'employee' | 'management';
  department?: string;
}

/**
 * Read Authorization: Bearer <token>, verify with Firebase Admin, load employee for role.
 * Returns null if missing/invalid token or employee not found.
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const employeeId = decoded.uid;

    const employee = await getEmployee(employeeId);
    if (!employee || employee.status === 'terminated') return null;

    return {
      employeeId,
      email: employee.email,
      displayName: employee.displayName,
      role: employee.role,
      department: employee.department,
    };
  } catch {
    return null;
  }
}

/** Require management role; returns null if not management. */
export function requireManagement(auth: AuthResult): AuthResult | null {
  return auth.role === 'management' ? auth : null;
}
