import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import {
  jsonError,
  jsonServerError,
  jsonSuccess,
  jsonUnauthorized,
} from '@/lib/api/response';
import { sendPushToEmployee } from '@/lib/services/push.service';
import { adminDb } from '@/lib/firebase/admin';

/**
 * POST /api/push/test
 *
 * Sends a test push to the *calling* employee (and only them). Used by the
 * mobile NotificationSettings screen to verify the full delivery pipeline:
 *
 *   App → /api/push/test → push.service → Expo Push API → FCM v1 → Device
 *
 * If this returns `success` but the device never sees a notification, the
 * issue is almost always missing FCM v1 credentials on EAS. See
 * `employee portal app/PUSH_NOTIFICATIONS_SETUP.md`.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    // Read the live token off the employee doc so we don't accidentally test
    // a stale device that this user has uninstalled. If it's missing, return
    // a precise error so the client can show "register first".
    const snap = await adminDb.collection('employees').doc(auth.employeeId).get();
    const token = snap.exists ? (snap.data()?.expoPushToken as string | undefined) : undefined;
    if (!token || !token.startsWith('ExponentPushToken[')) {
      return jsonError(
        'No push token on file. Make sure notifications are allowed and re-open the app to re-register.',
        409
      );
    }

    const result = await sendPushToEmployee(auth.employeeId, {
      title: 'Test notification',
      body: `Hi ${auth.displayName.split(/\s+/)[0] || 'there'}, this is a delivery check from the Employee Portal.`,
      screen: 'Profile',
      type: 'push-test',
    });

    if (!result || result.sent === 0) {
      return jsonError(
        result?.errors?.[0]?.message ??
          'Expo accepted no tickets. Check EAS push credentials (FCM V1 service account).',
        502
      );
    }

    return jsonSuccess({
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed,
      ticketIds: result.ticketIds,
    });
  } catch (err) {
    return jsonServerError(err, { route: '/api/push/test', action: 'push-test' });
  }
}
