import type { UserRole } from '@/types';

/** Users that should always resolve as administrators regardless of stored role. */
export const DESIGNATED_ADMIN_UIDS = new Set<string>([
  '8mngxDs8DWYqpmfbCeU4vw6hBb82',
  'lgRAJpZuImUVHdE40XBPB2ekeai1',
  'hyNhrHfhoYN710bJMyywrgXT4xl2',
]);

export function resolveUserRole(uid: string, stored: UserRole): UserRole {
  if (DESIGNATED_ADMIN_UIDS.has(uid)) return 'admin';
  return stored;
}

export function isStaffRole(role: UserRole): boolean {
  return role === 'management' || role === 'admin';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}
