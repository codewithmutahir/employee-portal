import type { UserRole } from '@/types';

/** User designated to always resolve as administrator (elevated from stored management role if needed). */
export const DESIGNATED_ADMIN_UID = '8mngxDs8DWYqpmfbCeU4vw6hBb82';

export function resolveUserRole(uid: string, stored: UserRole): UserRole {
  if (uid === DESIGNATED_ADMIN_UID && stored === 'management') return 'admin';
  return stored;
}

export function isStaffRole(role: UserRole): boolean {
  return role === 'management' || role === 'admin';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}
