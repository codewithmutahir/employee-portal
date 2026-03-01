import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import { getEmployee } from '@/lib/services/employees.service';
import * as profileService from '@/lib/services/profile.service';

/** GET /api/profile – get authenticated employee profile, emergency contacts, and notification preferences. */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const [employee, emergencyContacts, notificationPreferences] = await Promise.all([
      getEmployee(auth.employeeId),
      profileService.getEmergencyContacts(auth.employeeId),
      profileService.getNotificationPreferences(auth.employeeId),
    ]);
    if (!employee) return jsonError('Profile not found', 404);
    return jsonSuccess({
      employee,
      emergencyContacts,
      notificationPreferences,
    });
  } catch (err) {
    console.error('API get profile error:', err);
    return jsonError('Internal server error', 500);
  }
}

/** PATCH /api/profile – update profile, password, photo, or notification preferences. Body: partial profile fields, or { newPassword }, or { profilePhotoUrl }, or { notificationPreferences }. */
export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const body = await request.json().catch(() => ({}));

    if (body.newPassword !== undefined) {
      const result = await profileService.changePassword(auth.employeeId, body.newPassword);
      if (!result.success) return jsonError(result.error ?? 'Failed to change password', 400);
      return jsonSuccess({});
    }

    if (body.profilePhotoUrl !== undefined) {
      const result = await profileService.updateProfilePhoto(auth.employeeId, body.profilePhotoUrl);
      if (!result.success) return jsonError(result.error ?? 'Failed to update photo', 400);
      return jsonSuccess({});
    }

    if (body.notificationPreferences !== undefined && typeof body.notificationPreferences === 'object') {
      const result = await profileService.updateNotificationPreferences(
        auth.employeeId,
        body.notificationPreferences
      );
      if (!result.success) return jsonError(result.error ?? 'Failed to update preferences', 400);
      return jsonSuccess({});
    }

    const profileUpdates: Record<string, unknown> = {};
    const allowed = [
      'displayName', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'country',
      'personalEmail', 'preferredName', 'pronouns', 'bio', 'skills', 'languages', 'socialLinks',
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) profileUpdates[key] = body[key];
    }
    if (Object.keys(profileUpdates).length === 0) {
      return jsonError('No valid profile updates provided');
    }
    const result = await profileService.updateOwnProfile(auth.employeeId, profileUpdates as Parameters<typeof profileService.updateOwnProfile>[1]);
    if (!result.success) return jsonError(result.error ?? 'Failed to update profile', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API update profile error:', err);
    return jsonError('Internal server error', 500);
  }
}
